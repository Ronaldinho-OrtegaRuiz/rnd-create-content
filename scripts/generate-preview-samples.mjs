/**
 * Muestras rápidas estilo prueba-video: fractal + IBM Plex Mono blanco.
 * Uso: node scripts/generate-preview-samples.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderScriptCoverTimelineMp4,
  RISEFORM_COVER_ASPECT,
  SHORT_VERTICAL_ASPECT,
} from "../src/prueba-video/pipelines/script-cover-video.mjs";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "output");

const SEGMENTS = [
  {
    text: "La disciplina no es castigo. Es el puente entre la intención y el resultado.",
    duration_sec: 5.8,
  },
  {
    text: "Cada día pequeño suma más que un sprint que no sostienes.",
    duration_sec: 5.8,
  },
];

const SAMPLES = [
  {
    file: "preview-vertical-10s.mp4",
    width: SHORT_VERTICAL_ASPECT.width,
    height: SHORT_VERTICAL_ASPECT.height,
    paddingRatio: 0.16,
    label: "vertical 9:16",
  },
  {
    file: "preview-horizontal-10s.mp4",
    width: RISEFORM_COVER_ASPECT.width,
    height: RISEFORM_COVER_ASPECT.height,
    paddingRatio: 0.12,
    label: "horizontal 16:9",
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const seed = Date.now();

  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i];
    console.log(`\n→ ${s.label} (${s.width}×${s.height})…`);
    const t0 = Date.now();
    const result = await renderScriptCoverTimelineMp4({
      segments: SEGMENTS,
      width: s.width,
      height: s.height,
      paddingRatio: s.paddingRatio,
      background: "fractal",
      fractalSeed: seed + i,
    });
    const outPath = join(OUT_DIR, s.file);
    await writeFile(outPath, Buffer.from(result.video_base64, "base64"));
    console.log(
      `  ${outPath}\n  ${result.duration_sec} s · ${result.text_style} · ${((Date.now() - t0) / 1000).toFixed(1)} s render`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
