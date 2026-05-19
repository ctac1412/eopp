# EOPP Deploy — Stream Logs
# Usage: .\scripts\deploy\logs.ps1

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"
Require-SSHHost

Log-Info "Streaming logs from $script:SshTarget..."
& $script:SshExe -p $script:SshPort -o StrictHostKeyChecking=no -t $script:SshTarget "cd $script:RemoteDir && docker compose logs -f --tail=100"
