# EOPP Deploy — Backward Compatibility Wrapper
# Redirects to scripts/deploy/<command>.ps1
# New code should call scripts/deploy/<command>.ps1 directly

param(
    [ValidateSet('deploy', 'pull-data', 'logs', 'backup', 'rollback', 'push-data', 'preflight')]
    [string]$Command = 'deploy'
)

$DeployDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) "deploy"
$ScriptMap = @{
    'deploy'    = 'deploy.ps1'
    'pull-data' = 'pull-data.ps1'
    'push-data' = 'push-data.ps1'
    'logs'      = 'logs.ps1'
    'backup'    = 'backup.ps1'
    'rollback'  = 'rollback.ps1'
    'preflight' = 'preflight.ps1'
}

$TargetScript = Join-Path $DeployDir $ScriptMap[$Command]

if (Test-Path $TargetScript) {
    & $TargetScript
} else {
    Write-Host "[ERROR] Script not found: $TargetScript" -ForegroundColor Red
    exit 1
}
