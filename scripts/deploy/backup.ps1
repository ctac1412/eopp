<#
.SYNOPSIS
Download a production snapshot and create a remote backup marker.

.DESCRIPTION
This manual backup command is for local inspection and sandbox work. Full
deploys use Invoke-RemoteBackup as a mandatory pre-promotion step; this command
keeps the older local download workflow while also writing a remote backup
under shared/backups.
#>

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\release.ps1"
Require-SSHHost
Check-SSH

Log-Info "Backing up remote data from $script:RemoteDir..."
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupSubdir = Join-Path $script:LocalBackupDir $timestamp
New-Item -ItemType Directory -Force -Path $backupSubdir | Out-Null

$null = Remote-Exec "mkdir -p $script:RemoteDir/data $script:RemoteDir/plugins $script:RemoteSharedDir/data $script:RemoteSharedDir/backups"

Log-Info "Downloading data/..."
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "${script:SshTarget}:${script:RemoteDir}/data/." "$backupSubdir/" 2>$null
if ($LASTEXITCODE -ne 0) { Log-Warn "No data/ to download" }
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "${script:SshTarget}:${script:RemoteSharedDir}/data/." "$backupSubdir/" 2>$null
if ($LASTEXITCODE -ne 0) { Log-Warn "No shared/data/ to download" }

Log-Info "Downloading plugins/..."
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "${script:SshTarget}:${script:RemoteDir}/plugins/." "$backupSubdir/" 2>$null
if ($LASTEXITCODE -ne 0) { Log-Warn "No plugins/ to download" }
New-Item -ItemType Directory -Force -Path (Join-Path $backupSubdir "plugins") | Out-Null
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no -r "${script:SshTarget}:${script:RemoteCurrentLink}/plugins/." "$backupSubdir/plugins/" 2>$null
if ($LASTEXITCODE -ne 0) { Log-Warn "No current/plugins/ to download" }

$releaseId = Get-RemoteCurrentReleaseId
if (-not $releaseId) { $releaseId = "manual_$timestamp" }
$remoteBackupId = Invoke-RemoteBackup -ReleaseId $releaseId
Log-Success "Remote backup saved as $remoteBackupId"
Log-Success "Backup saved to $backupSubdir"
