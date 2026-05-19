# EOPP Deploy — Backup
# Usage: .\scripts\deploy\backup.ps1

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"
Require-SSHHost
Check-SSH

Log-Info "Backing up remote data from $script:RemoteDir..."
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupSubdir = Join-Path $script:LocalBackupDir $timestamp
New-Item -ItemType Directory -Force -Path $backupSubdir | Out-Null

$null = Remote-Exec "mkdir -p $script:RemoteDir/data $script:RemoteDir/plugins"

Log-Info "Downloading data/..."
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "${script:SshTarget}:${script:RemoteDir}/data/." "$backupSubdir/" 2>$null
if ($LASTEXITCODE -ne 0) { Log-Warn "No data/ to download" }

Log-Info "Downloading plugins/..."
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "${script:SshTarget}:${script:RemoteDir}/plugins/." "$backupSubdir/" 2>$null
if ($LASTEXITCODE -ne 0) { Log-Warn "No plugins/ to download" }

Log-Success "Backup saved to $backupSubdir"
