/**
 * Demos intro/outro Fractal Voice (misma lógica que prueba-video).
 * Uso: node scripts/generate-brand-preview-demos.mjs
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  applyVideoEdgeFades,
  BRAND_BODY_EDGE_FADE_SEC,
  concatMp4Parts,
  renderBrandOutroClip,
  wrapWithBrandBookends,
} from "../src/prueba-video/pipelines/brand-typewriter.mjs";
import {
  renderScriptCoverTimelineMp4,
  RISEFORM_COVER_ASPECT,
  SHORT_VERTICAL_ASPECT,
} from "../src/prueba-video/pipelines/script-cover-video.mjs";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "output");

const SAMPLE_BODY_H = {
  text: "La disciplina no es castigo. Es el puente entre la intención y el resultado.",
  duration_sec: 4,
};

const SAMPLE_BODY_V = {
  text: "Cada día pequeño suma más que un sprint que no sostienes.",
  duration_sec: 4,
};

const SAMPLE_THEME_TITLE = "La resiliencia después del fracaso";

async function buildBodyOnly(segments, w, h, paddingRatio, seed) {
  const result = await renderScriptCoverTimelineMp4({
    segments,
    width: w,
    height: h,
    paddingRatio,
    background: "fractal",
    fractalSeed: seed,
  });
  return Buffer.from(result.video_base64, "base64");
}

async function writeDemo(name, buf) {
  const outPath = join(OUT_DIR, name);
  await writeFile(outPath, buf);
  return outPath;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const seed = Date.now();
  const longW = RISEFORM_COVER_ASPECT.width;
  const longH = RISEFORM_COVER_ASPECT.height;
  const shortW = SHORT_VERTICAL_ASPECT.width;
  const shortH = SHORT_VERTICAL_ASPECT.height;

  console.log("Generando demos Fractal Voice…\n");

  const wH = await mkdtemp(join(tmpdir(), "brand-demo-h-"));
  const wV = await mkdtemp(join(tmpdir(), "brand-demo-v-"));
  const wO = await mkdtemp(join(tmpdir(), "brand-demo-o-"));

  try {
    console.log("→ cuerpos (fractal + texto)…");
    const bodyH = await buildBodyOnly([SAMPLE_BODY_H], longW, longH, 0.12, seed);
    const bodyV = await buildBodyOnly([SAMPLE_BODY_V], shortW, shortH, 0.16, seed + 1);

    console.log("→ intro + outro (horizontal)…");
    const fullH = (
      await wrapWithBrandBookends(wH, bodyH, {
        width: longW,
        height: longH,
        introKind: "fv",
      })
    ).buffer;

    console.log("→ intro + outro (vertical)…");
    const fullV = (
      await wrapWithBrandBookends(wV, bodyV, {
        width: shortW,
        height: shortH,
        introKind: "theme",
        themeTitle: SAMPLE_THEME_TITLE,
      })
    ).buffer;

    console.log("→ outro + snippet (horizontal)…");
    const bodyHFaded = await applyVideoEdgeFades(
      join(wO, "body"),
      bodyH,
      BRAND_BODY_EDGE_FADE_SEC,
      BRAND_BODY_EDGE_FADE_SEC,
    );
    const outroH = await renderBrandOutroClip(join(wO, "outro"), longW, longH);
    const outroDemo = await concatMp4Parts(join(wO, "concat"), [bodyHFaded, outroH], longW, longH);

    console.log("→ guardando…");
    const p1 = await writeDemo("preview-demo-horizontal.mp4", fullH);
    const p2 = await writeDemo("preview-demo-vertical.mp4", fullV);
    const p3 = await writeDemo("preview-outro-brand.mp4", outroDemo);

    console.log("\nListo:");
    console.log(" ", p1);
    console.log(" ", p2);
    console.log(" ", p3);
  } finally {
    await rm(wH, { recursive: true, force: true }).catch(() => {});
    await rm(wV, { recursive: true, force: true }).catch(() => {});
    await rm(wO, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
