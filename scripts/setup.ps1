$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        & uv sync --frozen --extra dev
        if ($LASTEXITCODE -ne 0) { throw 'Locked uv dependency installation failed.' }
    } else {
        if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
            & python -m venv .venv
            if ($LASTEXITCODE -ne 0) { throw 'Python 3.11+ is required.' }
        }
        & '.\.venv\Scripts\python.exe' -m pip install -r requirements.lock.txt
        if ($LASTEXITCODE -ne 0) { throw 'Locked Python dependency installation failed.' }
        & '.\.venv\Scripts\python.exe' -m pip install --no-deps -e .
        if ($LASTEXITCODE -ne 0) { throw 'Editable package installation failed.' }
    }
    if (-not (Test-Path -LiteralPath '.env')) {
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
    }
    Push-Location frontend
    try {
        if (Test-Path -LiteralPath 'package-lock.json') { & npm.cmd ci } else { & npm.cmd install }
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    } finally { Pop-Location }
    & '.\.venv\Scripts\python.exe' -m deskpilot.cli init
    if ($LASTEXITCODE -ne 0) { throw 'Initialization failed; existing data was not deleted.' }
    Write-Host 'Ready. Run .\scripts\start.ps1. Edit .env only when you want cloud APIs.'
} finally { Pop-Location }
