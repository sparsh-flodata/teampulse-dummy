param([int]$Port = 8787,[switch]$Rebuild)
& (Join-Path $PSScriptRoot 'scripts/start.ps1') -Port $Port -Rebuild:$Rebuild
