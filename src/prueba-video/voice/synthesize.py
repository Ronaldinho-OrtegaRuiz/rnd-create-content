#!/usr/bin/env python3
"""
Síntesis de voz (fase 2 — cuando exista modelo RVC entrenado).

Hoy: valida modelo + demo Piper TTS (voz genérica, sin clonación).
Uso:
  python synthesize.py --text "Hello world" --lang en --out output.wav
  python synthesize.py --slides slides.json --lang es --out narration.wav
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

VOICE_DIR = Path(__file__).resolve().parent


def load_config() -> dict:
    with open(VOICE_DIR / "config.json", encoding="utf-8") as f:
        return json.load(f)


def model_paths(lang: str) -> tuple[Path | None, Path | None]:
    models = VOICE_DIR / "models"
    pth = models / f"fractal-voice-{lang}.pth"
    index = models / f"fractal-voice-{lang}.index"
    if not pth.is_file():
        pth = models / "fractal-voice.pth"
    if not index.is_file():
        index = None
    elif not index.exists():
        index = None
    return (pth if pth.is_file() else None, index if index and index.is_file() else None)


def slides_to_text(slides: list) -> str:
    parts = []
    for s in slides:
        t = str(s.get("text", "")).strip()
        if t:
            parts.append(t)
    return " ".join(parts)


def run_piper(text: str, lang: str, out_path: Path, cfg: dict) -> None:
    voice_key = "es" if lang == "es" else "en"
    voice_name = cfg.get("piper", {}).get(voice_key, "en_US-lessac-medium")
    print(f"[synthesize] Piper TTS ({voice_name}) — modelo RVC aún no aplicado")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        # piper descarga modelos en primera ejecución
        cmd = [
            sys.executable,
            "-m",
            "piper",
            "-m",
            voice_name,
            "-f",
            str(out_path),
            "--",
            text,
        ]
        run = subprocess.run(cmd, capture_output=True, text=True, cwd=tmp_dir)
        if run.returncode != 0:
            raise RuntimeError(
                "Piper falló. ¿Instalaste dependencias?\n"
                f"  pip install -r {VOICE_DIR / 'requirements.txt'}\n"
                f"{run.stderr}"
            )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", default="")
    parser.add_argument("--slides", help="JSON array de {text, duration_sec}")
    parser.add_argument("--lang", choices=["es", "en"], default="es")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    cfg = load_config()
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if args.slides:
        with open(args.slides, encoding="utf-8") as f:
            slides = json.load(f)
        text = slides_to_text(slides)
    else:
        text = args.text.strip()

    if not text:
        print("ERROR: --text o --slides requerido", file=sys.stderr)
        return 1

    pth, index = model_paths(args.lang)
    if pth is None:
        print(
            f"AVISO: no hay modelo en models/ (fractal-voice-{args.lang}.pth). "
            "Generando solo con Piper (voz genérica).",
            file=sys.stderr,
        )
    else:
        print(f"[synthesize] Modelo encontrado: {pth.name}")
        if index:
            print(f"[synthesize] Index: {index.name}")
        print("[synthesize] RVC inference se conectará aquí en la siguiente fase.")

    try:
        run_piper(text, args.lang, out_path, cfg)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    print(f"OK → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
