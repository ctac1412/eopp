# EOPP Deploy — Rollback
# Usage: .\scripts\deploy\rollback.ps1

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"
Require-SSHHost
Check-SSH

Log-Warn "Rolling back to previous image..."
$prevImage = Remote-Exec "docker images --format '{{.Repository}}:{{.Tag}}' | grep eopp | grep -v '$script:ImageTag' | head -1" 2>$null

if (-not $prevImage) {
    Log-Error "No previous image found for rollback"
    exit 1
}

Log-Info "Rolling back to $prevImage..."
$null = Remote-Exec "cd $script:RemoteDir && docker compose down"
$null = Remote-Exec "sed -i 's|image:.*|image: $prevImage|' $script:RemoteDir/docker-compose.yml"
$null = Remote-Exec "cd $script:RemoteDir && docker compose up -d"
Log-Success "Rolled back to $prevImage"
