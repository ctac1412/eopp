# EOPP Deploy — Pull Data
# Usage:
#   .\scripts\deploy\pull-data.ps1              # DB only (fast)
#   .\scripts\deploy\pull-data.ps1 -WithExamples # DB + captcha_examples (zipped)

param([switch]$WithExamples)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
. "$PSScriptRoot\config.ps1"
Require-SSHHost
Check-SSH

$dataDir = Join-Path (Join-Path $ProjectRoot "server") "data"
$remoteDataDir = "$script:RemoteSharedDir/data"
$remoteImage = (Remote-Exec "python3 - <<'PY'
import json, pathlib
p = pathlib.Path('$script:RemoteCurrentLink/release.json')
print(json.load(open(p)).get('image', '$script:ImageFull') if p.exists() else '$script:ImageFull')
PY").Trim()
if (-not $remoteImage) {
    $remoteImage = $script:ImageFull
}

function Stop-LocalRunProd {
    $listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) {
        return
    }
    Log-Warn "Local run-prod is listening on 8766; stopping it before replacing local DB..."
    Stop-Process -Id ([int]$listener.OwningProcess) -Force -ErrorAction Stop
    Start-Sleep -Milliseconds 500
}

function Assert-RemoteDb {
    $cmd = @"
set -e
test -f '$remoteDataDir/api_keys.db'
python3 - <<'PY'
import sqlite3
conn = sqlite3.connect('$remoteDataDir/api_keys.db')
try:
    result = conn.execute('PRAGMA integrity_check').fetchone()[0]
    if result != 'ok':
        raise SystemExit(result)
finally:
    conn.close()
PY
"@
    $null = Remote-Exec $cmd
    Require-Success $LASTEXITCODE "Remote DB integrity check failed: $remoteDataDir/api_keys.db"
}

Stop-LocalRunProd
$remoteStopped = $false
try {
    # --- Stop container to flush WAL into main DB ---
    Log-Info "Stopping container to flush WAL..."
    $null = Remote-Exec "cd '$script:RemoteDir' && EOPP_IMAGE='$remoteImage' docker compose down"
    if ($LASTEXITCODE -ne 0) { throw "Failed to stop remote container" }
    $remoteStopped = $true
    Log-Success "Container stopped"
    Assert-RemoteDb

    # --- Pull DB ---
    Log-Info "Pulling DB from ${script:SshTarget}:$remoteDataDir -> $dataDir ..."
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    $tmpDb = Join-Path $dataDir "api_keys.db.download"
    Remove-Item -Force -ErrorAction SilentlyContinue $tmpDb
    & $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no "${script:SshTarget}:${remoteDataDir}/api_keys.db" $tmpDb
    if ($LASTEXITCODE -ne 0) { throw "Failed to pull api_keys.db" }
    Remove-Item -Force -ErrorAction SilentlyContinue `
        (Join-Path $dataDir "api_keys.db-wal"), `
        (Join-Path $dataDir "api_keys.db-shm")
    Move-Item -Force $tmpDb (Join-Path $dataDir "api_keys.db")
    Log-Success "DB pulled to $dataDir/"

    # --- Pull captcha examples (optional, via zip) ---
    if ($WithExamples) {
        Log-Info "Pulling captcha_examples via zip..."
        $zipRemote = "$remoteDataDir/captcha_examples.tar.gz"
        $null = Remote-Exec "cd '$remoteDataDir' && tar czf captcha_examples.tar.gz captcha_examples/"
        if ($LASTEXITCODE -ne 0) { throw "Failed to create captcha_examples archive" }
        & $script:ScpExe -P $script:SshPort -o StrictHostKeyChecking=no "${script:SshTarget}:${zipRemote}" "$dataDir/"
        if ($LASTEXITCODE -ne 0) { throw "Failed to pull captcha_examples archive" }
        $null = Remote-Exec "rm -f $zipRemote"
        $localTar = Join-Path $dataDir "captcha_examples.tar.gz"
        $localExamples = Join-Path $dataDir "captcha_examples"
        if (Test-Path $localExamples) { Remove-Item -Recurse -Force $localExamples }
        tar xzf $localTar -C $dataDir
        Remove-Item $localTar
        Log-Success "captcha_examples extracted to $localExamples/"
    } else {
        Log-Info "Skipping captcha_examples (use -WithExamples to include)"
    }
} catch {
    Log-Error $_
    exit 1
} finally {
    if ($remoteStopped) {
        Log-Info "Starting container..."
        $null = Remote-Exec "cd '$script:RemoteDir' && EOPP_IMAGE='$remoteImage' EOPP_AUTO_MIGRATE=0 docker compose up -d"
        if ($LASTEXITCODE -eq 0) {
            Log-Success "Container started"
        } else {
            Log-Error "Failed to start remote container"
        }
    }
}
