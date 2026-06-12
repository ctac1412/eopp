<#
.SYNOPSIS
Explicitly restore the production SQLite database from a selected backup.

.DESCRIPTION
This command is the only supported DB rollback path for destructive SQLite
migrations or full state promotion mistakes. It stops the app, creates an
emergency_before_restore copy of the current database, prints the release_id
associated with the selected backup, restores api_keys.db, removes WAL/SHM
files consistently, and starts the app again.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$BackupId,
    [switch]$Force
)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\release.ps1"
Require-SSHHost
Check-SSH

$backupDir = "$script:RemoteSharedDir/backups/$BackupId"
if (-not (Get-RemotePathExists -Path "$backupDir/api_keys.db")) {
    Log-Error "Backup DB not found: $backupDir/api_keys.db"
    exit 1
}

$backupJson = Remote-Exec "cat '$backupDir/backup.json' 2>/dev/null || echo '{""release_id"":""unknown""}'"
$backupMeta = $backupJson | ConvertFrom-Json
Write-Header "Restore backup $BackupId"
Log-Warn "Backup release_id: $($backupMeta.release_id)"
Confirm-ProductionAction -Prompt "Restore production DB from backup $BackupId?" -Force:$Force

$emergencyId = "emergency_before_restore_$((Get-Date).ToString('yyyyMMdd_HHmmss'))"
$emergencyDir = "$script:RemoteSharedDir/backups/$emergencyId"

Log-Info "Stopping app and saving emergency backup..."
$cmd = @"
set -e
cd '$script:RemoteDir'
docker compose down || true
mkdir -p '$emergencyDir'
if [ -f '$script:RemoteSharedDir/data/api_keys.db' ]; then
  cp '$script:RemoteSharedDir/data/api_keys.db' '$emergencyDir/api_keys.db'
fi
cp '$script:RemoteSharedDir/data/api_keys.db-wal' '$emergencyDir/' 2>/dev/null || true
cp '$script:RemoteSharedDir/data/api_keys.db-shm' '$emergencyDir/' 2>/dev/null || true
cp '$backupDir/api_keys.db' '$script:RemoteSharedDir/data/api_keys.db'
"@
$null = Remote-Exec $cmd
Require-Success $LASTEXITCODE "Failed to restore backup DB"
Remove-WalShm

$currentManifest = Remote-Exec "cat '$script:RemoteCurrentLink/release.json'"
$current = $currentManifest | ConvertFrom-Json
Log-Info "Starting app for release $($current.release_id)..."
$null = Remote-Exec "cd '$script:RemoteDir' && EOPP_IMAGE='$($current.image)' EOPP_AUTO_MIGRATE=0 docker compose up -d"

& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\verify-release.ps1" -ReleaseId $current.release_id
Require-Success $LASTEXITCODE "Post-restore verification failed"
Log-Success "Restored backup $BackupId; emergency copy saved as $emergencyId"
