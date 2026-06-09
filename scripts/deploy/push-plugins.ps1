# EOPP Deploy — Push Plugins Only
# Usage: .\scripts\deploy\push-plugins.ps1

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"
Require-SSHHost
Check-SSH

$pluginsDir = Join-Path $ProjectRoot "plugins"

# --- Build extension ---
Log-Info "Building extension..."
Push-Location (Join-Path $ProjectRoot "extension")
npm run build
Pop-Location
Log-Success "Extension built"

# --- Pack CRX ---
Log-Info "Packing extension to CRX..."
$browserExe = "C:\Users\BAZA\AppData\Local\Yandex\YandexBrowser\Application\browser.exe"
$extDistDir = Join-Path $ProjectRoot "extension/dist"
$ver = (Get-Content (Join-Path $extDistDir "manifest.json") | ConvertFrom-Json).version

$crxSrc = Join-Path $ProjectRoot "extension/dist.crx"
$crxDst = Join-Path $pluginsDir "my-helper-v$ver.crx"
New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null
if (Test-Path $crxSrc) {
    Move-Item -Force $crxSrc $crxDst
    if (Test-Path $crxSrc) { Remove-Item -Force $crxSrc }
    Log-Success "CRX packed: plugins/my-helper-v$ver.crx"
} else {
    Log-Warn "dist.crx not found, skipping CRX pack"
}

# --- Update update.xml ---
Log-Info "Updating update.xml..."
$envFile = Join-Path $ProjectRoot "server/deploy/.env.server"
$serverUrl = "https://localhost:8765"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*SERVER_URL\s*=\s*(.+?)\s*$') {
            $serverUrl = $matches[1].Trim()
        }
    }
}
$uri = $null
try {
    $uri = [Uri]$serverUrl
    $host = $uri.Host.ToLower()
    $isLocal = ($host -eq 'localhost' -or $host -eq '127.0.0.1' -or $host -eq '::1')
    if (-not $isLocal -and $uri.Scheme -eq 'http') {
        $builder = New-Object System.UriBuilder($uri)
        $builder.Scheme = 'https'
        if ($builder.Port -eq 80) { $builder.Port = -1 }
        $serverUrl = $builder.Uri.AbsoluteUri.TrimEnd('/')
    } else {
        $serverUrl = $serverUrl.TrimEnd('/')
    }
} catch {
    $serverUrl = $serverUrl.TrimEnd('/')
}
$codebase = $serverUrl.TrimEnd('/') + "/plugins/my-helper-v$ver.crx"
$updateXml = '<?xml version="1.0" encoding="UTF-8"?>' + [Environment]::NewLine +
    '<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">' + [Environment]::NewLine +
    '  <app appid="hoammcmegehdaaiiegpchhlaiiabbhli">' + [Environment]::NewLine +
    ('    <updatecheck codebase="' + $codebase + '" version="' + $ver + '" />') + [Environment]::NewLine +
    '  </app>' + [Environment]::NewLine +
    '</gupdate>'
$updateXml | Set-Content (Join-Path $pluginsDir "update.xml") -Encoding UTF8
Log-Success "update.xml updated to v$ver"

# --- Transfer to server ---
Log-Info "Pushing local $pluginsDir/ to ${script:SshTarget}:${script:RemoteDir}/plugins/ ..."
$null = Remote-Exec "mkdir -p $script:RemoteDir/plugins"
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "$pluginsDir/." "${script:SshTarget}:${script:RemoteDir}/plugins/"
if ($LASTEXITCODE -ne 0) { Log-Error "Failed to transfer plugins"; exit 1 }
Log-Success "Plugins pushed to ${script:RemoteDir}/plugins/"

Write-Header "Plugins pushed successfully! v$ver"
