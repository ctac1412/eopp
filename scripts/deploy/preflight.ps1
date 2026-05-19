# EOPP Deploy — Preflight Check
# Usage: .\scripts\deploy\preflight.ps1

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"

$passed = 0; $failed = 0; $warnings = 0

function Pass { param($msg) Write-Host "[PASS] $msg" -ForegroundColor Green; $script:passed++ }
function Fail { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:failed++ }
function Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow; $script:warnings++ }
function Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }

Write-Header "EOPP Deploy Pre-flight Check"

# --- Local checks ---
Info "=== Local Environment ==="

if (Test-Path $EnvFile) { Pass "prod/.env.deploy exists" } else { Fail "prod/.env.deploy not found" }

if ($script:SshHost) { Pass "SSH_HOST is set: $script:SshHost" } else { Fail "SSH_HOST is not defined" }

if (Test-Path $script:SshExe) { Pass "SSH executable found" } else { Fail "SSH executable not found" }

docker info *>$null
if ($LASTEXITCODE -eq 0) { Pass "Docker is running" } else { Fail "Docker is not running" }

node --version 2>$null
if ($LASTEXITCODE -eq 0) { Pass "Node.js: $(node --version)" } else { Fail "Node.js not installed" }

npm --version 2>$null
if ($LASTEXITCODE -eq 0) { Pass "npm is installed" } else { Fail "npm not installed" }

if (Test-Path "frontend/package.json") { Pass "frontend/package.json exists" } else { Warn "frontend/package.json not found" }
if (Test-Path "Dockerfile") { Pass "Dockerfile exists" } else { Fail "Dockerfile not found" }

# --- Remote checks ---
Info "=== Remote Server ($script:SshTarget) ==="

if (-not $script:SshHost) {
    Warn "Skipping remote checks (SSH_HOST not defined)"
} else {
    & $script:SshExe -p $script:SshPort -o StrictHostKeyChecking=no -o ConnectTimeout=10 $script:SshTarget "echo OK" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Pass "SSH connection successful"

        Remote-Exec "docker --version" 2>$null
        if ($LASTEXITCODE -eq 0) { Pass "Docker on server" } else { Fail "Docker not on server" }

        Remote-Exec "docker compose version" 2>$null
        if ($LASTEXITCODE -eq 0) { Pass "Docker Compose V2" } else { Fail "Docker Compose V2 not found" }

        Remote-Exec "test -d $script:RemoteDir && echo ok" 2>$null
        if ($LASTEXITCODE -eq 0) { Pass "Remote dir exists: $script:RemoteDir" } else { Warn "Remote dir missing (will be created)" }

        $remoteDisk = Remote-Exec "df -h /opt | tail -1 | awk '{print `$4}'" 2>$null
        if ($remoteDisk) { Pass "Remote disk: $remoteDisk available" } else { Warn "Could not check remote disk" }

        $imageCount = Remote-Exec "docker images --format '{{.Repository}}' | grep -c eopp" 2>$null
        if ($imageCount -gt 0) {
            Pass "EOPP images: $imageCount"
            if ($imageCount -eq 1) { Warn "Only 1 image (rollback requires >=2)" }
        } else { Info "No EOPP images (first deploy)" }

        Remote-Exec "nginx -t" 2>$null
        if ($LASTEXITCODE -eq 0) { Pass "Nginx OK" } else { Warn "Nginx missing or misconfigured" }
    } else {
        Fail "Cannot SSH to $script:SshTarget"
    }
}

# --- Summary ---
Write-Header "Summary: $passed passed, $failed failed, $warnings warnings"

if ($failed -gt 0) {
    Write-Host "⚠️  Deploy NOT ready. Fix $failed issue(s)." -ForegroundColor Red
    exit 1
} else {
    Write-Host "✅ Deploy ready! Run: make deploy" -ForegroundColor Green
    exit 0
}
