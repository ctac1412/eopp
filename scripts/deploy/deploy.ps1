<#
.SYNOPSIS
Build and promote one complete EOPP production release.

.DESCRIPTION
Creates a release_id, release.json, Docker image, release-bound plugins,
optional full-state data bundle, mandatory remote backup, explicit migration
step, health verification, and current/previous symlink promotion.
#>

param(
    [switch]$Force,
    [switch]$SkipDataPromotion
)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\release.ps1"
Require-SSHHost

$gitSha = Get-GitSha
$releaseId = New-ReleaseId -GitSha $gitSha
$imageTag = $releaseId
$imageFull = "${script:ImageName}:$imageTag"
$releaseDir = "$script:RemoteReleasesDir/$releaseId"
$localDataDir = Join-Path (Join-Path $ProjectRoot "server") "data"
$localDbPath = Join-Path $localDataDir "api_keys.db"
$pluginsDir = Join-Path $ProjectRoot "plugins"
$deployDir = Join-Path (Join-Path $ProjectRoot "server") "deploy"
$composePath = Join-Path $deployDir "docker-compose.yml"
$nginxPath = Join-Path $deployDir "nginx-default.conf"
$localReleaseDir = Join-Path (Join-Path $ProjectRoot ".release") $releaseId

Write-Header "EOPP Production Deploy - $script:SshTarget - $releaseId"
Check-SSH
Check-Docker

Show-ReleaseDiffSummary -ReleaseId $releaseId -LocalDbPath $localDbPath -PluginsDir $pluginsDir -DataDir $localDataDir
Confirm-ProductionAction -Prompt "Promote release $releaseId to production as full_state_promotion?" -Force:$Force

New-Item -ItemType Directory -Force -Path $localReleaseDir | Out-Null

Log-Info "Building frontend..."
Push-Location (Join-Path $ProjectRoot "frontend")
npm run build
Require-Success $LASTEXITCODE "Frontend build failed"
Pop-Location

Log-Info "Building extension/plugin assets..."
Push-Location (Join-Path $ProjectRoot "extension")
npm run build
Require-Success $LASTEXITCODE "Extension build failed"
Pop-Location

Log-Info "Building Docker image $imageFull..."
Push-Location $ProjectRoot
docker build `
    --build-arg EOPP_GIT_SHA=$gitSha `
    --build-arg EOPP_RELEASE_ID=$releaseId `
    --build-arg EOPP_IMAGE=$imageFull `
    -t $imageFull .
Require-Success $LASTEXITCODE "Docker image build failed"
Pop-Location

$backupId = Invoke-RemoteBackup -ReleaseId $releaseId
Log-Success "Mandatory backup created: $backupId"

$composeSha = Get-FileSha256 -Path $composePath
$nginxSha = Get-FileSha256 -Path $nginxPath
$pluginsSha = Get-DirectorySha256 -Path $pluginsDir
$dataSha = if ($SkipDataPromotion) { "" } else { Get-DirectorySha256 -Path $localDataDir }

$manifestPath = Join-Path $localReleaseDir "release.json"
$manifest = @{
    "release_id" = $releaseId
    "release_type" = "full_state_promotion"
    "git_sha" = $gitSha
    "image" = $imageFull
    "created_at" = (Get-Date -Format o)
    "compose_sha256" = $composeSha
    "nginx_sha256" = $nginxSha
    "plugins_sha256" = $pluginsSha
    "data_sha256" = $dataSha
    "db_backup" = $backupId
    "migration_before" = "recorded-by-migrate.ps1"
    "migration_after" = "head"
    "health" = "pending"
    "requires_db_restore_on_rollback" = $false
    "deployment_model" = "code + DB + JSON + plugins as one promotable state"
}
Write-ReleaseManifest -Path $manifestPath -Manifest $manifest

Log-Info "Exporting Docker image..."
$releaseTmpDir = Join-Path (Join-Path $ProjectRoot "tmp") "release"
New-Item -ItemType Directory -Force -Path $releaseTmpDir | Out-Null
$tmpTar = Join-Path $releaseTmpDir "eopp-$releaseId.tar"
docker save -o $tmpTar $imageFull
Require-Success $LASTEXITCODE "Failed to export image"

Log-Info "Creating remote release directory..."
$null = Remote-Exec "mkdir -p '$releaseDir/plugins' '$releaseDir/diff' '$script:RemoteSharedDir/data' '$script:RemoteSharedDir/certs' '$script:RemoteSharedDir/backups'"

Log-Info "Transferring image and release files..."
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $tmpTar "${script:SshTarget}:/tmp/eopp-$releaseId.tar"
Require-Success $LASTEXITCODE "Failed to upload Docker image"
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $composePath "${script:SshTarget}:${releaseDir}/docker-compose.yml"
Require-Success $LASTEXITCODE "Failed to upload docker-compose.yml"
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $nginxPath "${script:SshTarget}:${releaseDir}/nginx-default.conf"
Require-Success $LASTEXITCODE "Failed to upload nginx config"
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $manifestPath "${script:SshTarget}:${releaseDir}/release.json"
Require-Success $LASTEXITCODE "Failed to upload release.json"
if (Test-Path $pluginsDir) {
    & $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "$pluginsDir/." "${script:SshTarget}:${releaseDir}/plugins/"
    Require-Success $LASTEXITCODE "Failed to upload release plugins"
}

Log-Info "Loading image on server..."
$null = Remote-Exec "docker load -i /tmp/eopp-$releaseId.tar && rm -f /tmp/eopp-$releaseId.tar"
Remove-Item $tmpTar -Force

if (-not $SkipDataPromotion) {
    Log-Info "Promoting local DB and JSON content to shared/data staging..."
    $remoteStage = "$script:RemoteSharedDir/staging/$releaseId/data"
    $null = Remote-Exec "rm -rf '$remoteStage' && mkdir -p '$remoteStage'"
    if (Test-Path $localDbPath) {
        & $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $localDbPath "${script:SshTarget}:${remoteStage}/api_keys.db"
        Require-Success $LASTEXITCODE "Failed to upload local api_keys.db"
    }
    $captchaDir = Join-Path $localDataDir "captcha_examples"
    if (Test-Path $captchaDir) {
        & $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r $captchaDir "${script:SshTarget}:${remoteStage}/"
        Require-Success $LASTEXITCODE "Failed to upload captcha JSON examples"
    }
    $null = Remote-Exec "cd '$script:RemoteDir' && docker compose down || true && mkdir -p '$script:RemoteSharedDir/data' && cp '$remoteStage/api_keys.db' '$script:RemoteSharedDir/data/api_keys.db' 2>/dev/null || true && rm -rf '$script:RemoteSharedDir/data/captcha_examples' && cp -a '$remoteStage/captcha_examples' '$script:RemoteSharedDir/data/' 2>/dev/null || true"
    Remove-WalShm
}

Log-Info "Switching release symlinks..."
$null = Remote-Exec "current_target=`$(readlink -f '$script:RemoteCurrentLink' 2>/dev/null || true); if [ -n `"`$current_target`" ]; then ln -sfn `"`$current_target`" '$script:RemotePreviousLink'; fi; ln -sfn '$releaseDir' '$script:RemoteCurrentLink'; cp '$releaseDir/docker-compose.yml' '$script:RemoteDir/docker-compose.yml'; mkdir -p '$script:RemoteDir/nginx'; cp '$releaseDir/nginx-default.conf' '$script:RemoteDir/nginx/default.conf'"

Log-Info "Running explicit migrations with EOPP_AUTO_MIGRATE=0 for app startup..."
& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\migrate.ps1" -ReleaseId $releaseId -Image $imageFull -Force
Require-Success $LASTEXITCODE "Explicit migration failed"

Log-Info "Starting app with release image..."
$null = Remote-Exec "cd '$script:RemoteDir' && EOPP_IMAGE='$imageFull' EOPP_AUTO_MIGRATE=0 docker compose up -d"

Log-Info "Configuring nginx..."
$null = Remote-Exec "cp '$script:RemoteDir/nginx/default.conf' /etc/nginx/conf.d/default.conf && rm -f /etc/nginx/sites-enabled/default && nginx -t && nginx -s reload"

& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\verify-release.ps1" -ReleaseId $releaseId
if ($LASTEXITCODE -eq 0) {
    $manifest["health"] = "passed"
    Write-ReleaseManifest -Path $manifestPath -Manifest $manifest
    & $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $manifestPath "${script:SshTarget}:${releaseDir}/release.json"
    Write-Header "Deploy completed: $releaseId"
} else {
    Log-Error "Release verification failed. Rolling back symlink to previous release without DB restore."
    & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\rollback.ps1" -Force
    exit 1
}
