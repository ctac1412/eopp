<#
.SYNOPSIS
Verify that the active production release is coherent.

.DESCRIPTION
Checks the current symlink, current/release.json, Docker Compose state, HTTP
health, plugin update endpoint, SQLite readability, Alembic current output, and
the backup referenced by release.json.
#>

param(
    [string]$ReleaseId
)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\release.ps1"
Require-SSHHost
Check-SSH

$localScript = Join-Path $env:TEMP "eopp-verify-$([guid]::NewGuid().ToString('N')).sh"
$remoteScript = "/tmp/$(Split-Path -Leaf $localScript)"
$scriptContent = @'
set -e
REMOTE_CURRENT_LINK="__REMOTE_CURRENT_LINK__"
REMOTE_DIR="__REMOTE_DIR__"
REMOTE_SHARED_DIR="__REMOTE_SHARED_DIR__"
IMAGE_FALLBACK="__IMAGE_FULL__"
EXPECTED_RELEASE_ID="__RELEASE_ID__"
HEALTH_RETRIES=__HEALTH_RETRIES__
HEALTH_INTERVAL=__HEALTH_INTERVAL__

test -L "$REMOTE_CURRENT_LINK"
test -f "$REMOTE_CURRENT_LINK/release.json"
cd "$REMOTE_DIR"
docker compose ps

http_code=000
for attempt in $(seq 1 "$HEALTH_RETRIES"); do
  http_code=$(curl -sk -o /dev/null -w '%{http_code}' https://localhost:8765/ || true)
  case "$http_code" in 200|301|302) break ;; esac
  sleep "$HEALTH_INTERVAL"
done
case "$http_code" in 200|301|302) ;; *) echo "bad http code: $http_code"; exit 20 ;; esac

version_file=$(mktemp)
curl -sk https://localhost:8765/api/version > "$version_file"
plugins_code=$(curl -sk -o /dev/null -w '%{http_code}' https://localhost:8765/plugins/update.xml || true)
case "$plugins_code" in 200|404) ;; *) echo "bad plugins/update.xml code: $plugins_code"; exit 21 ;; esac

REMOTE_CURRENT_LINK="$REMOTE_CURRENT_LINK" REMOTE_SHARED_DIR="$REMOTE_SHARED_DIR" EXPECTED_RELEASE_ID="$EXPECTED_RELEASE_ID" VERSION_FILE="$version_file" python3 - <<'PY'
import json, os, pathlib, sqlite3

manifest = json.load(open(pathlib.Path(os.environ["REMOTE_CURRENT_LINK"]) / "release.json"))
expected = os.environ.get("EXPECTED_RELEASE_ID") or ""
if expected and manifest.get("release_id") != expected:
    raise SystemExit("release_id mismatch: {} != {}".format(manifest.get("release_id"), expected))
try:
    version = json.load(open(os.environ["VERSION_FILE"]))
except json.JSONDecodeError as exc:
    raise SystemExit("/api/version returned invalid json: {}".format(exc)) from exc
if version.get("release_id") != manifest.get("release_id"):
    raise SystemExit("release_id mismatch: /api/version {} != manifest {}".format(version.get("release_id"), manifest.get("release_id")))
if version.get("git_sha") != manifest.get("git_sha"):
    raise SystemExit("git_sha mismatch: /api/version {} != manifest {}".format(version.get("git_sha"), manifest.get("git_sha")))
if version.get("image") != manifest.get("image"):
    raise SystemExit("image mismatch: /api/version {} != manifest {}".format(version.get("image"), manifest.get("image")))
db_backup = manifest.get("db_backup")
if not db_backup:
    raise SystemExit("db_backup missing from release.json")
backup_path = pathlib.Path(os.environ["REMOTE_SHARED_DIR"]) / "backups" / db_backup
if not backup_path.exists():
    raise SystemExit("backup for this release is missing: {}".format(backup_path))
db = pathlib.Path(os.environ["REMOTE_SHARED_DIR"]) / "data" / "api_keys.db"
if db.exists():
    conn = sqlite3.connect(db)
    try:
        result = conn.execute("PRAGMA integrity_check").fetchone()[0]
        if result != "ok":
            raise SystemExit("sqlite integrity_check failed: {}".format(result))
    finally:
        conn.close()
print("current/release.json and /api/version ok")
PY
rm -f "$version_file"

release_image=$(REMOTE_CURRENT_LINK="$REMOTE_CURRENT_LINK" IMAGE_FALLBACK="$IMAGE_FALLBACK" python3 - <<'PY'
import json, os, pathlib

manifest = pathlib.Path(os.environ["REMOTE_CURRENT_LINK"]) / "release.json"
if manifest.exists():
    print(json.load(open(manifest)).get("image") or os.environ["IMAGE_FALLBACK"])
else:
    print(os.environ["IMAGE_FALLBACK"])
PY
)
EOPP_IMAGE="$release_image" docker compose run --rm -e EOPP_AUTO_MIGRATE=0 eopp-prod python -m alembic -c server/alembic.ini current
'@
$scriptContent = $scriptContent.
    Replace("__REMOTE_CURRENT_LINK__", $script:RemoteCurrentLink).
    Replace("__REMOTE_DIR__", $script:RemoteDir).
    Replace("__REMOTE_SHARED_DIR__", $script:RemoteSharedDir).
    Replace("__IMAGE_FULL__", $script:ImageFull).
    Replace("__RELEASE_ID__", $ReleaseId).
    Replace("__HEALTH_RETRIES__", [string]$script:HealthCheckRetries).
    Replace("__HEALTH_INTERVAL__", [string]$script:HealthCheckInterval)
$scriptContent = $scriptContent -replace "`r`n", "`n"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($localScript, $scriptContent, $utf8NoBom)
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $localScript "${script:SshTarget}:${remoteScript}"
Require-Success $LASTEXITCODE "Failed to upload release verification script"
Remove-Item -LiteralPath $localScript -Force

$output = Remote-Exec "bash '$remoteScript'; rc=`$?; rm -f '$remoteScript'; exit `$rc"
if ($LASTEXITCODE -ne 0) {
    Log-Error "Release verification failed"
    Write-Host $output
    exit 1
}
Write-Host $output
Log-Success "Release verification passed"
