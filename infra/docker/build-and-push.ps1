<#
.SYNOPSIS
    Build & push backend + frontend Docker images to AWS ECR, then deploy.

.DESCRIPTION
    Pipeline:
      1. npm run test:all       (skip with SKIP_TESTS=1)
      2. aws ecr login
      3. docker compose build   (reads repo-root .env for build args)
      4. docker tag for ECR
      5. docker push (sequential)
      6. terraform apply        (interactive -- you type "yes"; skip with SKIP_TERRAFORM=1)

    Required env (in infra/docker/.env or shell):
      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
      AWS_ACCOUNT_ID, BACKEND_REPO, FRONTEND_REPO

    Optional env:
      AWS_SESSION_TOKEN, IMAGE_TAG (default: latest), ECR_HOST,
      SKIP_TESTS=1, SKIP_TERRAFORM=1, COMPOSE_FILE (default: docker-compose.yml),
      TF_DIR (default: infra/aws)
#>

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

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

$AwsRegion    = $env:AWS_REGION
$BackendRepo  = $env:BACKEND_REPO
$FrontendRepo = $env:FRONTEND_REPO
$ImageTag     = if ([string]::IsNullOrEmpty($env:IMAGE_TAG))    { 'latest' } else { $env:IMAGE_TAG }
$EcrHost      = if ([string]::IsNullOrEmpty($env:ECR_HOST))     { "$($env:AWS_ACCOUNT_ID).dkr.ecr.$AwsRegion.amazonaws.com" } else { $env:ECR_HOST }
$ComposeFile  = if ([string]::IsNullOrEmpty($env:COMPOSE_FILE)) { 'docker-compose.yml' } else { $env:COMPOSE_FILE }

$BackendTarget  = "$EcrHost/${BackendRepo}:${ImageTag}"
$FrontendTarget = "$EcrHost/${FrontendRepo}:${ImageTag}"

Set-Location $RepoRoot

# ---------- 1. tests ----------
if ($env:SKIP_TESTS -eq '1') {
    Log 'test' 'SKIP_TESTS=1 -- skipping npm run test:all'
} else {
    Log 'test' 'running npm run test:all (must pass before build/push)'
    & npm run test:all
    if ($LASTEXITCODE -ne 0) {
        Fail 'test' "npm run test:all failed (rc=$LASTEXITCODE) -- aborting"
        exit 1
    }
    Log 'test' 'all tests passed'
}

# ---------- 2. ECR login ----------
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

# ---------- 3. compose build ----------
# Compose auto-reads ./.env for build args (Stripe/Supabase/Encryption keys).
# Outputs local images: llmhub-backend:latest, llmhub-frontend:latest
Log 'build' "docker compose -f $ComposeFile build"
& docker compose -f $ComposeFile build
if ($LASTEXITCODE -ne 0) {
    Fail 'build' "docker compose build failed (rc=$LASTEXITCODE)"
    exit 1
}

# ---------- 4. tag for ECR ----------
Log 'tag' "tagging images for $EcrHost"
& docker tag 'llmhub-backend:latest' $BackendTarget
if ($LASTEXITCODE -ne 0) { Fail 'tag' "backend tag failed (rc=$LASTEXITCODE)"; exit 1 }
& docker tag 'llmhub-frontend:latest' $FrontendTarget
if ($LASTEXITCODE -ne 0) { Fail 'tag' "frontend tag failed (rc=$LASTEXITCODE)"; exit 1 }

# ---------- 5. push (sequential) ----------
Log 'push' "pushing $BackendTarget"
& docker push $BackendTarget
if ($LASTEXITCODE -ne 0) {
    Fail 'backend' "push failed (rc=$LASTEXITCODE)"
    exit 1
}

Log 'push' "pushing $FrontendTarget"
& docker push $FrontendTarget
if ($LASTEXITCODE -ne 0) {
    Fail 'frontend' "push failed (rc=$LASTEXITCODE)"
    exit 1
}

Log 'push' $BackendTarget
Log 'push' $FrontendTarget

# ---------- 6. terraform apply ----------
$TfDir = if ([string]::IsNullOrEmpty($env:TF_DIR)) { 'infra/aws' } else { $env:TF_DIR }
if ($env:SKIP_TERRAFORM -eq '1') {
    Log 'tf' 'SKIP_TERRAFORM=1 -- skipping terraform apply'
} else {
    Require-Cmd 'terraform'
    $TfPath = Join-Path $RepoRoot $TfDir
    if (-not (Test-Path $TfPath)) {
        Fail 'tf' "$TfDir not found in repo root"
        exit 1
    }
    Log 'tf' "running 'terraform apply' in $TfDir (you will be prompted to type 'yes')"
    Push-Location $TfPath
    try {
        & terraform apply
        $TfRc = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($TfRc -ne 0) {
        Fail 'tf' "terraform apply failed (rc=$TfRc) -- images already pushed to ECR"
        exit 1
    }
    Log 'tf' 'terraform apply completed'
}

Log 'done' 'build, push, and terraform apply complete'
