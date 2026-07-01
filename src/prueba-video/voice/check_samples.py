#!/usr/bin/env python3
"""
Valida muestras de voz en samples/es y samples/en.
Uso: python check_samples.py [--lang es|en|all]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import soundfile as sf
except ImportError:
    print("ERROR: instala dependencias → pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

VOICE_DIR = Path(__file__).resolve().parent
AUDIO_EXT = {".wav", ".mp3", ".flac", ".m4a", ".ogg", ".aac"}


def load_config() -> dict:
    with open(VOICE_DIR / "config.json", encoding="utf-8") as f:
        return json.load(f)


def scan_lang(lang: str, cfg: dict) -> dict:
    rel = cfg["samples"][lang]
    folder = VOICE_DIR / rel
    min_total = float(cfg.get("min_total_duration_sec", 900))
    recommended = float(cfg.get("recommended_total_duration_sec", 1200))
    min_file = float(cfg.get("min_file_duration_sec", 3))

    files: list[Path] = []
    if folder.is_dir():
        for p in sorted(folder.iterdir()):
            if p.is_file() and p.suffix.lower() in AUDIO_EXT:
                files.append(p)

    entries = []
    total_sec = 0.0
    errors = []

    for p in files:
        try:
            info = sf.info(str(p))
            dur = float(info.duration)
            sr = int(info.samplerate)
            total_sec += dur
            entries.append(
                {
                    "file": p.name,
                    "duration_sec": round(dur, 2),
                    "sample_rate_hz": sr,
                    "channels": info.channels,
                }
            )
            if dur < min_file:
                errors.append(f"{p.name}: muy corto ({dur:.1f}s < {min_file}s)")
            if sr < 22050:
                errors.append(f"{p.name}: sample rate bajo ({sr} Hz; ideal ≥ 44100)")
            if info.channels > 1:
                errors.append(f"{p.name}: estéreo ({info.channels} ch); mono preferido")
        except Exception as e:
            errors.append(f"{p.name}: no se pudo leer ({e})")

    if not files:
        errors.append(f"sin archivos de audio en {folder}")

    ok = total_sec >= min_total and not any("no se pudo" in e or "sin archivos" in e for e in errors)

    return {
        "lang": lang,
        "folder": str(folder),
        "file_count": len(files),
        "total_duration_sec": round(total_sec, 2),
        "total_minutes": round(total_sec / 60, 2),
        "min_required_sec": min_total,
        "recommended_sec": recommended,
        "ready_for_prepare": ok and len(files) > 0,
        "files": entries,
        "warnings": [e for e in errors if "estéreo" in e or "sample rate" in e],
        "errors": [e for e in errors if e not in []],
    }


def print_report(report: dict) -> None:
    lang = report["lang"].upper()
    print(f"\n── {lang} ─────────────────────────────────────")
    print(f"  Carpeta:   {report['folder']}")
    print(f"  Archivos:  {report['file_count']}")
    print(f"  Duración:  {report['total_minutes']} min ({report['total_duration_sec']} s)")
    print(f"  Mínimo:    {report['min_required_sec'] / 60:.0f} min ({report['min_required_sec']} s)")
    print(f"  Ideal:     {report['recommended_sec'] / 60:.0f} min")

    for entry in report["files"]:
        print(f"    · {entry['file']} — {entry['duration_sec']}s @ {entry['sample_rate_hz']} Hz")

    for w in report.get("warnings", []):
        print(f"  AVISO: {w}")
    for e in report.get("errors", []):
        if e not in report.get("warnings", []):
            print(f"  ERROR: {e}")

    if report["ready_for_prepare"]:
        print(f"  ✓ Listo para: npm run voice:prepare")
    else:
        print(f"  ✗ Falta audio o duración insuficiente")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validar muestras de voz Fractal Voice")
    parser.add_argument("--lang", choices=["es", "en", "all"], default="all")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    cfg = load_config()
    langs = ["es", "en"] if args.lang == "all" else [args.lang]
    reports = [scan_lang(lang, cfg) for lang in langs]

    if args.json:
        print(json.dumps(reports, indent=2, ensure_ascii=False))
    else:
        print("Fractal Voice — validación de muestras")
        for r in reports:
            print_report(r)

    all_ready = all(r["ready_for_prepare"] for r in reports)
    if not args.json:
        print()
        if all_ready:
            print("TODO OK. Siguiente paso: npm run voice:prepare")
        else:
            print("Coloca los audios en samples/es/ y samples/en/ y vuelve a ejecutar.")
    return 0 if all_ready else 1


if __name__ == "__main__":
    sys.exit(main())
