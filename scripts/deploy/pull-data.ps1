# EOPP Deploy — Pull Data
# Usage: .\scripts\deploy\pull-data.ps1

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"
Require-SSHHost
Check-SSH

$prodDir = Join-Path $ProjectRoot "prod"
$prodDataDir = Join-Path $prodDir "data"

# --- Stop container to flush WAL into main DB ---
Log-Info "Stopping container to flush WAL..."
$null = Remote-Exec "cd $script:RemoteDir && docker compose down"
Log-Success "Container stopped"

# --- Pull data ---
Log-Info "Pulling data from ${script:SshTarget}:${script:RemoteDir}/data → $prodDataDir ..."
New-Item -ItemType Directory -Force -Path $prodDataDir | Out-Null
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no "${script:SshTarget}:${script:RemoteDir}/data/api_keys.db" "$prodDataDir/"
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "${script:SshTarget}:${script:RemoteDir}/data/captcha_examples" "$prodDataDir/" 2>$null
Log-Success "Data pulled to $prodDataDir/"

# --- Start container back ---
Log-Info "Starting container..."
$null = Remote-Exec "cd $script:RemoteDir && docker compose up -d"
Log-Success "Container started"
