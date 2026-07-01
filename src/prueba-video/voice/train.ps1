#Requires -Version 5.1
<#
.SYNOPSIS
  Fractal Voice — preparación y entrenamiento RVC (Windows + AMD).

.DESCRIPTION
  1. Valida muestras (check_samples.py)
  2. Prepara datasets (prepare_rvc_dataset.py)
  3. Guía para entrenar con RVC WebUI (no incluido en el repo)

  Uso desde la raíz del repo:
    npm run voice:train
#>

$ErrorActionPreference = "Stop"
$VoiceDir = $PSScriptRoot
$RepoRoot = Resolve-Path (Join-Path $VoiceDir "..\..\..")

Set-Location $RepoRoot

function Get-Python {
    $venvPy = Join-Path $VoiceDir ".venv\Scripts\python.exe"
    if (Test-Path $venvPy) { return $venvPy }
    $py = Get-Command python -ErrorAction SilentlyContinue
    if ($py) { return $py.Source }
    throw "Python no encontrado. Crea venv: cd src/prueba-video/voice && python -m venv .venv"
}

$python = Get-Python
Write-Host ""
Write-Host "Fractal Voice — entrenamiento RVC" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"
Write-Host ""

# --- 1. Validar muestras ---
Write-Host "[1/3] Validando muestras..." -ForegroundColor Yellow
& $python (Join-Path $VoiceDir "check_samples.py")
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Faltan audios o duración insuficiente." -ForegroundColor Red
    Write-Host "Coloca archivos en:" -ForegroundColor Red
    Write-Host "  src/prueba-video/voice/samples/es/"
    Write-Host "  src/prueba-video/voice/samples/en/"
    Write-Host "Guiones: src/prueba-video/voice/recording/"
    exit 1
}

# --- 2. Preparar dataset ---
Write-Host ""
Write-Host "[2/3] Preparando datasets para RVC..." -ForegroundColor Yellow
& $python (Join-Path $VoiceDir "prepare_rvc_dataset.py")
if ($LASTEXITCODE -ne 0) { exit 1 }

# --- 3. Instrucciones RVC WebUI ---
$esDataset = Join-Path $VoiceDir "datasets\es\raw"
$enDataset = Join-Path $VoiceDir "datasets\en\raw"
$modelsDir = Join-Path $VoiceDir "models"

Write-Host ""
Write-Host "[3/3] Entrenar con RVC WebUI (manual, una vez por idioma)" -ForegroundColor Yellow
Write-Host ""
Write-Host "RVC no viene embebido en este repo (es pesado). Descarga la versión AMD/DirectML:" -ForegroundColor Gray
Write-Host "  https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI" -ForegroundColor Gray
Write-Host "  Usa: pip install -r requirements-dml.txt  (Windows + AMD)" -ForegroundColor Gray
Write-Host ""
Write-Host "Por cada idioma (ES y EN):" -ForegroundColor White
Write-Host "  A. Train → Process data → Dataset: $esDataset" -ForegroundColor White
Write-Host "  B. Train → Extract feature + pitch" -ForegroundColor White
Write-Host "  C. Train → Train model → name: fractal-voice-es → epochs: 200" -ForegroundColor White
Write-Host "  D. Repite con: $enDataset → fractal-voice-en" -ForegroundColor White
Write-Host ""
Write-Host "Al terminar, copia a:" -ForegroundColor White
Write-Host "  $modelsDir" -ForegroundColor White
Write-Host "  fractal-voice-es.pth  +  fractal-voice-es.index" -ForegroundColor White
Write-Host "  fractal-voice-en.pth  +  fractal-voice-en.index" -ForegroundColor White
Write-Host ""
Write-Host "Luego prueba:" -ForegroundColor Green
Write-Host "  npm run voice:synth -- --text `"Hola, esto es una prueba`" --lang es --out output/test.wav" -ForegroundColor Green
Write-Host ""
