# EOPP Deploy — Pull Data
# Usage:
#   .\scripts\deploy\pull-data.ps1              # DB only (fast)
#   .\scripts\deploy\pull-data.ps1 -WithExamples # DB + captcha_examples (zipped)

param([switch]$WithExamples)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"
Require-SSHHost
Check-SSH

$dataDir = Join-Path (Join-Path $ProjectRoot "server") "data"

# --- Stop container to flush WAL into main DB ---
Log-Info "Stopping container to flush WAL..."
$null = Remote-Exec "cd $script:RemoteDir && docker compose down"
Log-Success "Container stopped"

# --- Pull DB ---
Log-Info "Pulling DB from ${script:SshTarget}:${script:RemoteDir}/data → $dataDir ..."
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no "${script:SshTarget}:${script:RemoteDir}/data/api_keys.db" "$dataDir/"
Log-Success "DB pulled to $dataDir/"

# --- Pull captcha examples (optional, via zip) ---
if ($WithExamples) {
    Log-Info "Pulling captcha_examples via zip..."
    $zipRemote = "$script:RemoteDir/data/captcha_examples.tar.gz"
    $null = Remote-Exec "cd $script:RemoteDir/data && tar czf captcha_examples.tar.gz captcha_examples/"
    & $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no "${script:SshTarget}:${zipRemote}" "$dataDir/"
    $null = Remote-Exec "rm -f $zipRemote"
    $localTar = Join-Path $dataDir "captcha_examples.tar.gz"
    $localExamples = Join-Path $dataDir "captcha_examples"
    if (Test-Path $localExamples) { Remove-Item -Recurse -Force $localExamples }
    tar xzf $localTar -C $dataDir
    Remove-Item $localTar
    Log-Success "captcha_examples extracted to $localExamples/"
} else {
    Log-Info "Skipping captcha_examples (use -WithExamples to include)"
}

# --- Start container back ---
Log-Info "Starting container..."
$null = Remote-Exec "cd $script:RemoteDir && docker compose up -d"
Log-Success "Container started"
