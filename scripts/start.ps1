$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Run scripts\setup.ps1 first.' }
$logRoot = Join-Path $projectRoot '.cache\logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backendProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'deskpilot.cli', 'serve') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logRoot "backend-$runStamp.out.log") `
    -RedirectStandardError (Join-Path $logRoot "backend-$runStamp.err.log")
try {
    Start-Sleep -Seconds 2
    if ($backendProcess.HasExited) { throw "Backend failed. Read logs in $logRoot" }
    Write-Host 'UI: http://localhost:5173  API: http://localhost:8000/docs  Ctrl+C stops this session.'
    Push-Location (Join-Path $projectRoot 'frontend')
    try { & npm.cmd run dev -- --host 127.0.0.1 } finally { Pop-Location }
} finally {
    if (-not $backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id }
}
