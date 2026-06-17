<#
.SYNOPSIS
Rollback EOPP to a selected release manifest.

.DESCRIPTION
Switches /opt/eopp/current to a selected release directory or to
/opt/eopp/previous. This is a release rollback, not a Docker-image guess. DB
restore is explicit: pass -RestoreDbBackup or run restore-backup.ps1 with the
backup id printed from release.json.
#>

param(
    [string]$ReleaseId,
    [switch]$RestoreDbBackup,
    [switch]$Force
)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\release.ps1"
Require-SSHHost
Check-SSH

function Resolve-RollbackReleaseId {
    # Resolve an explicit release id or the release pointed to by previous.
    param([string]$RequestedReleaseId)
    if ($RequestedReleaseId) { return $RequestedReleaseId }
    $cmd = "python3 -c `"import json, pathlib; p=pathlib.Path('$script:RemotePreviousLink/release.json'); print(json.load(open(p, encoding='utf-8-sig'))['release_id'] if p.exists() else '')`""
    $resolved = (Remote-Exec $cmd 2>$null).Trim()
    if (-not $resolved) {
        Log-Error "No previous release manifest found. Pass -ReleaseId explicitly."
        exit 1
    }
    return $resolved
}

$targetReleaseId = Resolve-RollbackReleaseId -RequestedReleaseId $ReleaseId
$targetDir = "$script:RemoteReleasesDir/$targetReleaseId"
$manifestPath = "$targetDir/release.json"

if (-not (Get-RemotePathExists -Path $manifestPath)) {
    Log-Error "Release manifest not found: $manifestPath"
    exit 1
}

$manifestJson = Remote-Exec "cat '$manifestPath'"
$manifest = $manifestJson | ConvertFrom-Json
$currentReleaseId = Get-RemoteCurrentReleaseId

Write-Header "Rollback release $currentReleaseId -> $targetReleaseId"
Log-Info "Target image: $($manifest.image)"
Log-Info "Target db_backup: $($manifest.db_backup)"
Confirm-ProductionAction -Prompt "Switch production current symlink to release $targetReleaseId?" -Force:$Force

if ($RestoreDbBackup) {
    if (-not $manifest.db_backup) {
        Log-Error "Target release has no db_backup in release.json"
        exit 1
    }
    & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\restore-backup.ps1" -BackupId $manifest.db_backup -Force:$Force
    Require-Success $LASTEXITCODE "RestoreDbBackup failed"
}

Log-Info "Switching current release symlink..."
$null = Remote-Exec "if [ -e '$script:RemoteCurrentLink' ]; then ln -sfn `$(readlink -f '$script:RemoteCurrentLink') '$script:RemotePreviousLink'; fi; ln -sfn '$targetDir' '$script:RemoteCurrentLink'; cp '$targetDir/docker-compose.yml' '$script:RemoteDir/docker-compose.yml'; mkdir -p '$script:RemoteDir/nginx'; cp '$targetDir/nginx-default.conf' '$script:RemoteDir/nginx/default.conf'"

Log-Info "Restarting containers..."
$null = Remote-Exec "cd '$script:RemoteDir' && EOPP_IMAGE='$($manifest.image)' EOPP_AUTO_MIGRATE=0 docker compose up -d"
$null = Remote-Exec "cp '$script:RemoteDir/nginx/default.conf' /etc/nginx/conf.d/default.conf && nginx -t && nginx -s reload"

& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\verify-release.ps1" -ReleaseId $targetReleaseId
Require-Success $LASTEXITCODE "Rollback verification failed"
Log-Success "Rolled back to release $targetReleaseId"
