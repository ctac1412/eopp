<#
.SYNOPSIS
Run production database migrations explicitly for a candidate release.

.DESCRIPTION
Phase 9 keeps migrations out of normal application startup. This command runs a
one-shot Alembic upgrade against shared/data/api_keys.db with the candidate
image and records current output in the release directory.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseId,
    [Parameter(Mandatory = $true)]
    [string]$Image,
    [switch]$Force
)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\release.ps1"
Require-SSHHost
Check-SSH

$releaseDir = "$script:RemoteReleasesDir/$ReleaseId"
if (-not (Get-RemotePathExists -Path "$releaseDir/release.json")) {
    Log-Error "Release manifest not found for migration: $ReleaseId"
    exit 1
}

Confirm-ProductionAction -Prompt "Run Alembic migrations for release $ReleaseId?" -Force:$Force

$cmd = @"
set -e
cd '$script:RemoteDir'
before=`$(EOPP_IMAGE='$Image' EOPP_AUTO_MIGRATE=0 docker compose run --rm eopp-prod python -m alembic -c server/alembic.ini current 2>/dev/null || true)
printf '%s\n' "`$before" > '$releaseDir/migration_before.txt'
EOPP_IMAGE='$Image' EOPP_AUTO_MIGRATE=1 docker compose run --rm eopp-prod python -m alembic -c server/alembic.ini upgrade heads
after=`$(EOPP_IMAGE='$Image' EOPP_AUTO_MIGRATE=0 docker compose run --rm eopp-prod python -m alembic -c server/alembic.ini current)
printf '%s\n' "`$after" > '$releaseDir/migration_after.txt'
"@

$output = Remote-Exec $cmd
if ($LASTEXITCODE -ne 0) {
    Log-Error "Migration failed"
    Write-Host $output
    exit 1
}
Write-Host $output
Log-Success "Migrations completed for $ReleaseId"
