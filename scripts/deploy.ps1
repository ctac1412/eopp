#Requires -Version 5.1
# ============================================================
# EOPP — Production Deploy Script (PowerShell)
# ============================================================
# Usage:
#   .\scripts\deploy.ps1          # Full deploy
#   .\scripts\deploy.ps1 pull-data  # Download remote data
#   .\scripts\deploy.ps1 logs       # Stream remote logs
#   .\scripts\deploy.ps1 backup     # Backup remote data locally
#   .\scripts\deploy.ps1 rollback   # Rollback to previous image
# ============================================================

param(
    [ValidateSet('deploy', 'pull-data', 'logs', 'backup', 'rollback', 'push-data', 'setup-nginx')]
    [string]$Command = 'deploy'
)

# --- Load environment file ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$EnvFile = Join-Path $ScriptDir ".env.deploy"

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
$sshExe = "C:\Windows\System32\OpenSSH\ssh.exe"
$scpExe = "C:\Windows\System32\OpenSSH\scp.exe"
if (-not (Test-Path $sshExe)) {
    $sshExe = "C:\Windows\Sysnative\OpenSSH\ssh.exe"
}
if (-not (Test-Path $scpExe)) {
    $scpExe = "C:\Windows\Sysnative\OpenSSH\scp.exe"
}
if (-not (Test-Path $sshExe)) { $sshExe = "ssh" }
if (-not (Test-Path $scpExe)) { $scpExe = "scp" }

# --- Configuration ---
$sshUser = if ($env:SSH_USER) { $env:SSH_USER } else { "root" }
$sshHost = $env:SSH_HOST
if (-not $sshHost) {
    Write-Host "ERROR: SSH_HOST is required (set in .env.deploy)" -ForegroundColor Red
    exit 1
}
$sshPort = if ($env:SSH_PORT) { $env:SSH_PORT } else { "22" }
$imageName = if ($env:IMAGE_NAME) { $env:IMAGE_NAME } else { "eopp" }
$imageTag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }
$remoteDir = if ($env:REMOTE_DIR) { $env:REMOTE_DIR } else { "/opt/eopp" }
$localBackupDir = if ($env:LOCAL_BACKUP_DIR) { $env:LOCAL_BACKUP_DIR } else { "./backups" }
$healthCheckRetriesRaw = if ($env:HEALTH_CHECK_RETRIES) { $env:HEALTH_CHECK_RETRIES } else { "30" }
$healthCheckRetries = [int]$healthCheckRetriesRaw
$healthCheckIntervalRaw = if ($env:HEALTH_CHECK_INTERVAL) { $env:HEALTH_CHECK_INTERVAL } else { "5" }
$healthCheckInterval = [int]$healthCheckIntervalRaw

$sshTarget = "${sshUser}@${sshHost}"
$imageFull = "${imageName}:${imageTag}"

# --- Helpers ---
function Log-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Blue }
function Log-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Log-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Log-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

function Remote-Exec {
    param([string]$Cmd)
    $sshArgs = @("-p", $sshPort, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10", $sshTarget, $Cmd)
    & $sshExe @sshArgs
}

function Check-SSH {
    Log-Info "Checking SSH connection to $sshTarget..."
    $output = & $sshExe -p $sshPort -o StrictHostKeyChecking=no -o ConnectTimeout=10 $sshTarget "echo 'SSH OK'" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Log-Success "SSH connection established"
    } else {
        Log-Error "Cannot connect to $sshTarget"
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

# --- Backup ---
function Backup-RemoteData {
    Log-Info "Backing up remote data from $remoteDir..."
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupSubdir = Join-Path $localBackupDir $timestamp
    New-Item -ItemType Directory -Force -Path $backupSubdir | Out-Null

    $null = Remote-Exec "mkdir -p $remoteDir/data $remoteDir/plugins"

    Log-Info "Downloading data/..."
    & $scpExe -P $sshPort -o StrictHostKeyChecking=no -r "${sshTarget}:${remoteDir}/data" "$backupSubdir/" 2>$null
    if ($LASTEXITCODE -ne 0) { Log-Warn "No data/ to download" }

    Log-Info "Downloading plugins/..."
    & $scpExe -P $sshPort -o StrictHostKeyChecking=no -r "${sshTarget}:${remoteDir}/plugins" "$backupSubdir/" 2>$null
    if ($LASTEXITCODE -ne 0) { Log-Warn "No plugins/ to download" }

    Log-Success "Backup saved to $backupSubdir"
    return $backupSubdir
}

# --- Build ---
function Build-Frontend {
    Log-Info "Building frontend..."
    Push-Location frontend
    npm run build
    Pop-Location
    Log-Success "Frontend built"
}

function Build-DockerImage {
    Log-Info "Building Docker image $imageFull..."
    docker build -t $imageFull .
    Log-Success "Docker image built"
}

# --- Transfer ---
function Transfer-Image {
    Log-Info "Exporting Docker image..."
    $tmpTar = "$env:TEMP\eopp-${imageTag}-$(Get-Date -UFormat %s).tar"

    docker save -o $tmpTar $imageFull
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Failed to export Docker image"
        exit 1
    }

    $fileSize = "{0:N2} MB" -f ((Get-Item $tmpTar).Length / 1MB)
    Log-Info "Image archive size: $fileSize"

    Log-Info "Transferring image to $sshTarget..."
    & $scpExe -P $sshPort -o StrictHostKeyChecking=no $tmpTar "${sshTarget}:/tmp/eopp-image.tar"

    Log-Info "Loading image on remote server..."
    Remote-Exec "docker load -i /tmp/eopp-image.tar && rm -f /tmp/eopp-image.tar"

    Remove-Item $tmpTar -Force
    Log-Success "Image transferred and loaded"
}

# --- Deploy ---
function Setup-RemoteDirs {
    Log-Info "Setting up remote directories..."
    $null = Remote-Exec "mkdir -p $remoteDir/data $remoteDir/plugins $remoteDir/certs"
    Log-Success "Remote directories ready"
}

function Generate-Compose {
    Log-Info "Generating docker-compose.yml on server..."
    $composeLines = @(
        "services:",
        "  eopp-prod:",
        "    image: eopp:latest",
        "    ports:",
        '      - "8765:8765"',
        "    volumes:",
        "      - ./data:/app/data",
        "      - ./certs:/app/certs",
        "      - ./plugins:/app/plugins",
        "    environment:",
        "      - EOPP_DB_PATH=/app/data/api_keys.db",
        "      - EOPP_PLUGINS_DIR=/app/plugins",
        "    restart: unless-stopped"
    )
    $composeContent = $composeLines -join "`n"

    $remoteCmd = "cat > $remoteDir/docker-compose.yml << 'ENDCOMPOSE'`n$composeContent`nENDCOMPOSE"
    $null = Remote-Exec $remoteCmd
    Log-Success "docker-compose.yml generated"
}

function Deploy-Container {
    Log-Info "Deploying container..."
    $null = Remote-Exec "cd $remoteDir && docker compose up -d"
    Log-Success "Container deployed"
}

# --- Health check ---
function Test-Health {
    Log-Info "Running health check ($healthCheckRetries attempts, ${healthCheckInterval}s interval)..."

    for ($attempt = 1; $attempt -le $healthCheckRetries; $attempt++) {
        $status = Remote-Exec "cd $remoteDir && docker compose ps --format '{{.State}}'" 2>$null

        if ($status -match "running") {
            $httpCode = Remote-Exec "curl -sk -o /dev/null -w '%{http_code}' https://localhost:8765/" 2>$null

            if ($httpCode -match "200|301|302") {
                Log-Success "Health check passed (HTTP $httpCode)"
                return $true
            }
            Log-Warn "Attempt $attempt/$healthCheckRetries : Container running, HTTP $httpCode"
        } else {
            Log-Warn "Attempt $attempt/$healthCheckRetries : Container status: $status"
        }

        Start-Sleep -Seconds $healthCheckInterval
    }

    Log-Error "Health check failed after $healthCheckRetries attempts"
    return $false
}

# --- Rollback ---
function Do-Rollback {
    Log-Warn "Rolling back to previous image..."
    $prevImage = Remote-Exec "docker images --format '{{.Repository}}:{{.Tag}}' | grep eopp | grep -v '$imageTag' | head -1" 2>$null

    if (-not $prevImage) {
        Log-Error "No previous image found for rollback"
        exit 1
    }

    Log-Info "Rolling back to $prevImage..."
    $null = Remote-Exec "cd $remoteDir && docker compose down"
    $null = Remote-Exec "sed -i 's|image:.*|image: $prevImage|' $remoteDir/docker-compose.yml"
    $null = Remote-Exec "cd $remoteDir && docker compose up -d"
    Log-Success "Rolled back to $prevImage"
}

# --- Helper commands ---
function Do-PullData {
    Log-Info "Pulling data from ${sshTarget}:${remoteDir}/data..."
    $pullDir = Join-Path $localBackupDir "pulled-data"
    New-Item -ItemType Directory -Force -Path $pullDir | Out-Null
    & $scpExe -P $sshPort -o StrictHostKeyChecking=no -r "${sshTarget}:${remoteDir}/data" "$pullDir/"
    Log-Success "Data pulled to $pullDir/data/"
}

function Do-StreamLogs {
    Log-Info "Streaming logs from $sshTarget..."
    & $sshExe -p $sshPort -o StrictHostKeyChecking=no -t $sshTarget "cd $remoteDir && docker compose logs -f --tail=100"
}

function Do-PushData {
    Log-Info "Pushing local data/ to ${sshTarget}:${remoteDir}/..."
    & $scpExe -P $sshPort -o StrictHostKeyChecking=no -r "data" "${sshTarget}:${remoteDir}/"
    Log-Success "Data pushed to ${remoteDir}/data/"

    Log-Info "Pushing local plugins/ to ${sshTarget}:${remoteDir}/..."
    & $scpExe -P $sshPort -o StrictHostKeyChecking=no -r "plugins" "${sshTarget}:${remoteDir}/"
    Log-Success "Plugins pushed to ${remoteDir}/plugins/"
}

# ============================================================
# Main
# ============================================================
switch ($Command) {
    'deploy' {
        Write-Host "=========================================" -ForegroundColor Cyan
        Log-Info "EOPP Production Deploy"
        Log-Info "Target: $sshTarget"
        Log-Info "Image: $imageFull"
        Log-Info "Remote: $remoteDir"
        Write-Host "=========================================" -ForegroundColor Cyan

        Check-SSH
        Check-Docker

        $backupDir = Backup-RemoteData

        Build-Frontend
        Build-DockerImage

        Transfer-Image

        Setup-RemoteDirs
        Generate-Compose
        Deploy-Container

        if (Test-Health) {
            Write-Host "=========================================" -ForegroundColor Green
            Log-Success "Deploy completed successfully!"
            Log-Success "Backup saved to: $backupDir"
            Write-Host "=========================================" -ForegroundColor Green
        } else {
            Log-Error "Deploy failed, initiating rollback..."
            Do-Rollback
            Log-Error "Deploy failed. Rolled back to previous version."
            Log-Error "Backup is available at: $backupDir"
            exit 1
        }
    }
    'pull-data' {
        Check-SSH
        Do-PullData
    }
    'logs' {
        Check-SSH
        Do-StreamLogs
    }
    'backup' {
        Check-SSH
        Backup-RemoteData
    }
    'rollback' {
        Check-SSH
        Do-Rollback
    }
    'push-data' {
        Check-SSH
        Do-PushData
    }
}
