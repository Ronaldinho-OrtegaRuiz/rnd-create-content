/**
 * Generador standalone: video 30 s de fractales Julia animados.
 * Relleno negro, bordes con gradiente Riseform (chrome + liquid).
 *
 * Uso: node scripts/generate-fractal-30s.mjs
 *      FRACTAL_TEST=1 node scripts/generate-fractal-30s.mjs   → 3 s de prueba
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import {
  riseformChromeColorAt,
  riseformGradientBoxes,
} from "../src/riseform/core/chrome-raster.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "output");
const OUT_FILE = join(OUT_DIR, "fractal-30s.mp4");

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION_SEC = process.env.FRACTAL_TEST ? 3 : 30;
const TOTAL_FRAMES = FPS * DURATION_SEC;

/** Render interno (más rápido); ffmpeg escala a 1080×1920. */
const RW = 540;
const RH = 960;

const MAX_ITER = 72;
const BORDER_BAND = 6;
const LAYER_COUNT = 12;

/** Cada fractal ocupa un “slot” distinto en pantalla (9:16). size ↑ = ocupa más pantalla. */
const FRACTAL_SLOTS = [
  { anchorX: 0.17, anchorY: 0.10, size: 0.33 },
  { anchorX: 0.50, anchorY: 0.10, size: 0.33 },
  { anchorX: 0.83, anchorY: 0.10, size: 0.33 },
  { anchorX: 0.17, anchorY: 0.30, size: 0.33 },
  { anchorX: 0.50, anchorY: 0.30, size: 0.34 },
  { anchorX: 0.83, anchorY: 0.30, size: 0.33 },
  { anchorX: 0.17, anchorY: 0.50, size: 0.34 },
  { anchorX: 0.50, anchorY: 0.50, size: 0.35 },
  { anchorX: 0.83, anchorY: 0.50, size: 0.34 },
  { anchorX: 0.17, anchorY: 0.72, size: 0.33 },
  { anchorX: 0.50, anchorY: 0.72, size: 0.34 },
  { anchorX: 0.83, anchorY: 0.72, size: 0.33 },
];

/** Escala del plano complejo; ↓ = más zoom / fractal más grande. */
const VIEW_SCALE = 1.85;

function resolveFfmpegBinary() {
  if (typeof ffmpegStatic === "string" && ffmpegStatic.length > 0 && existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return "ffmpeg";
}

/** PRNG determinista opcional; semilla aleatoria si no se pasa. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothDrift(t, phase, speed = 1) {
  const u = t * speed;
  return (
    Math.sin(u * 0.52 + phase) * 0.55 +
    Math.sin(u * 0.91 + phase * 1.7) * 0.32 +
    Math.cos(u * 0.38 + phase * 0.4) * 0.18
  );
}

function buildLayers(rand) {
  const layers = [];
  for (let i = 0; i < LAYER_COUNT; i++) {
    const slot = FRACTAL_SLOTS[i % FRACTAL_SLOTS.length];
    layers.push({
      slot,
      cRe: rand() * 1.4 - 0.7,
      cIm: rand() * 1.4 - 0.7,
      centerRe: rand() * 0.35 - 0.175,
      centerIm: rand() * 0.35 - 0.175,
      baseZoom: 1.25 + rand() * 1.65,
      phase: rand() * Math.PI * 2,
      driftSpeed: 1.05 + rand() * 0.85,
    });
  }
  return layers;
}

function layerParams(layer, t) {
  const drift = smoothDrift(t, layer.phase, layer.driftSpeed);
  const drift2 = smoothDrift(t * 1.22, layer.phase + 2.1, layer.driftSpeed * 0.95);
  const zoomPulse = Math.sin(t * 0.38 + layer.phase) * 0.42 + Math.sin(t * 0.61 + layer.phase * 1.3) * 0.14;
  const zoom = layer.baseZoom * (1 + zoomPulse);
  return {
    jRe: layer.cRe + 0.48 * drift,
    jIm: layer.cIm + 0.48 * drift2,
    centerRe: layer.centerRe + 0.17 * Math.sin(t * 0.31 + layer.phase),
    centerIm: layer.centerIm + 0.17 * Math.cos(t * 0.34 + layer.phase * 0.8),
    zoom,
  };
}

function renderLayerGrid(layer, t) {
  const grid = new Int16Array(RW * RH);
  const aspect = RH / RW;
  const { jRe, jIm, centerRe, centerIm, zoom } = layerParams(layer, t);
  const invZoom = 1 / zoom;
  const { anchorX, anchorY, size } = layer.slot;

  for (let py = 0; py < RH; py++) {
    const ny = (py / RH - anchorY) / size;
    const cyBase = centerIm + ny * VIEW_SCALE * aspect * invZoom;
    for (let px = 0; px < RW; px++) {
      const nx = (px / RW - anchorX) / size;
      const cx = centerRe + nx * VIEW_SCALE * invZoom;
      grid[py * RW + px] = juliaIter(cx, cyBase, jRe, jIm, MAX_ITER);
    }
  }
  return grid;
}

function markLayerMask(grid, insideMask, borderMask) {
  for (let py = 0; py < RH; py++) {
    for (let px = 0; px < RW; px++) {
      const idx = py * RW + px;
      const iter = grid[idx];
      const inside = iter >= MAX_ITER;

      if (inside) {
        insideMask[idx] = 1;
        const left = px > 0 && grid[idx - 1] < MAX_ITER;
        const right = px < RW - 1 && grid[idx + 1] < MAX_ITER;
        const up = py > 0 && grid[idx - RW] < MAX_ITER;
        const down = py < RH - 1 && grid[idx + RW] < MAX_ITER;
        if (left || right || up || down) borderMask[idx] = 1;
      } else if (MAX_ITER - iter <= BORDER_BAND) {
        borderMask[idx] = 1;
      }
    }
  }
}

function juliaIter(zRe, zIm, jRe, jIm, maxIter) {
  for (let i = 0; i < maxIter; i++) {
    const r2 = zRe * zRe + zIm * zIm;
    if (r2 > 4) return i;
    const nRe = zRe * zRe - zIm * zIm + jRe;
    zIm = 2 * zRe * zIm + jIm;
    zRe = nRe;
  }
  return maxIter;
}

/**
 * @returns {Uint8Array} RGBA RW×RH — negro + bordes chrome
 */
function renderFractalFrame(layers, t, boxes) {
  const insideMask = new Uint8Array(RW * RH);
  const borderMask = new Uint8Array(RW * RH);

  for (const layer of layers) {
    const grid = renderLayerGrid(layer, t);
    markLayerMask(grid, insideMask, borderMask);
  }

  const buf = new Uint8Array(RW * RH * 4);

  for (let py = 0; py < RH; py++) {
    for (let px = 0; px < RW; px++) {
      const idx = py * RW + px;
      const o = idx * 4;

      if (borderMask[idx]) {
        const sx = (px / RW) * WIDTH;
        const sy = (py / RH) * HEIGHT;
        const c = riseformChromeColorAt(sx, sy, boxes);
        buf[o] = c.r;
        buf[o + 1] = c.g;
        buf[o + 2] = c.b;
        buf[o + 3] = 255;
      } else {
        buf[o] = 0;
        buf[o + 1] = 0;
        buf[o + 2] = 0;
        buf[o + 3] = 255;
      }
    }
  }

  return buf;
}

function encodeMp4(frameGenerator, totalFrames) {
  const ffmpegBin = resolveFfmpegBinary();

  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${WIDTH}x${HEIGHT}`,
      "-r",
      String(FPS),
      "-i",
      "pipe:0",
      "-t",
      String(DURATION_SEC),
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      OUT_FILE,
    ];

    const proc = spawn(ffmpegBin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-3000) || `ffmpeg exit ${code}`));
    });

    (async () => {
      try {
        for (let f = 0; f < totalFrames; f++) {
          const raw = frameGenerator(f);
          const png = await sharp(Buffer.from(raw), {
            raw: { width: RW, height: RH, channels: 4 },
          })
            .resize(WIDTH, HEIGHT, { kernel: sharp.kernel.lanczos3 })
            .raw()
            .toBuffer();

          const ok = proc.stdin.write(png);
          if (!ok) {
            await new Promise((r) => proc.stdin.once("drain", r));
          }

          if (f % 30 === 0 || f === totalFrames - 1) {
            const pct = Math.round((f / (totalFrames - 1)) * 100);
            process.stdout.write(`\r  frame ${f + 1}/${totalFrames} (${pct}%)`);
          }
        }
        proc.stdin.end();
      } catch (err) {
        proc.stdin.destroy();
        reject(err);
      }
    })();
  });
}

async function main() {
  const seed = process.env.FRACTAL_SEED ? Number(process.env.FRACTAL_SEED) : Date.now();
  const rand = mulberry32(seed);
  const layers = buildLayers(rand);
  const boxes = riseformGradientBoxes(WIDTH, HEIGHT);

  console.log("Fractal video generator");
  console.log(`  ${WIDTH}×${HEIGHT} @ ${FPS} fps, ${DURATION_SEC} s (${TOTAL_FRAMES} frames)`);
  console.log(`  seed: ${seed} (cada run distinto; fija con FRACTAL_SEED=12345)`);
  console.log(`  fractals: ${LAYER_COUNT} (separados en pantalla)`);
  console.log(`  output: ${OUT_FILE}`);

  await mkdir(OUT_DIR, { recursive: true });

  const t0 = Date.now();
  const frameGenerator = (frameIndex) => {
    const t = frameIndex / FPS;
    return renderFractalFrame(layers, t, boxes);
  };

  await encodeMp4(frameGenerator, TOTAL_FRAMES);
  console.log(`\n  done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`  → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
