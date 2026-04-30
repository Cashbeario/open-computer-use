<#
.SYNOPSIS
    Build & push backend + frontend Docker images to AWS ECR in parallel.

.DESCRIPTION
    Required env:
      AWS_ACCESS_KEY_ID
      AWS_SECRET_ACCESS_KEY
      AWS_REGION
      AWS_ACCOUNT_ID
      BACKEND_REPO              (ECR repo name for the backend image)
      FRONTEND_REPO             (ECR repo name for the frontend image)

    Optional env:
      AWS_SESSION_TOKEN         (only if using temporary creds)
      IMAGE_TAG                 (default: latest)
      ECR_HOST                  (default: <AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com)

    Optional frontend build args (passed through if set):
      ENCRYPTION_KEY, CSRF_SECRET,
      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE,
      STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET,
      STRIPE_PRICE_STARTER, STRIPE_PRICE_PROFESSIONAL, STRIPE_PRICE_ENTERPRISE

    Loads variables from infra/docker/.env (if present) before validating.
#>

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Coalesce { param($a, $b) if ([string]::IsNullOrEmpty($a)) { $b } else { $a } }
function Log  { param($tag, $msg) Write-Host "[$tag] $msg" -ForegroundColor Cyan }
function Fail { param($tag, $msg) Write-Host "[$tag] $msg" -ForegroundColor Red }

function Require-Cmd {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Fail 'deps' "missing $Name"
        exit 127
    }
}

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { return }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { return }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim()
        if ($val.Length -ge 2 -and (
              ($val.StartsWith('"') -and $val.EndsWith('"')) -or
              ($val.StartsWith("'") -and $val.EndsWith("'")))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        if ([string]::IsNullOrEmpty((Get-Item "env:$key" -ErrorAction SilentlyContinue).Value)) {
            Set-Item -Path "env:$key" -Value $val
        }
    }
}

function Require-Env {
    param([string[]]$Names)
    $missing = @()
    foreach ($n in $Names) {
        $v = (Get-Item "env:$n" -ErrorAction SilentlyContinue).Value
        if ([string]::IsNullOrEmpty($v)) { $missing += $n }
    }
    if ($missing.Count -gt 0) {
        Fail 'env' ("missing required: " + ($missing -join ', '))
        Write-Host "   set them in your shell or in $ScriptDir\.env" -ForegroundColor Red
        exit 64
    }
}

Require-Cmd 'aws'
Require-Cmd 'docker'
Require-Cmd 'npm'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path

Import-DotEnv (Join-Path $ScriptDir '.env')
Require-Env @('AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_REGION',
              'AWS_ACCOUNT_ID','BACKEND_REPO','FRONTEND_REPO')

$AwsAccountId = $env:AWS_ACCOUNT_ID
$AwsRegion    = $env:AWS_REGION
$BackendRepo  = $env:BACKEND_REPO
$FrontendRepo = $env:FRONTEND_REPO
$ImageTag     = Coalesce $env:IMAGE_TAG 'latest'
$EcrHost      = Coalesce $env:ECR_HOST "$AwsAccountId.dkr.ecr.$AwsRegion.amazonaws.com"

Set-Location $RepoRoot

if ($env:SKIP_TESTS -eq '1') {
    Log 'test' 'SKIP_TESTS=1 — skipping npm run test:all'
} else {
    Log 'test' 'running npm run test:all (must pass before build/push)'
    & npm run test:all
    if ($LASTEXITCODE -ne 0) {
        Fail 'test' "npm run test:all failed (rc=$LASTEXITCODE) — aborting before build/push"
        exit 1
    }
    Log 'test' 'all tests passed'
}

$LogDir = Join-Path ([System.IO.Path]::GetTempPath()) ("ecr-push-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

Log 'ecr' "logging in to $EcrHost"
$pw = (& aws ecr get-login-password --region $AwsRegion)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($pw)) {
    Fail 'ecr' "aws ecr get-login-password failed (rc=$LASTEXITCODE)"
    exit 1
}
$pw.Trim() | & docker login --username AWS --password-stdin $EcrHost | Out-Null
if ($LASTEXITCODE -ne 0) {
    Fail 'ecr' "docker login failed (rc=$LASTEXITCODE)"
    exit 1
}
Log 'ecr' 'logged in'

$FeArgNames = @(
    'ENCRYPTION_KEY','CSRF_SECRET',
    'NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE',
    'STRIPE_API_KEY','STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_STARTER','STRIPE_PRICE_PROFESSIONAL','STRIPE_PRICE_ENTERPRISE'
)
$FeBuildArgs = @()
foreach ($n in $FeArgNames) {
    $val = (Get-Item "env:$n" -ErrorAction SilentlyContinue).Value
    if (-not [string]::IsNullOrEmpty($val)) {
        $FeBuildArgs += '--build-arg'
        $FeBuildArgs += "$n=$val"
    }
}

$BackendLog  = Join-Path $LogDir 'backend.log'
$FrontendLog = Join-Path $LogDir 'frontend.log'

Log 'build' "backend  -> ${BackendRepo}:${ImageTag}  (log: $BackendLog)"
Log 'build' "frontend -> ${FrontendRepo}:${ImageTag} (log: $FrontendLog)"

$beArgs = @(
    'build',
    '-t', "${BackendRepo}:${ImageTag}",
    '-t', "$EcrHost/${BackendRepo}:${ImageTag}",
    '-f', 'backend/Dockerfile', 'backend'
)
$feArgs = @('build') + $FeBuildArgs + @(
    '-t', "${FrontendRepo}:${ImageTag}",
    '-t', "$EcrHost/${FrontendRepo}:${ImageTag}",
    '-f', 'Dockerfile', '.'
)

$beProc = Start-Process -FilePath 'docker' -ArgumentList $beArgs `
    -RedirectStandardOutput $BackendLog -RedirectStandardError "$BackendLog.err" `
    -WorkingDirectory $RepoRoot -NoNewWindow -PassThru
$feProc = Start-Process -FilePath 'docker' -ArgumentList $feArgs `
    -RedirectStandardOutput $FrontendLog -RedirectStandardError "$FrontendLog.err" `
    -WorkingDirectory $RepoRoot -NoNewWindow -PassThru

# Live progress: tail last line of each log every 5s
while (-not $beProc.HasExited -or -not $feProc.HasExited) {
    $beState = if ($beProc.HasExited) { 'done' } else { 'running' }
    $feState = if ($feProc.HasExited) { 'done' } else { 'running' }
    $beTail = ''
    $feTail = ''
    if (Test-Path $BackendLog)  { $beTail = (Get-Content $BackendLog  -Tail 1 -ErrorAction SilentlyContinue) }
    if (Test-Path $FrontendLog) { $feTail = (Get-Content $FrontendLog -Tail 1 -ErrorAction SilentlyContinue) }
    if ($beTail.Length -gt 90) { $beTail = $beTail.Substring(0, 90) }
    if ($feTail.Length -gt 90) { $feTail = $feTail.Substring(0, 90) }
    Write-Host ("[backend  {0,-7}] {1}" -f $beState, $beTail)
    Write-Host ("[frontend {0,-7}] {1}" -f $feState, $feTail)
    Start-Sleep -Seconds 5
}

$beRc = $beProc.ExitCode
$feRc = $feProc.ExitCode

function Dump-Tail($path, $errPath, $tag) {
    if (Test-Path $path)    { Get-Content $path    -Tail 60 | ForEach-Object { Write-Host "[$tag] $_" } }
    if (Test-Path $errPath) { Get-Content $errPath -Tail 60 | ForEach-Object { Write-Host "[$tag][err] $_" } }
}

if ($beRc -ne 0) { Fail 'backend'  "build failed (rc=$beRc) — log:";  Dump-Tail $BackendLog  "$BackendLog.err"  'backend' }
if ($feRc -ne 0) { Fail 'frontend' "build failed (rc=$feRc) — log:"; Dump-Tail $FrontendLog "$FrontendLog.err" 'frontend' }
if ($beRc -ne 0 -or $feRc -ne 0) { exit 1 }

Log 'build' 'both images built'

Log 'push' 'pushing in parallel'
$BackendPushLog  = Join-Path $LogDir 'push-backend.log'
$FrontendPushLog = Join-Path $LogDir 'push-frontend.log'

$bePush = Start-Process -FilePath 'docker' -ArgumentList @('push', "$EcrHost/${BackendRepo}:${ImageTag}") `
    -RedirectStandardOutput $BackendPushLog -RedirectStandardError "$BackendPushLog.err" `
    -NoNewWindow -PassThru
$fePush = Start-Process -FilePath 'docker' -ArgumentList @('push', "$EcrHost/${FrontendRepo}:${ImageTag}") `
    -RedirectStandardOutput $FrontendPushLog -RedirectStandardError "$FrontendPushLog.err" `
    -NoNewWindow -PassThru

$bePush.WaitForExit() | Out-Null
$fePush.WaitForExit() | Out-Null
$bePushRc = $bePush.ExitCode
$fePushRc = $fePush.ExitCode

if ($bePushRc -ne 0) { Fail 'backend'  "push failed (rc=$bePushRc) — log:";  Dump-Tail $BackendPushLog  "$BackendPushLog.err"  'backend' }
if ($fePushRc -ne 0) { Fail 'frontend' "push failed (rc=$fePushRc) — log:"; Dump-Tail $FrontendPushLog "$FrontendPushLog.err" 'frontend' }
if ($bePushRc -ne 0 -or $fePushRc -ne 0) { exit 1 }

Log 'done' "$EcrHost/${BackendRepo}:${ImageTag}"
Log 'done' "$EcrHost/${FrontendRepo}:${ImageTag}"
