param(
  [string]$BaseUrl = "https://45.12.75.110",
  [string]$MasterLogins = "1,2,3",
  [string]$MasterPasswords = "1,2,3",
  [string]$MasterApiKeys = "209c5fae882b3e0b81e0bf13fde4664f,683a63516b86408e791a6c51da3064f8,3660c45985ed179c3798fbbc5dc150b5",
  [string]$OperatorLogins = "4;5,6,7;8,9",
  [string]$OperatorPasswords = "4;5,6,7;8,9",
  [int]$Rounds = 1,
  [int]$CaptchasPerMaster = 1,
  [ValidateSet("sequential", "batch")]
  [string]$QueueMode = "sequential",
  [int]$CaptchaPoolOffset = 12,
  [int]$SolveDelayMs = 1000,
  [int]$ClickIntervalMs = 300,
  [int]$HoldAfterMs = 2000,
  [int]$OpenStaggerMs = 500,
  [int]$WindowHeight = 520,
  [int]$WindowStartX = 0,
  [int]$WindowStartY = 0,
  [int]$WindowGap = 0,
  [int]$PreflightWaitSeconds = 12,
  [switch]$KeepExistingChrome
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$artifactDir = Join-Path $scriptDir "artifacts\solo-frontend-freeze-repro"
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

function Invoke-EoppCurlJson {
  param(
    [string]$Url,
    [string]$CookieFile = "",
    [string]$Method = "GET",
    [string]$Body = ""
  )

  $args = @("-sS", "-k", "--connect-timeout", "5", "--max-time", "10")
  if ($CookieFile) {
    $args += @("-b", $CookieFile, "-c", $CookieFile)
  }
  if ($Method -eq "POST") {
    $args += @("-X", "POST", "-H", "Content-Type: application/json", "-d", $Body)
  }
  $args += $Url
  $raw = & curl.exe @args
  if ($LASTEXITCODE -ne 0) {
    throw "curl failed code=$LASTEXITCODE url=$Url"
  }
  if (-not $raw) {
    return $null
  }
  return $raw | ConvertFrom-Json
}

function Wait-EoppPreflightClean {
  param(
    [string]$BaseUrl,
    [string]$MasterApiKeys,
    [string]$MasterLogins,
    [string]$MasterPasswords,
    [int]$TimeoutSeconds
  )

  $logins = $MasterLogins -split "," | ForEach-Object { $_.Trim() }
  $passwords = $MasterPasswords -split "," | ForEach-Object { $_.Trim() }
  $deadline = (Get-Date).AddSeconds([Math]::Max(0, $TimeoutSeconds))
  $base = $BaseUrl.TrimEnd("/")
  $cookieFile = Join-Path $artifactDir "preflight-dashboard-cookies.txt"
  Remove-Item -Force $cookieFile -ErrorAction SilentlyContinue

  $dashboard = $null
  try {
    if ($logins.Count -gt 0 -and $passwords.Count -gt 0) {
      $body = @{ login = $logins[0]; password = $passwords[0] } | ConvertTo-Json -Compress
      Invoke-EoppCurlJson -Url "$base/api/auth/login" -CookieFile $cookieFile -Method "POST" -Body $body | Out-Null
      $dashboard = Invoke-EoppCurlJson -Url "$base/api/admin/dashboard" -CookieFile $cookieFile
    }
  } catch {
    Write-Host "PREFLIGHT_DASHBOARD unavailable: $($_.Exception.Message)"
  }

  if ($dashboard) {
    Write-Host (
      "PREFLIGHT_DASHBOARD pending={0} distribution={1} sse={2} keys=[{3}]" -f
      $dashboard.pending_captchas,
      $dashboard.distribution_states,
      $dashboard.sse_connections,
      (($dashboard.sse_api_key_ids | ForEach-Object { [string]$_ }) -join ",")
    )
  }

  while ($true) {
    $active = @()
    for ($i = 0; $i -lt $logins.Count; $i++) {
      try {
        if ($i -ge $passwords.Count) {
          throw "missing password for master login index $i"
        }
        $masterCookieFile = Join-Path $artifactDir "preflight-master-$i-cookies.txt"
        Remove-Item -Force $masterCookieFile -ErrorAction SilentlyContinue
        $loginBody = @{ login = $logins[$i]; password = $passwords[$i] } | ConvertTo-Json -Compress
        Invoke-EoppCurlJson -Url "$base/api/auth/login" -CookieFile $masterCookieFile -Method "POST" -Body $loginBody | Out-Null
        $state = Invoke-EoppCurlJson -Url "$base/api/check-stream" -CookieFile $masterCookieFile
        if ($state -and $state.has_active_stream) {
          $active += $logins[$i]
        }
      } catch {
        Write-Host "PREFLIGHT_CHECK_STREAM failed login=$($logins[$i]) error=$($_.Exception.Message)"
      }
    }

    if ($active.Count -eq 0) {
      Write-Host "PREFLIGHT_STREAMS clean_for_master_keys=true"
      return
    }
    if ((Get-Date) -ge $deadline) {
      Write-Host "PREFLIGHT_STREAMS still_active_master_keys=$($active.Count) timeout=${TimeoutSeconds}s continuing"
      return
    }
    Write-Host "PREFLIGHT_STREAMS waiting_active_master_keys=$($active.Count)"
    Start-Sleep -Seconds 1
  }
}

if (-not $KeepExistingChrome) {
  $procs = Get-CimInstance Win32_Process -Filter "name='chrome.exe'" |
    Where-Object { $_.CommandLine -like '*load-tests\playwright\artifacts\solo-frontend-freeze-repro*' }
  foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$windowTotalWidth = [Math]::Max(1, $screen.Width - [Math]::Max(0, $WindowStartX))

$masterCount = ($MasterLogins -split "," | Where-Object { $_.Trim() }).Count
$operatorsPerMaster = (($OperatorLogins -split ";") | ForEach-Object {
  ($_ -split "," | Where-Object { $_.Trim() }).Count
} | Measure-Object -Maximum).Maximum
if (-not $operatorsPerMaster) {
  $operatorsPerMaster = 0
}

Wait-EoppPreflightClean `
  -BaseUrl $BaseUrl `
  -MasterApiKeys $MasterApiKeys `
  -MasterLogins $MasterLogins `
  -MasterPasswords $MasterPasswords `
  -TimeoutSeconds $PreflightWaitSeconds

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runId = "prod-dist-3masters-row-delay1s-hold2s-$stamp"
$log = Join-Path $artifactDir "$runId.log"

Remove-Item Env:\EOPP_SOLO_FRONTEND_HEADLESS -ErrorAction SilentlyContinue
Remove-Item Env:\EOPP_SOLO_FRONTEND_DEVTOOLS -ErrorAction SilentlyContinue

$env:EOPP_FRONTEND_LOAD_SCENARIO = "master-operators"
$env:EOPP_SOLO_FRONTEND_BASE_URL = $BaseUrl
$env:EOPP_SOLO_FRONTEND_AUTH_MODE = "session"
$env:EOPP_SOLO_FRONTEND_IGNORE_HTTPS_ERRORS = "1"
$env:EOPP_SOLO_FRONTEND_REFRESH_AUTH = "1"
$env:EOPP_DISTRIBUTED_MASTER_COUNT = [string]$masterCount
$env:EOPP_DISTRIBUTED_OPERATORS_PER_MASTER = [string]$operatorsPerMaster
$env:EOPP_DISTRIBUTED_MASTER_LOGINS = $MasterLogins
$env:EOPP_DISTRIBUTED_MASTER_PASSWORDS = $MasterPasswords
$env:EOPP_DISTRIBUTED_MASTER_API_KEYS = $MasterApiKeys
$env:EOPP_DISTRIBUTED_OPERATOR_LOGINS = $OperatorLogins
$env:EOPP_DISTRIBUTED_OPERATOR_PASSWORDS = $OperatorPasswords
$env:EOPP_SOLO_FRONTEND_ROUNDS = [string]$Rounds
$env:EOPP_SOLO_FRONTEND_CAPTCHAS_PER_BROWSER = [string]$CaptchasPerMaster
$env:EOPP_DISTRIBUTED_QUEUE_MODE = $QueueMode
$env:EOPP_SOLO_FRONTEND_CAPTCHA_POOL_OFFSET = [string]$CaptchaPoolOffset
$env:EOPP_SOLO_FRONTEND_OPEN_STAGGER_MS = [string]$OpenStaggerMs
$env:EOPP_SOLO_FRONTEND_OPEN_TIMEOUT_MS = "30000"
$env:EOPP_SOLO_FRONTEND_SOLVE_CAPTCHA_TIMEOUT_MS = "30000"
$env:EOPP_SOLO_FRONTEND_IMAGE_TIMEOUT_MS = "10000"
$env:EOPP_SOLO_FRONTEND_SOLVE_RESPONSE_TIMEOUT_MS = "10000"
$env:EOPP_SOLO_FRONTEND_TEST_NO_TIMEOUT = "0"
$env:EOPP_SOLO_FRONTEND_SOLVE_DELAY_MS = [string]$SolveDelayMs
$env:EOPP_SOLO_FRONTEND_CLICK_INTERVAL_MS = [string]$ClickIntervalMs
$env:EOPP_SOLO_FRONTEND_HOLD_AFTER_MS = [string]$HoldAfterMs
$env:EOPP_SOLO_FRONTEND_WINDOW_LAYOUT = "grid"
$env:EOPP_SOLO_FRONTEND_WINDOW_TOTAL_WIDTH = [string]$windowTotalWidth
$env:EOPP_SOLO_FRONTEND_WINDOW_WIDTH = [string]$windowTotalWidth
$env:EOPP_SOLO_FRONTEND_WINDOW_HEIGHT = [string]$WindowHeight
$env:EOPP_SOLO_FRONTEND_WINDOW_START_X = [string]$WindowStartX
$env:EOPP_SOLO_FRONTEND_WINDOW_START_Y = [string]$WindowStartY
$env:EOPP_SOLO_FRONTEND_WINDOW_GAP = [string]$WindowGap
$env:EOPP_SOLO_FRONTEND_RUN_ID = $runId

Write-Host "RUN_ID=$runId"
Write-Host "LOG=$log"
Write-Host "BASE_URL=$BaseUrl"
Write-Host "TEST_NO_TIMEOUT=$($env:EOPP_SOLO_FRONTEND_TEST_NO_TIMEOUT)"
Write-Host "WINDOW_TOTAL_WIDTH=$windowTotalWidth"
Write-Host "MASTER_LOGINS=$MasterLogins"
Write-Host "OPERATOR_LOGINS=$OperatorLogins"
Write-Host "QUEUE_MODE=$QueueMode"

& node (Join-Path $scriptDir "solo_frontend_captcha_freeze_repro.cjs") *>&1 | Tee-Object -FilePath $log
