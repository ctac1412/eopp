# EOPP Deploy - Setup Let's Encrypt SSL for Public IP (no domain)
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\deploy\setup-ssl-ip.ps1 -Staging
#   powershell -ExecutionPolicy Bypass -File .\scripts\deploy\setup-ssl-ip.ps1
#
# Required env in prod/.env.deploy:
#   SSH_HOST=<vps_ip_or_host>
# Optional:
#   CERTBOT_EMAIL=<you@example.com>    # for renewal notifications (recommended)
#   SSL_IP=<public_ipv4>               # if omitted and SSH_HOST is IPv4, SSH_HOST is used

param(
    [switch]$Staging
)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"
Require-SSHHost

$a = "&" + "&"

$emailFlag = "--register-unsafely-without-email"
if ($env:CERTBOT_EMAIL) {
    $emailFlag = "--email $($env:CERTBOT_EMAIL)"
} else {
    Log-Warn "CERTBOT_EMAIL not set - no renewal notifications"
}

$sslIp = $env:SSL_IP
if (-not $sslIp) {
    if ($script:SshHost -match '^\d{1,3}(\.\d{1,3}){3}$') {
        $sslIp = $script:SshHost
    }
}

if (-not $sslIp) {
    Log-Error "SSL_IP is required when SSH_HOST is not a raw IPv4 address"
    exit 1
}

Write-Header "EOPP SSL Setup (IP Cert) - $script:SshTarget - IP $sslIp"
Check-SSH

Log-Info "Preparing remote directories..."
$null = Remote-Exec "mkdir -p $script:RemoteDir/nginx /var/www/certbot /opt/eopp/certs"

# Ensure nginx config with ACME location is on server
$prodDir = Join-Path $PSScriptRoot "..\..\prod"
Log-Info "Transferring nginx config with ACME location..."
& $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no "$prodDir\nginx-default.conf" "${script:SshTarget}:${script:RemoteDir}/nginx/default.conf"
if ($LASTEXITCODE -ne 0) {
    Log-Error "Failed to transfer nginx config"
    exit 1
}

Log-Info "Applying nginx config..."
$null = Remote-Exec "cp $script:RemoteDir/nginx/default.conf /etc/nginx/conf.d/default.conf $a nginx -t $a nginx -s reload"

Log-Info "Installing certbot via pipx if needed..."
$null = Remote-Exec "if ! command -v /root/.local/bin/certbot >/dev/null 2>&1; then apt-get install -y pipx $a pipx install certbot $a pipx ensurepath; fi"

$stagingFlag = ""
if ($Staging) {
    $stagingFlag = "--staging"
    Log-Warn "Staging mode enabled"
}

$certbotBin = "/root/.local/bin/certbot"
$certbotCmd = @(
    "$certbotBin certonly",
    "--non-interactive",
    "--agree-tos",
    "--webroot",
    "-w /var/www/certbot",
    "--preferred-profile", "shortlived",
    "--ip-address $sslIp",
    $emailFlag,
    $stagingFlag
) -join " "

Log-Info "Requesting certificate for IP $sslIp..."
$null = Remote-Exec $certbotCmd
if ($LASTEXITCODE -ne 0) {
    Log-Error "Certbot failed"
    exit 1
}

# Keep nginx paths stable (same as existing config)
$liveDir = "/etc/letsencrypt/live/$sslIp"
Log-Info "Installing certificate to /opt/eopp/certs..."
$null = Remote-Exec "test -f $liveDir/fullchain.pem $a test -f $liveDir/privkey.pem $a cp $liveDir/fullchain.pem /opt/eopp/certs/cert.pem $a cp $liveDir/privkey.pem /opt/eopp/certs/key.pem $a chmod 600 /opt/eopp/certs/key.pem"
if ($LASTEXITCODE -ne 0) {
    Log-Error "Certificate files not found in $liveDir"
    exit 1
}

Log-Info "Reloading nginx with new certificate..."
$null = Remote-Exec "nginx -t $a nginx -s reload"
if ($LASTEXITCODE -ne 0) {
    Log-Error "Nginx reload failed"
    exit 1
}

Log-Info "Configuring auto-renew..."
$cronBody = "0 */6 * * * root $certbotBin renew --quiet --deploy-hook 'cp /etc/letsencrypt/live/$sslIp/fullchain.pem /opt/eopp/certs/cert.pem $a cp /etc/letsencrypt/live/$sslIp/privkey.pem /opt/eopp/certs/key.pem $a chmod 600 /opt/eopp/certs/key.pem $a nginx -s reload'"
$null = Remote-Exec "cat > /etc/cron.d/eopp-certbot-renew << 'CRONEOF'
$cronBody
CRONEOF"
$null = Remote-Exec "chmod 644 /etc/cron.d/eopp-certbot-renew"

Log-Success "SSL setup completed for $sslIp"
if ($Staging) {
    Log-Warn "This is a staging certificate. Run without -Staging for production cert."
}
