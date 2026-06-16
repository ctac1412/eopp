param(
  [string]$BaseUrl = "https://45.12.75.110:8765",
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
  [switch]$KeepExistingChrome
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$artifactDir = Join-Path $scriptDir "artifacts\solo-frontend-freeze-repro"
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

if (-not $KeepExistingChrome) {
  $procs = Get-CimInstance Win32_Process -Filter "name='chrome.exe'" |
    Where-Object { $_.CommandLine -like '*load-tests\playwright\artifacts\solo-frontend-freeze-repro*' }
  foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
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
Write-Host "WINDOW_TOTAL_WIDTH=$windowTotalWidth"
Write-Host "MASTER_LOGINS=$MasterLogins"
Write-Host "OPERATOR_LOGINS=$OperatorLogins"
Write-Host "QUEUE_MODE=$QueueMode"

& node (Join-Path $scriptDir "solo_frontend_captcha_freeze_repro.cjs") *>&1 | Tee-Object -FilePath $log
