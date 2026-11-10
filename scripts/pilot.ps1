# Runs TeamPulse for the proactive-assistant pilot: one backend process (the check-in tick runs inside it)
# plus the ngrok tunnel on the reserved domain, so Google Chat replies keep arriving. Each is restarted if it exits.
# Started at logon by the scheduled task from scripts/register-pilot-task.ps1. See docs/PILOT_RUNBOOK.md.
param([int]$Port = 8787)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) { throw 'Run uv sync first. See README.md.' }
if (-not (Test-Path -LiteralPath 'frontend/dist/client/index.html')) { throw 'Run pnpm build first. See README.md.' }
$domain = (Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^\s*NGROK_DOMAIN\s*=' } | ForEach-Object { ($_ -split '=', 2)[1].Trim() }) | Select-Object -First 1
if (-not $domain) { throw 'Set NGROK_DOMAIN (your reserved ngrok domain, without https://) in .env.' }
$logs = Join-Path $projectRoot 'data/logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Start-Backend {
    # No --workers: a single process, so there is exactly one check-in tick.
    Start-Process -FilePath '.venv/Scripts/python.exe' -ArgumentList '-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', $Port `
        -RedirectStandardOutput (Join-Path $logs 'backend.out.log') -RedirectStandardError (Join-Path $logs 'backend.err.log') -WindowStyle Hidden -PassThru
}
function Start-Tunnel {
    Start-Process -FilePath 'ngrok' -ArgumentList 'http', "--url=https://$domain", "127.0.0.1:$Port", '--log', (Join-Path $logs 'ngrok.log') -WindowStyle Hidden -PassThru
}

$backend = Start-Backend
$tunnel = Start-Tunnel
while ($true) {
    Start-Sleep -Seconds 30
    if ($backend.HasExited) { Add-Content (Join-Path $logs 'pilot.log') "$(Get-Date -Format o) backend exited ($($backend.ExitCode)); restarting"; $backend = Start-Backend }
    if ($tunnel.HasExited) { Add-Content (Join-Path $logs 'pilot.log') "$(Get-Date -Format o) ngrok exited ($($tunnel.ExitCode)); restarting"; $tunnel = Start-Tunnel }
}
