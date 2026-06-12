<#
.SYNOPSIS
Create an emergency plugin-only release.

.DESCRIPTION
Builds and packages extension plugins, creates a release_id, backs up current
plugins, writes a plugin release manifest, copies plugin files into
releases/<release_id>/plugins, switches current atomically, and verifies
/plugins/update.xml and /plugins/latest through verify-release.ps1.
#>

param([switch]$Force)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\release.ps1"
Require-SSHHost
Check-SSH

$releaseId = New-ReleaseId
$pluginsDir = Join-Path $ProjectRoot "plugins"
$releaseDir = "$script:RemoteReleasesDir/$releaseId"

Log-Info "Building extension..."
Push-Location (Join-Path $ProjectRoot "extension")
npm run build
Require-Success $LASTEXITCODE "Extension build failed"
Pop-Location

Log-Info "Packing extension to CRX..."
$browserExe = "C:\Users\BAZA\AppData\Local\Yandex\YandexBrowser\Application\browser.exe"
$extDistDir = Join-Path $ProjectRoot "extension/dist"
$ver = (Get-Content (Join-Path $extDistDir "manifest.json") | ConvertFrom-Json).version
if (Test-Path $browserExe) {
    & $browserExe --pack-extension="$extDistDir" --no-sandbox --pack-extension-key="$(Join-Path $ProjectRoot 'extension/my.pem')"
}

$crxSrc = Join-Path $ProjectRoot "extension/dist.crx"
$crxDst = Join-Path $pluginsDir "my-helper-v$ver.crx"
New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null
if (Test-Path $crxSrc) {
    Move-Item -Force $crxSrc $crxDst
    Log-Success "CRX packed: plugins/my-helper-v$ver.crx"
} else {
    Log-Warn "dist.crx not found, continuing with existing plugin files"
}

Log-Info "Updating update.xml..."
$envFile = Join-Path $ProjectRoot "server/deploy/.env.server"
$serverUrl = "https://localhost:8765"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*SERVER_URL\s*=\s*(.+?)\s*$') { $serverUrl = $matches[1].Trim() }
    }
}
try {
    $uri = [Uri]$serverUrl
    $host = $uri.Host.ToLower()
    $isLocal = ($host -eq "localhost" -or $host -eq "127.0.0.1" -or $host -eq "::1")
    if (-not $isLocal -and $uri.Scheme -eq "http") {
        $builder = New-Object System.UriBuilder($uri)
        $builder.Scheme = "https"
        if ($builder.Port -eq 80) { $builder.Port = -1 }
        $serverUrl = $builder.Uri.AbsoluteUri.TrimEnd("/")
    } else {
        $serverUrl = $serverUrl.TrimEnd("/")
    }
} catch {
    $serverUrl = $serverUrl.TrimEnd("/")
}
$codebase = $serverUrl.TrimEnd("/") + "/plugins/my-helper-v$ver.crx"
$updateXml = '<?xml version="1.0" encoding="UTF-8"?>' + [Environment]::NewLine +
    '<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">' + [Environment]::NewLine +
    '  <app appid="hoammcmegehdaaiiegpchhlaiiabbhli">' + [Environment]::NewLine +
    ('    <updatecheck codebase="' + $codebase + '" version="' + $ver + '" />') + [Environment]::NewLine +
    '  </app>' + [Environment]::NewLine +
    '</gupdate>'
$updateXml | Set-Content (Join-Path $pluginsDir "update.xml") -Encoding UTF8

Show-ReleaseDiffSummary -ReleaseId $releaseId -LocalDbPath (Join-Path $ProjectRoot "server/data/api_keys.db") -PluginsDir $pluginsDir -DataDir (Join-Path $ProjectRoot "server/data")
Confirm-ProductionAction -Prompt "Promote plugin-only release $releaseId?" -Force:$Force
$backupId = Invoke-RemoteBackup -ReleaseId $releaseId

$currentManifestJson = Remote-Exec "cat '$script:RemoteCurrentLink/release.json'"
$currentManifest = $currentManifestJson | ConvertFrom-Json
$null = Remote-Exec "mkdir -p '$releaseDir/plugins'"
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "$pluginsDir/." "${script:SshTarget}:${releaseDir}/plugins/"
Require-Success $LASTEXITCODE "Failed to transfer release plugins"

$manifestPath = Join-Path (Join-Path $ProjectRoot ".release") "$releaseId-release.json"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $manifestPath) | Out-Null
Write-ReleaseManifest -Path $manifestPath -Manifest @{
    "release_id" = $releaseId
    "release_type" = "plugin_release"
    "base_release_id" = $currentManifest.release_id
    "git_sha" = Get-GitSha
    "image" = $currentManifest.image
    "created_at" = (Get-Date -Format o)
    "plugins_sha256" = Get-DirectorySha256 -Path $pluginsDir
    "db_backup" = $backupId
    "health" = "pending"
}
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $manifestPath "${script:SshTarget}:${releaseDir}/release.json"
Require-Success $LASTEXITCODE "Failed to upload plugin release manifest"

$null = Remote-Exec "current_target=`$(readlink -f '$script:RemoteCurrentLink' 2>/dev/null || true); if [ -n `"`$current_target`" ]; then ln -sfn `"`$current_target`" '$script:RemotePreviousLink'; fi; cp '$script:RemoteCurrentLink/docker-compose.yml' '$releaseDir/docker-compose.yml'; cp '$script:RemoteCurrentLink/nginx-default.conf' '$releaseDir/nginx-default.conf'; ln -sfn '$releaseDir' '$script:RemoteCurrentLink'"
$null = Remote-Exec "cd '$script:RemoteDir' && EOPP_IMAGE='$($currentManifest.image)' EOPP_AUTO_MIGRATE=0 docker compose up -d"

& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\verify-release.ps1" -ReleaseId $releaseId
Require-Success $LASTEXITCODE "Plugin release verification failed"
Log-Success "Plugin-only release promoted: $releaseId"
