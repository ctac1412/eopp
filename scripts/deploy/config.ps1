# EOPP Deploy — Config & Helpers
# Dot-source this file: . "$PSScriptRoot\config.ps1"

# --- Load environment file ---
$DeployDir = Split-Path -Parent $PSCommandPath
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $DeployDir)
# .env.deploy is now in project_root/server/deploy/
$EnvFile = Join-Path (Join-Path (Join-Path $ProjectRoot "server") "deploy") ".env.deploy"

if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+?)\s*=\s*(.+?)\s*$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

# --- Resolve SSH and SCP executables ---
function Resolve-Exe {
    param($Name)
    $paths = @(
        "C:\Windows\System32\OpenSSH\$Name.exe",
        "C:\Windows\Sysnative\OpenSSH\$Name.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    return $Name  # fallback: hope it's in PATH
}

$script:SshExe = Resolve-Exe "ssh"
$script:ScpExe = Resolve-Exe "scp"

# --- Configuration ---
$script:SshUser = if ($env:SSH_USER) { $env:SSH_USER } else { "root" }
$script:SshHost = $env:SSH_HOST
$script:SshPort = if ($env:SSH_PORT) { $env:SSH_PORT } else { "22" }
$script:ImageName = if ($env:IMAGE_NAME) { $env:IMAGE_NAME } else { "eopp" }
$script:ImageTag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }
$script:RemoteDir = if ($env:REMOTE_DIR) { $env:REMOTE_DIR } else { "/opt/eopp" }
$script:LocalBackupDir = if ($env:LOCAL_BACKUP_DIR) { $env:LOCAL_BACKUP_DIR } else { (Join-Path (Join-Path (Join-Path $ProjectRoot "server") "deploy") "backups") }
$script:HealthCheckRetriesRaw = if ($env:HEALTH_CHECK_RETRIES) { $env:HEALTH_CHECK_RETRIES } else { "30" }
$script:HealthCheckRetries = [int]$script:HealthCheckRetriesRaw
$script:HealthCheckIntervalRaw = if ($env:HEALTH_CHECK_INTERVAL) { $env:HEALTH_CHECK_INTERVAL } else { "5" }
$script:HealthCheckInterval = [int]$script:HealthCheckIntervalRaw

$script:SshTarget = "${script:SshUser}@${script:SshHost}"
$script:ImageFull = "${script:ImageName}:${script:ImageTag}"
$script:RemoteSharedDir = "$script:RemoteDir/shared"
$script:RemoteReleasesDir = "$script:RemoteDir/releases"
$script:RemoteCurrentLink = "$script:RemoteDir/current"
$script:RemotePreviousLink = "$script:RemoteDir/previous"

# --- Logging ---
function Log-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Blue }
function Log-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Log-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Log-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

function Write-Header {
    param($title)
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host $title -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
}

# --- SSH ---
function Remote-Exec {
    param([string]$Cmd)
    $Cmd = $Cmd -replace "`r`n", "`n"
    $Cmd = $Cmd -replace "`r", "`n"
    $sshArgs = @("-p", $script:SshPort, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10", $script:SshTarget, $Cmd)
    & $script:SshExe @sshArgs
}

function Check-SSH {
    Log-Info "Checking SSH connection to $script:SshTarget..."
    $output = & $script:SshExe -p $script:SshPort -o StrictHostKeyChecking=no -o ConnectTimeout=10 $script:SshTarget "echo 'SSH OK'" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Log-Success "SSH connection established"
    } else {
        Log-Error "Cannot connect to $script:SshTarget"
        Log-Error "Details: $output"
        exit 1
    }
}

function Check-Docker {
    Log-Info "Checking Docker locally..."
    docker info *>$null
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Docker is not running"
        exit 1
    }
    Log-Success "Docker is running"
}

function Require-SSHHost {
    if (-not $script:SshHost) {
        Log-Error "SSH_HOST is required (set in scripts/.env.deploy)"
        exit 1
    }
}

function Require-Success {
    param(
        [int]$ExitCode,
        [string]$Message
    )
    if ($ExitCode -ne 0) {
        Log-Error $Message
        exit 1
    }
}

function Confirm-ProductionAction {
    param(
        [string]$Prompt,
        [switch]$Force
    )
    if ($Force) {
        Log-Warn "Confirmation bypassed by -Force: $Prompt"
        return
    }
    $answer = Read-Host "$Prompt Type YES to continue"
    if ($answer -ne "YES") {
        Log-Error "Operation cancelled"
        exit 1
    }
}

function Get-RemotePathExists {
    param([string]$Path)
    $result = Remote-Exec "test -e '$Path' && echo yes || echo no" 2>$null
    return ($result -match "yes")
}
