# EOPP Deploy — Push Data
# Usage: .\scripts\deploy\push-data.ps1

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"
Require-SSHHost
Check-SSH

$dataDir = Join-Path (Join-Path $ProjectRoot "server") "data"
$pluginsDir = Join-Path $ProjectRoot "plugins"

# --- Stop container before replacing DB ---
Log-Info "Stopping container to safely replace DB..."
$null = Remote-Exec "cd $script:RemoteDir && docker compose down"
Log-Success "Container stopped"

# --- Backup remote DB before replacing ---
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
Log-Info "Backing up remote DB to $script:RemoteDir/backups/db_$timestamp/..."
$null = Remote-Exec "mkdir -p $script:RemoteDir/backups/db_$timestamp && cp $script:RemoteDir/data/api_keys.db* $script:RemoteDir/backups/db_$timestamp/ 2>/dev/null; true"
Log-Success "Remote DB backed up"

# --- Push data ---
Log-Info "Pushing local $dataDir/ to ${script:SshTarget}:${script:RemoteDir}/data/ ..."
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no "$dataDir/api_keys.db" "${script:SshTarget}:${script:RemoteDir}/data/api_keys.db"
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "$dataDir/captcha_examples" "${script:SshTarget}:${script:RemoteDir}/data/"
Log-Success "Data pushed to ${script:RemoteDir}/data/"

# --- Remove stale WAL files (SQLite will create fresh ones on startup) ---
Log-Info "Removing stale WAL files..."
$null = Remote-Exec "rm -f $script:RemoteDir/data/api_keys.db-wal $script:RemoteDir/data/api_keys.db-shm"
Log-Success "WAL files removed"

# --- Start container ---
Log-Info "Starting container..."
$null = Remote-Exec "cd $script:RemoteDir && docker compose up -d"
Log-Success "Container started"

# --- Plugins ---
if (Test-Path $pluginsDir) {
    Log-Info "Pushing local $pluginsDir/ to ${script:SshTarget}:${script:RemoteDir}/plugins/ ..."
    & $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "$pluginsDir/." "${script:SshTarget}:${script:RemoteDir}/plugins/"
    Log-Success "Plugins pushed to ${script:RemoteDir}/plugins/"
} else {
    Log-Info "No $pluginsDir found, skipping plugins push"
}
