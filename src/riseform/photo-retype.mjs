import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { createWorker } from "tesseract.js";
import { colorDist, cornerAverageRgb, riseformGradientBoxes } from "./chrome-raster.mjs";
import { accentGradientDefs, chromePathNoBorder } from "./riseform-chrome-svg.mjs";
import { buildPlayfairWordPathD } from "./playfair-display-font.mjs";

/** @param {any} word */
function bboxFromWord(word) {
  const b = word?.bbox;
  if (!b || typeof b !== "object") return null;
  if (
    typeof b.x0 === "number" &&
    typeof b.y0 === "number" &&
    typeof b.x1 === "number" &&
    typeof b.y1 === "number"
  ) {
    return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
  }
  if (typeof b.left === "number" && typeof b.top === "number" && typeof b.width === "number") {
    return {
      x0: b.left,
      y0: b.top,
      x1: b.left + b.width,
      y1: b.top + (b.height ?? 0),
    };
  }
  return null;
}

let workerPromise = null;
let ocrChain = Promise.resolve();

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker("eng+spa", 1, { logger: () => {} });
      return w;
    })();
  }
  return workerPromise;
}

/**
 * Serializa reconocimiento (un worker, una cola).
 * @param {Buffer} pngBuffer imagen RGBA o RGB (tesseract acepta png)
 */
export async function ocrWordsFromPng(pngBuffer) {
  const run = ocrChain.then(async () => {
    const worker = await getWorker();
    const {
      data: { words },
    } = await worker.recognize(pngBuffer);
    return Array.isArray(words) ? words : [];
  });
  ocrChain = run.catch(() => {});
  return run;
}

/**
 * @param {any[]} words
 * @returns {{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }[]}
 */
export function filterOcrWords(words) {
  const out = [];
  for (const w of words) {
    const text = typeof w.text === "string" ? w.text.replace(/\s+/g, " ").trim() : "";
    const conf = typeof w.confidence === "number" ? w.confidence : 0;
    const bbox = bboxFromWord(w);
    if (!text || !bbox || conf < 32) continue;
    if (text.length === 1 && /[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(text)) continue;
    out.push({ text, bbox, confidence: conf });
  }
  return out;
}

/**
 * En cada caja OCR, sustituye tinta (no-fondo) por color de referencia de esquinas.
 */
export function eraseNonBgInBoxes(imgRaw, iw, ih, boxes, bgRef, tolerance, padPx = 3) {
  for (const box of boxes) {
    let x0 = Math.floor(box.x0) - padPx;
    let y0 = Math.floor(box.y0) - padPx;
    let x1 = Math.ceil(box.x1) + padPx;
    let y1 = Math.ceil(box.y1) + padPx;
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(iw - 1, x1);
    y1 = Math.min(ih - 1, y1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const si = (y * iw + x) * 4;
        const r = imgRaw[si];
        const g = imgRaw[si + 1];
        const b = imgRaw[si + 2];
        const a = imgRaw[si + 3];
        const nearBg = colorDist({ r, g, b }, bgRef) < tolerance;
        const faint = a < 12;
        if (!(faint || nearBg)) {
          imgRaw[si] = bgRef.r;
          imgRaw[si + 1] = bgRef.g;
          imgRaw[si + 2] = bgRef.b;
          imgRaw[si + 3] = 255;
        }
      }
    }
  }
}

/**
 * SVG lienzo completo: Playfair Display + relleno Chrome/Liquid como riseform_profile / riseform_cover.
 */
function wordLayerSvg(text, bbox, fullW, fullH, padLeft, padTop) {
  const idPrefix = `rf_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const boxes = riseformGradientBoxes(fullW, fullH);
  const cx = padLeft + (bbox.x0 + bbox.x1) / 2;
  const cy = padTop + (bbox.y0 + bbox.y1) / 2;
  const h = Math.max(6, bbox.y1 - bbox.y0);
  const fontSize = Math.min(Math.max(h * 0.82, 10), fullH * 0.38);
  const pathD = buildPlayfairWordPathD(text, cx, cy, fontSize);
  const defs = accentGradientDefs(idPrefix, boxes.chrome, boxes.liquid);
  const paths = chromePathNoBorder(pathD, idPrefix);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fullW}" height="${fullH}" viewBox="0 0 ${fullW} ${fullH}">
${defs}
${paths}
</svg>`;
}

/**
 * @param {Buffer} pngBuffer PNG final (después de pad o chrome)
 * @param {ReturnType<typeof filterOcrWords>} words
 * @param {number} padLeft
 * @param {number} padTop
 * @param {number} iw ancho región imagen (coords OCR)
 * @param {number} ih
 * @param {number} fullW
 * @param {number} fullH
 */
export async function compositeRetypeLayers(pngBuffer, words, padLeft, padTop, iw, ih, fullW, fullH) {
  if (words.length === 0) return pngBuffer;
  const composites = [];
  for (const w of words) {
    const bx = w.bbox;
    if (bx.x1 <= bx.x0 || bx.y1 <= bx.y0) continue;
    const svg = wordLayerSvg(w.text, bx, fullW, fullH, padLeft, padTop);
    composites.push({
      input: Buffer.from(svg, "utf8"),
      left: 0,
      top: 0,
    });
  }
  if (composites.length === 0) return pngBuffer;
  return sharp(pngBuffer).composite(composites).png().toBuffer();
}
