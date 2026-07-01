#!/usr/bin/env python3
"""
Convierte y copia muestras a datasets/{lang}/raw/ listos para RVC WebUI.
Requiere: pip install -r requirements.txt  y  ffmpeg en PATH.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

VOICE_DIR = Path(__file__).resolve().parent
AUDIO_EXT = {".wav", ".mp3", ".flac", ".m4a", ".ogg", ".aac"}
TARGET_SR = 44100


def load_config() -> dict:
    with open(VOICE_DIR / "config.json", encoding="utf-8") as f:
        return json.load(f)


def ffmpeg_bin() -> str:
    return shutil.which("ffmpeg") or "ffmpeg"


def convert_to_wav(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_bin(),
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        str(TARGET_SR),
        "-c:a",
        "pcm_s16le",
        str(dst),
    ]
    run = subprocess.run(cmd, capture_output=True, text=True)
    if run.returncode != 0:
        raise RuntimeError(run.stderr or f"ffmpeg falló en {src.name}")


def prepare_lang(lang: str, cfg: dict) -> list[Path]:
    src_dir = VOICE_DIR / cfg["samples"][lang]
    out_dir = VOICE_DIR / cfg["datasets"][lang]
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    sources = sorted(
        p for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() in AUDIO_EXT
    )
    if not sources:
        raise FileNotFoundError(f"Sin audio en {src_dir}")

    outputs: list[Path] = []
    for i, src in enumerate(sources, start=1):
        out_name = f"{lang}_{i:02d}_{src.stem}.wav"
        dst = out_dir / out_name
        print(f"  [{lang}] {src.name} → {out_name}")
        convert_to_wav(src, dst)
        outputs.append(dst)
    return outputs


def main() -> int:
    if not shutil.which("ffmpeg"):
        print("ERROR: ffmpeg no está en PATH.", file=sys.stderr)
        print("  El repo usa ffmpeg-static en Node; para Python instala ffmpeg o añádelo al PATH.", file=sys.stderr)
        return 1

    cfg = load_config()
    print("Fractal Voice — preparar dataset RVC\n")

    try:
        for lang in ("es", "en"):
            prepare_lang(lang, cfg)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    model = cfg.get("model_name", "fractal-voice")
    rvc = cfg.get("rvc", {})
    es_path = VOICE_DIR / cfg["datasets"]["es"]
    en_path = VOICE_DIR / cfg["datasets"]["en"]

    print("\n✓ Datasets listos:")
    print(f"  ES: {es_path}")
    print(f"  EN: {en_path}")
    print("\nSiguiente paso: npm run voice:train")
    print("\nEn RVC WebUI (AMD/Windows, DirectML):")
    print(f"  1. Experiment name: {model}-es  y  {model}-en  (entrena por separado)")
    print(f"  2. Dataset path: carpeta raw de arriba")
    print(f"  3. Sample rate: {rvc.get('sample_rate', '40k')}")
    print(f"  4. Version: {rvc.get('version', 'v2')}")
    print(f"  5. Epochs: {rvc.get('epochs', 200)}")
    print("  6. Al terminar, copia .pth y .index a voice/models/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
