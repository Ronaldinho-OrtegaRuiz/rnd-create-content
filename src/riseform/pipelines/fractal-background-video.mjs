import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import {
  riseformChromeColorAt,
  riseformGradientBoxes,
} from "../core/chrome-raster.mjs";

const MAX_ITER = 72;
const BORDER_BAND = 6;
const LAYER_COUNT = 12;
const VIEW_SCALE = 1.85;
const DEFAULT_FPS = 30;

export function resolveFfmpegBinary() {
  if (typeof ffmpegStatic === "string" && ffmpegStatic.length > 0 && existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return "ffmpeg";
}

/** @param {number} width @param {number} height @param {number} [count=12] */
export function fractalSlotsForCanvas(width, height, count = LAYER_COUNT) {
  const aspect = width / height;
  if (aspect >= 1.15) {
    const cols = 6;
    const rows = Math.ceil(count / cols);
    /** @type {{ anchorX: number; anchorY: number; size: number }[]} */
    const slots = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      slots.push({
        anchorX: (col + 0.5) / cols,
        anchorY: (row + 0.5) / rows,
        size: 0.9 / cols,
      });
    }
    return slots;
  }

  const cols = 3;
  const rows = Math.ceil(count / cols);
  const slots = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    slots.push({
      anchorX: (col + 0.5) / cols,
      anchorY: (row + 0.5) / rows,
      size: 0.34,
    });
  }
  return slots;
}

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

function buildLayers(rand, slots) {
  const layers = [];
  for (let i = 0; i < LAYER_COUNT; i++) {
    layers.push({
      slot: slots[i % slots.length],
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

function createFractalContext(width, height, seed) {
  const w = Math.max(320, Math.round(width));
  const h = Math.max(120, Math.round(height));
  const RW = Math.max(200, Math.round(w / 2));
  const RH = Math.max(120, Math.round(h / 2));
  const rand = mulberry32(seed >>> 0);
  const slots = fractalSlotsForCanvas(w, h, LAYER_COUNT);
  const layers = buildLayers(rand, slots);
  const boxes = riseformGradientBoxes(w, h);
  return { width: w, height: h, RW, RH, layers, boxes };
}

function renderLayerGrid(ctx, layer, t) {
  const { RW, RH } = ctx;
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

function markLayerMask(grid, RW, RH, insideMask, borderMask) {
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

function renderFractalFrame(ctx, t) {
  const { width, height, RW, RH, layers, boxes } = ctx;
  const insideMask = new Uint8Array(RW * RH);
  const borderMask = new Uint8Array(RW * RH);

  for (const layer of layers) {
    const grid = renderLayerGrid(ctx, layer, t);
    markLayerMask(grid, RW, RH, insideMask, borderMask);
  }

  const buf = new Uint8Array(RW * RH * 4);
  for (let py = 0; py < RH; py++) {
    for (let px = 0; px < RW; px++) {
      const idx = py * RW + px;
      const o = idx * 4;
      if (borderMask[idx]) {
        const sx = (px / RW) * width;
        const sy = (py / RH) * height;
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

/**
 * Genera MP4 de fondo fractal (negro + bordes chrome) a duración exacta.
 *
 * @param {object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} opts.durationSec
 * @param {number} [opts.fps=30]
 * @param {number} [opts.seed]
 * @param {string} opts.outPath
 * @param {(msg: string) => void} [opts.onProgress]
 */
export async function renderFractalBackgroundToFile(opts) {
  const width = Math.max(320, Math.round(Number(opts.width) || 1080));
  const height = Math.max(120, Math.round(Number(opts.height) || 1920));
  const fps = Math.max(12, Math.min(60, Math.round(Number(opts.fps) || DEFAULT_FPS)));
  const durationSec = Math.max(0.8, Number(opts.durationSec) || 30);
  const totalFrames = Math.max(1, Math.ceil(durationSec * fps));
  const seed = typeof opts.seed === "number" ? opts.seed : Date.now();
  const outPath = opts.outPath;
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};

  await mkdir(dirname(outPath), { recursive: true });

  const ctx = createFractalContext(width, height, seed);
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
      `${width}x${height}`,
      "-r",
      String(fps),
      "-i",
      "pipe:0",
      "-t",
      String(durationSec),
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
      outPath,
    ];

    const proc = spawn(ffmpegBin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve({ outPath, durationSec, width, height, fps, seed, totalFrames });
      else reject(new Error(stderr.slice(-3000) || `ffmpeg fractal exit ${code}`));
    });

    (async () => {
      try {
        for (let f = 0; f < totalFrames; f++) {
          const t = f / fps;
          const raw = renderFractalFrame(ctx, t);
          const frame = await sharp(Buffer.from(raw), {
            raw: { width: ctx.RW, height: ctx.RH, channels: 4 },
          })
            .resize(width, height, { kernel: sharp.kernel.lanczos3 })
            .raw()
            .toBuffer();

          const ok = proc.stdin.write(frame);
          if (!ok) await new Promise((r) => proc.stdin.once("drain", r));

          if (f % fps === 0 || f === totalFrames - 1) {
            onProgress(`frame ${f + 1}/${totalFrames}`);
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
