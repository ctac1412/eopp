<#
.SYNOPSIS
Shared release-state helpers for EOPP production delivery.

.DESCRIPTION
This file defines the Phase 9 delivery contract: a release id in the
YYYYMMDD_HHMMSS-<short_git_sha> format, a release.json manifest, checksums,
mandatory remote backups, and a diff summary before promotion. The release
bundle treats code, database, JSON content, and plugins as one promotable
production state.
#>

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"

function Get-GitSha {
    # Return the short git SHA used to bind a release to local code.
    Push-Location $ProjectRoot
    try {
        $sha = git rev-parse --short HEAD
        if ($LASTEXITCODE -ne 0 -or -not $sha) { return "nogit" }
        return $sha.Trim()
    } finally {
        Pop-Location
    }
}

function New-ReleaseId {
    # Create a stable release_id: YYYYMMDD_HHMMSS-<short_git_sha>.
    param([string]$GitSha = $(Get-GitSha))
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    return "$timestamp-$GitSha"
}

function Get-FileSha256 {
    # Return a file SHA-256 or an empty string when the file is absent.
    param([string]$Path)
    if (-not (Test-Path $Path)) { return "" }
    return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

function Get-DirectorySha256 {
    # Return one SHA-256 for a directory tree by hashing relative paths and file hashes.
    param([string]$Path)
    if (-not (Test-Path $Path)) { return "" }
    $entries = Get-ChildItem -LiteralPath $Path -Recurse -File | Sort-Object FullName | ForEach-Object {
        if ($_.Name -match '\.db-(wal|shm)$') { return }
        $relative = $_.FullName.Substring((Resolve-Path $Path).Path.Length).TrimStart("\", "/")
        try {
            "$relative=$((Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant())"
        } catch {
            "SKIPPED_LOCKED:$relative"
        }
    }
    if (-not $entries) { return "" }
    $joined = [string]::Join([Environment]::NewLine, $entries)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
}

function Get-LocalTableCounts {
    # Read local SQLite table counts for the deploy diff summary.
    param([string]$DbPath)
    if (-not (Test-Path $DbPath)) { return @{} }
    $sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if (-not $sqlite) { return @{ "_warning" = "sqlite3 not found locally" } }
    $tables = & sqlite3 $DbPath "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    $counts = @{}
    foreach ($table in $tables) {
        if ($table) {
            $counts[$table] = (& sqlite3 $DbPath "SELECT COUNT(*) FROM '$table';").Trim()
        }
    }
    return $counts
}

function Get-RemoteTableCountsJson {
    # Return remote SQLite table counts as JSON for the deploy diff summary.
    $cmd = @"
python3 - <<'PY'
import json, os, sqlite3
db = '$script:RemoteSharedDir/data/api_keys.db'
if not os.path.exists(db):
    print('{}')
    raise SystemExit
conn = sqlite3.connect(db)
try:
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    print(json.dumps({t: conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables}, sort_keys=True))
finally:
    conn.close()
PY
"@
    return (Remote-Exec $cmd 2>$null)
}

function Show-ReleaseDiffSummary {
    # Print the code, DB, JSON, and plugin state that will be promoted.
    param(
        [string]$ReleaseId,
        [string]$LocalDbPath,
        [string]$PluginsDir,
        [string]$DataDir
    )
    Write-Header "Release diff summary before push: $ReleaseId"
    Push-Location $ProjectRoot
    try {
        git status --short
        git diff --stat HEAD
    } finally {
        Pop-Location
    }
    $localCounts = Get-LocalTableCounts -DbPath $LocalDbPath
    $remoteCounts = Get-RemoteTableCountsJson
    Log-Info "Local DB table counts: $($localCounts | ConvertTo-Json -Compress)"
    Log-Info "Remote DB table counts: $remoteCounts"
    Log-Info "Local data sha256: $(Get-DirectorySha256 -Path $DataDir)"
    Log-Info "Local plugins sha256: $(Get-DirectorySha256 -Path $PluginsDir)"
}

function Invoke-RemoteBackup {
    # Create the mandatory remote backup tied to a candidate release.
    param([string]$ReleaseId)
    $backupId = "backup_$((Get-Date).ToString('yyyyMMdd_HHmmss'))_$ReleaseId"
    $cmd = @"
set -e
backup_dir='$script:RemoteSharedDir/backups/$backupId'
mkdir -p "`$backup_dir"
mkdir -p '$script:RemoteSharedDir/data' '$script:RemoteSharedDir/certs'
if [ -f '$script:RemoteSharedDir/data/api_keys.db' ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 '$script:RemoteSharedDir/data/api_keys.db' ".backup '`$backup_dir/api_keys.db'"
  else
    docker run --rm -v '$script:RemoteSharedDir/data:/data' -v "`$backup_dir:/backup" alpine sh -c "apk add --no-cache sqlite >/dev/null && sqlite3 /data/api_keys.db '.backup /backup/api_keys.db'" || cp '$script:RemoteSharedDir/data/api_keys.db' "`$backup_dir/api_keys.db"
  fi
fi
cp '$script:RemoteSharedDir/data/api_keys.db-wal' "`$backup_dir/" 2>/dev/null || true
cp '$script:RemoteSharedDir/data/api_keys.db-shm' "`$backup_dir/" 2>/dev/null || true
cp -a '$script:RemoteSharedDir/data/captcha_examples' "`$backup_dir/" 2>/dev/null || true
cp -a '$script:RemoteCurrentLink/plugins' "`$backup_dir/plugins" 2>/dev/null || true
cp '$script:RemoteDir/docker-compose.yml' "`$backup_dir/docker-compose.yml" 2>/dev/null || true
cp '$script:RemoteCurrentLink/nginx-default.conf' "`$backup_dir/nginx-default.conf" 2>/dev/null || true
cp '$script:RemoteCurrentLink/release.json' "`$backup_dir/release.json" 2>/dev/null || true
cat > "`$backup_dir/backup.json" <<JSON
{"backup_id":"$backupId","release_id":"$ReleaseId","created_at":"$(Get-Date -Format o)"}
JSON
echo $backupId
"@
    $result = Remote-Exec $cmd
    Require-Success $LASTEXITCODE "Mandatory remote backup failed"
    return ($result | Select-Object -Last 1).Trim()
}

function Write-ReleaseManifest {
    # Write release.json describing the complete promoted production state.
    param(
        [string]$Path,
        [hashtable]$Manifest
    )
    $Manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $Path -Encoding UTF8
}

function Get-RemoteCurrentReleaseId {
    # Return the release_id from /opt/eopp/current/release.json when present.
    $cmd = "python3 -c `"import json, pathlib; p=pathlib.Path('$script:RemoteCurrentLink/release.json'); print(json.load(open(p)).get('release_id','') if p.exists() else '')`""
    return (Remote-Exec $cmd 2>$null).Trim()
}

function Remove-WalShm {
    # Remove SQLite WAL/SHM files after a deliberate DB replacement.
    param([string]$RemoteDataDir = "$script:RemoteSharedDir/data")
    $null = Remote-Exec "rm -f '$RemoteDataDir/api_keys.db-wal' '$RemoteDataDir/api_keys.db-shm'"
}
