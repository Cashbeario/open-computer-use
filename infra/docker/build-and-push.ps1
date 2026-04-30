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

# ---------- 0. derive immutable version tag ----------
# Format: v<YYYY-MM-DD>-<git-short-sha>[-dirty].  When the operator passed
# IMAGE_TAG explicitly (anything other than the "latest" default), respect
# their value as the version tag.
if ($ImageTag -eq 'latest') {
    $GitSha = (& git -C $RepoRoot rev-parse --short=7 HEAD 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($GitSha)) { $GitSha = 'unknown' }
    $GitDate = [datetime]::UtcNow.ToString('yyyy-MM-dd')
    & git -C $RepoRoot diff-index --quiet HEAD -- 2>$null
    $GitDirty = if ($LASTEXITCODE -ne 0) { '-dirty' } else { '' }
    $VersionTag = "v${GitDate}-${GitSha}${GitDirty}"
} else {
    $VersionTag = $ImageTag
}
Log 'version' "tag for this build: $VersionTag"
if ($VersionTag.EndsWith('-dirty')) {
    Log 'version' 'WARNING: working tree is dirty -- versioned tag is not reproducible from git alone'
}

$BackendVersionTarget  = "$EcrHost/${BackendRepo}:${VersionTag}"
$BackendLatestTarget   = "$EcrHost/${BackendRepo}:latest"
$FrontendVersionTarget = "$EcrHost/${FrontendRepo}:${VersionTag}"
$FrontendLatestTarget  = "$EcrHost/${FrontendRepo}:latest"

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
# Tag with BOTH the immutable version (canonical, what prod runs) and :latest
# (mutable pointer for local-dev convenience and rollback fallback).
Log 'tag' "tagging images for $EcrHost (version=$VersionTag + latest)"
foreach ($pair in @(
    @('llmhub-backend:latest',  $BackendVersionTarget),
    @('llmhub-backend:latest',  $BackendLatestTarget),
    @('llmhub-frontend:latest', $FrontendVersionTarget),
    @('llmhub-frontend:latest', $FrontendLatestTarget)
)) {
    & docker tag $pair[0] $pair[1]
    if ($LASTEXITCODE -ne 0) { Fail 'tag' "tag $($pair[1]) failed (rc=$LASTEXITCODE)"; exit 1 }
}

# ---------- 5. push (sequential) ----------
# After the first push of a given digest, the second push of the same digest
# under a different tag is manifest-only (~ms), so re-pushing :latest after
# the versioned tag is essentially free.
foreach ($target in @($BackendVersionTarget, $BackendLatestTarget,
                      $FrontendVersionTarget, $FrontendLatestTarget)) {
    Log 'push' "pushing $target"
    & docker push $target
    if ($LASTEXITCODE -ne 0) {
        Fail 'push' "push $target failed (rc=$LASTEXITCODE)"
        exit 1
    }
}

Log 'push' "$BackendVersionTarget  (+ :latest)"
Log 'push' "$FrontendVersionTarget (+ :latest)"

# ---------- 5b. update Terraform image manifest + deploy log ----------
# versions.auto.tfvars overrides the defaults in terraform.tfvars.  Writing
# the FULL URI:tag string means terraform diffs the exact tag, which forces
# ECS to register a new task-def revision and trigger a rolling deploy.
$VersionsFile = Join-Path $RepoRoot 'infra/aws/versions.auto.tfvars'
Log 'tfvars' "writing $VersionsFile"
$nowUtc = [datetime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$user   = if ([string]::IsNullOrEmpty($env:USERNAME)) { 'unknown' } else { $env:USERNAME }
$content = @"
# =============================================================================
# Image-tag manifest -- auto-generated by infra/docker/build-and-push.ps1
# (last run: $nowUtc by $user).
# Do not hand-edit during a deploy.  See infra/docker/rollback.ps1 for rollback.
# =============================================================================
frontend_image = "$FrontendVersionTarget"
backend_image  = "$BackendVersionTarget"
"@
# Force UTF8 (no BOM) so the file matches the bash-script output and so
# Terraform reads it identically across both platforms.
[System.IO.File]::WriteAllText($VersionsFile, $content + "`n",
    (New-Object System.Text.UTF8Encoding $false))

$DeployLog = Join-Path $ScriptDir 'deployments.log'
$gitMsg = (& git -C $RepoRoot log -1 --pretty=format:'%s' 2>$null)
if ($LASTEXITCODE -ne 0 -or $null -eq $gitMsg) { $gitMsg = '' }
$line = "{0}`t{1}`t{2}`t{3}`t{4}`n" -f $nowUtc, 'deploy', $VersionTag, $user, $gitMsg
[System.IO.File]::AppendAllText($DeployLog, $line,
    (New-Object System.Text.UTF8Encoding $false))
Log 'audit' "appended deploy entry to $DeployLog"

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
