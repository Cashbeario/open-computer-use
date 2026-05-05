#requires -Version 5.1
<#
    dev.ps1 - Run frontend (Next.js) and backend (FastAPI) together.
    Ctrl+C stops both and frees ports 3000/8001. No new windows.
#>

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$script:processes = @()

function Stop-DevServers {
    Write-Host ""
    Write-Host "[dev] Stopping servers..." -ForegroundColor Yellow

    foreach ($p in $script:processes) {
        if ($null -ne $p -and -not $p.HasExited) {
            # /T kills the entire child tree (npm -> node -> next dev), /F = force
            & taskkill.exe /F /T /PID $p.Id 2>&1 | Out-Null
        }
    }

    foreach ($port in 3000, 8001) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "[dev] Stopped." -ForegroundColor Green
}

try {
    $venvPython = Join-Path $root 'backend\venv\Scripts\python.exe'
    if (-not (Test-Path $venvPython)) {
        Write-Host "[dev] venv missing at $venvPython" -ForegroundColor Red
        Write-Host "[dev] Run backend\run_backend.bat once to create it, then re-run dev.ps1." -ForegroundColor Red
        exit 1
    }

    if (-not $env:DEBUG)       { $env:DEBUG = 'true' }
    if (-not $env:ENVIRONMENT) { $env:ENVIRONMENT = 'development' }

    Write-Host "[dev] Starting backend  (FastAPI on :8001) in its own window..." -ForegroundColor Cyan
    # Backend runs in a separate console window so uvicorn's reload (which sends
    # CTRL_C_EVENT to its own process group) doesn't tear down the frontend or
    # this dev script. Without this, every backend file save would kill the stack.
    $backend = Start-Process -FilePath 'powershell.exe' `
        -ArgumentList '-NoProfile','-NoExit','-Command',"`$Host.UI.RawUI.WindowTitle='Coasty Backend'; & `"$venvPython`" main.py" `
        -WorkingDirectory (Join-Path $root 'backend') `
        -PassThru
    $script:processes += $backend

    Start-Sleep -Milliseconds 400

    Write-Host "[dev] Starting frontend (Next.js on :3000)..." -ForegroundColor Cyan
    $frontend = Start-Process -FilePath 'npm.cmd' `
        -ArgumentList 'run','dev' `
        -WorkingDirectory $root `
        -NoNewWindow -PassThru
    $script:processes += $frontend

    Write-Host ""
    Write-Host "[dev]  Frontend  http://localhost:3000" -ForegroundColor Green
    Write-Host "[dev]  Backend   http://localhost:8001" -ForegroundColor Green
    Write-Host "[dev]  Ctrl+C to stop both." -ForegroundColor Yellow
    Write-Host ""

    while (-not $backend.HasExited -and -not $frontend.HasExited) {
        Start-Sleep -Seconds 1
    }

    if ($backend.HasExited)  { Write-Host "[dev] Backend exited (code $($backend.ExitCode))."   -ForegroundColor Red }
    if ($frontend.HasExited) { Write-Host "[dev] Frontend exited (code $($frontend.ExitCode))." -ForegroundColor Red }
}
finally {
    Stop-DevServers
}
