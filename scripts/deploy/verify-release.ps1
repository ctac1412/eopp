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

$cmd = @"
set -e
test -L '$script:RemoteCurrentLink'
test -f '$script:RemoteCurrentLink/release.json'
cd '$script:RemoteDir'
docker compose ps
http_code=""
for attempt in `$(seq 1 $script:HealthCheckRetries); do
  http_code=`$(curl -sk -o /dev/null -w '%{http_code}' https://localhost:8765/ || true)
  case "`$http_code" in 200|301|302) break ;; esac
  sleep $script:HealthCheckInterval
done
case "`$http_code" in 200|301|302) ;; *) echo "bad http code: `$http_code"; exit 20 ;; esac
version_json=`$(curl -sk https://localhost:8765/version || true)
plugins_code=`$(curl -sk -o /dev/null -w '%{http_code}' https://localhost:8765/plugins/update.xml || true)
case "`$plugins_code" in 200|404) ;; *) echo "bad plugins/update.xml code: `$plugins_code"; exit 21 ;; esac
VERSION_JSON="`$version_json" python3 - <<'PY'
import json, os, pathlib, sqlite3, sys
manifest = json.load(open('$script:RemoteCurrentLink/release.json'))
expected = '$ReleaseId'
if expected and manifest.get('release_id') != expected:
    raise SystemExit('release_id mismatch: {} != {}'.format(manifest.get('release_id'), expected))
try:
    version = json.loads(os.environ.get('VERSION_JSON') or '{}')
except json.JSONDecodeError as exc:
    raise SystemExit('/version returned invalid json: {}'.format(exc)) from exc
if version.get('release_id') != manifest.get('release_id'):
    raise SystemExit('release_id mismatch: /version {} != manifest {}'.format(version.get('release_id'), manifest.get('release_id')))
if version.get('git_sha') != manifest.get('git_sha'):
    raise SystemExit('git_sha mismatch: /version {} != manifest {}'.format(version.get('git_sha'), manifest.get('git_sha')))
if version.get('image') != manifest.get('image'):
    raise SystemExit('image mismatch: /version {} != manifest {}'.format(version.get('image'), manifest.get('image')))
db_backup = manifest.get('db_backup')
if not db_backup:
    raise SystemExit('db_backup missing from release.json')
backup_path = pathlib.Path('$script:RemoteSharedDir/backups') / db_backup
if not backup_path.exists():
    raise SystemExit('backup for this release is missing: {}'.format(backup_path))
db = pathlib.Path('$script:RemoteSharedDir/data/api_keys.db')
if db.exists():
    conn = sqlite3.connect(db)
    try:
        conn.execute('PRAGMA integrity_check').fetchone()
    finally:
        conn.close()
print('current/release.json and /version ok')
PY
docker compose run --rm -e EOPP_AUTO_MIGRATE=0 eopp-prod python -m alembic -c server/alembic.ini current
"@

$output = Remote-Exec $cmd
if ($LASTEXITCODE -ne 0) {
    Log-Error "Release verification failed"
    Write-Host $output
    exit 1
}
Write-Host $output
Log-Success "Release verification passed"
