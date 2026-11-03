param([int]$Port = 8787,[switch]$Rebuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) { throw 'Run uv sync first. See README.md.' }
if ($Rebuild -or -not (Test-Path -LiteralPath 'frontend/dist/client/index.html')) {
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'The frontend build failed.' }
}
Write-Host "TeamPulse: http://127.0.0.1:$Port"
& .venv/Scripts/python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port $Port
