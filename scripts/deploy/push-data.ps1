<#
.SYNOPSIS
Promote local DB and JSON content as an explicit data release.

.DESCRIPTION
This is the guarded replacement for loose DB copying. It creates a release_id,
prints a diff summary, takes a mandatory remote backup, stops the app, promotes
server/data/api_keys.db and captcha JSON content into shared/data, removes
stale WAL/SHM files, records release.json, and restarts the current app image.
#>

param([switch]$Force)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\release.ps1"
Require-SSHHost
Check-SSH

$releaseId = New-ReleaseId
$dataDir = Join-Path (Join-Path $ProjectRoot "server") "data"
$dbPath = Join-Path $dataDir "api_keys.db"
$pluginsDir = Join-Path $ProjectRoot "plugins"
$releaseDir = "$script:RemoteReleasesDir/$releaseId"

Show-ReleaseDiffSummary -ReleaseId $releaseId -LocalDbPath $dbPath -PluginsDir $pluginsDir -DataDir $dataDir
Confirm-ProductionAction -Prompt "Promote local DB and JSON content to production?" -Force:$Force

$backupId = Invoke-RemoteBackup -ReleaseId $releaseId
Log-Success "Mandatory backup created: $backupId"

$currentManifestJson = Remote-Exec "cat '$script:RemoteCurrentLink/release.json'"
$currentManifest = $currentManifestJson | ConvertFrom-Json
$null = Remote-Exec "mkdir -p '$releaseDir' '$script:RemoteSharedDir/staging/$releaseId/data'"

$stage = "$script:RemoteSharedDir/staging/$releaseId/data"
if (Test-Path $dbPath) {
    & $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $dbPath "${script:SshTarget}:${stage}/api_keys.db"
    Require-Success $LASTEXITCODE "Failed to upload api_keys.db"
}
$captchaDir = Join-Path $dataDir "captcha_examples"
if (Test-Path $captchaDir) {
    & $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r $captchaDir "${script:SshTarget}:${stage}/"
    Require-Success $LASTEXITCODE "Failed to upload captcha_examples"
}

$null = Remote-Exec "cd '$script:RemoteDir' && docker compose down || true && cp '$stage/api_keys.db' '$script:RemoteSharedDir/data/api_keys.db' 2>/dev/null || true && rm -rf '$script:RemoteSharedDir/data/captcha_examples' && cp -a '$stage/captcha_examples' '$script:RemoteSharedDir/data/' 2>/dev/null || true"
Remove-WalShm

$manifestPath = Join-Path (Join-Path $ProjectRoot ".release") "$releaseId-release.json"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $manifestPath) | Out-Null
Write-ReleaseManifest -Path $manifestPath -Manifest @{
    "release_id" = $releaseId
    "release_type" = "data_release"
    "base_release_id" = $currentManifest.release_id
    "git_sha" = Get-GitSha
    "image" = $currentManifest.image
    "created_at" = (Get-Date -Format o)
    "data_sha256" = Get-DirectorySha256 -Path $dataDir
    "db_backup" = $backupId
    "health" = "pending"
}
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $manifestPath "${script:SshTarget}:${releaseDir}/release.json"
Require-Success $LASTEXITCODE "Failed to upload data release manifest"

$null = Remote-Exec "cd '$script:RemoteDir' && EOPP_IMAGE='$($currentManifest.image)' EOPP_AUTO_MIGRATE=0 docker compose up -d"
& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\verify-release.ps1" -ReleaseId $currentManifest.release_id
Require-Success $LASTEXITCODE "Data promotion verification failed"
Log-Success "Data release promoted: $releaseId"
