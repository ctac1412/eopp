# EOPP Deploy — Full Deploy
# Usage: .\scripts\deploy\deploy.ps1

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"
Require-SSHHost

Write-Header "EOPP Production Deploy — $script:SshTarget — $script:ImageFull"

Check-SSH
Check-Docker

# --- Build ---
Log-Info "Building frontend..."
Push-Location (Join-Path $PSScriptRoot "..\..")
Push-Location frontend
npm run build
Pop-Location
Log-Success "Frontend built"

Log-Info "Building Docker image $script:ImageFull..."
docker build -t $script:ImageFull .
Log-Success "Docker image built"

# --- Transfer ---
Log-Info "Exporting Docker image..."
$tmpTar = "$env:TEMP\eopp-${script:ImageTag}-$(Get-Date -UFormat %s).tar"
docker save -o $tmpTar $script:ImageFull
if ($LASTEXITCODE -ne 0) { Log-Error "Failed to export image"; exit 1 }
$fileSize = "{0:N2} MB" -f ((Get-Item $tmpTar).Length / 1MB)
Log-Info "Image size: $fileSize"

Log-Info "Transferring to server..."
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no $tmpTar "${script:SshTarget}:/tmp/eopp-image.tar"

Log-Info "Loading image on server..."
Remote-Exec "docker load -i /tmp/eopp-image.tar && rm -f /tmp/eopp-image.tar"
Remove-Item $tmpTar -Force
Log-Success "Image transferred"

# --- Deploy ---
Log-Info "Setting up remote dirs..."
$null = Remote-Exec "mkdir -p $script:RemoteDir/data $script:RemoteDir/plugins $script:RemoteDir/certs $script:RemoteDir/nginx"
Log-Success "Remote dirs ready"

Log-Info "Transferring docker-compose.yml and nginx config..."
$deployDir = Join-Path $PSScriptRoot "..\..\server\deploy"
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no "$deployDir\docker-compose.yml" "${script:SshTarget}:${script:RemoteDir}/docker-compose.yml"
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no "$deployDir\nginx-default.conf" "${script:SshTarget}:${script:RemoteDir}/nginx/default.conf"
Log-Success "Config files transferred"

Log-Info "Deploying container..."
$null = Remote-Exec "cd $script:RemoteDir && docker compose up -d"
Log-Success "Container deployed"

# --- Nginx ---
Log-Info "Configuring nginx..."
$null = Remote-Exec "cp $script:RemoteDir/nginx/default.conf /etc/nginx/conf.d/default.conf && rm -f /etc/nginx/sites-enabled/default && nginx -t && nginx -s reload"
Log-Success "Nginx reloaded"

# --- Health check ---
Log-Info "Health check ($script:HealthCheckRetries attempts, ${script:HealthCheckInterval}s)..."
$healthy = $false
for ($attempt = 1; $attempt -le $script:HealthCheckRetries; $attempt++) {
    $status = Remote-Exec "cd $script:RemoteDir && docker compose ps --format '{{.State}}'" 2>$null
    if ($status -match "running") {
        $httpCode = Remote-Exec "curl -sk -o /dev/null -w '%{http_code}' https://localhost:8765/" 2>$null
        if ($httpCode -match "200|301|302") {
            Log-Success "Health check passed (HTTP $httpCode)"
            $healthy = $true; break
        }
        Log-Warn "Attempt $attempt/$script:HealthCheckRetries : running, HTTP $httpCode"
    } else {
        Log-Warn "Attempt $attempt/$script:HealthCheckRetries : $status"
    }
    Start-Sleep -Seconds $script:HealthCheckInterval
}

if ($healthy) {
    Write-Header "Deploy completed successfully!"
} else {
    Log-Error "Health check failed, rolling back..."
    $prevImage = Remote-Exec "docker images --format '{{.Repository}}:{{.Tag}}' | grep eopp | grep -v 'latest' | head -1" 2>$null
    if ($prevImage) {
        $null = Remote-Exec "cd $script:RemoteDir && docker compose down"
        $null = Remote-Exec "sed -i 's|image:.*|image: $prevImage|' $script:RemoteDir/docker-compose.yml"
        $null = Remote-Exec "cd $script:RemoteDir && docker compose up -d"
        Log-Error "Rolled back to $prevImage"
    } else {
        Log-Error "No previous image for rollback"
    }
    exit 1
}
