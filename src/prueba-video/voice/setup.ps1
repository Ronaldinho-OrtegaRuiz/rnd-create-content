#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$VoiceDir = $PSScriptRoot
Set-Location $VoiceDir

Write-Host "Fractal Voice — setup Python" -ForegroundColor Cyan

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Instala Python 3.10+ desde python.org y vuelve a ejecutar."
}

if (-not (Test-Path ".venv")) {
    Write-Host "Creando .venv…"
    python -m venv .venv
}

$py = Join-Path $VoiceDir ".venv\Scripts\python.exe"
& $py -m pip install --upgrade pip
& $py -m pip install -r requirements.txt

Write-Host ""
Write-Host "OK. Siguiente:" -ForegroundColor Green
Write-Host "  1. Graba con los guiones en recording/"
Write-Host "  2. Copia audios a samples/es/ y samples/en/"
Write-Host "  3. npm run voice:check"
Write-Host "  4. npm run voice:train"
