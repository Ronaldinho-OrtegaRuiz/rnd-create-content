/**
 * Muestreo del mismo gradiente multicolor que style_hook (accent chrome / liquid).
 * Ref: ACCENT_CHROME_STOPS + LIQUID_STOPS en content-cards.mjs
 */

/** Paradas ACCENT_CHROME (offsets 0–1, RGB 0–255) */
const CHROME_STOPS = [
  { t: 0, r: 13, g: 34, b: 20 },
  { t: 0.12, r: 13, g: 34, b: 20 },
  { t: 0.25, r: 28, g: 79, b: 52 },
  { t: 0.4, r: 20, g: 86, b: 124 },
  { t: 0.55, r: 51, g: 79, b: 150 },
  { t: 0.7, r: 106, g: 61, b: 138 },
  { t: 0.84, r: 139, g: 78, b: 32 },
  { t: 1, r: 139, g: 78, b: 32 },
];

/** Liquid (RGBA 0–255 / alpha 0–1), ejes como en SVG */
const LIQUID_STOPS = [
  { t: 0, r: 57, g: 255, b: 20, a: 0 },
  { t: 0.38, r: 57, g: 255, b: 20, a: 0 },
  { t: 0.45, r: 125, g: 211, b: 252, a: 0.52 },
  { t: 0.49, r: 196, g: 181, b: 253, a: 0.48 },
  { t: 0.53, r: 253, g: 186, b: 116, a: 0.42 },
  { t: 0.57, r: 252, g: 165, b: 165, a: 0.38 },
  { t: 0.64, r: 239, g: 68, b: 68, a: 0 },
  { t: 1, r: 255, g: 255, b: 255, a: 0 },
];

export function riseformGradientBoxes(canvasW, canvasH) {
  const sx = canvasW / 800;
  const sy = canvasH / 600;
  return {
    chrome: { x1: 64 * sx, y1: 96 * sy, x2: 736 * sx, y2: 504 * sy },
    liquid: { x1: 0, y1: 300 * sy, x2: 800 * sx, y2: 288 * sy },
  };
}

function interpolateRgbStops(t, stops) {
  let i = 0;
  for (; i < stops.length - 1; i++) {
    if (t <= stops[i + 1].t) break;
  }
  const a = stops[Math.max(0, i)];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  if (a.t === b.t) return { r: a.r, g: a.g, b: a.b };
  const u = (t - a.t) / (b.t - a.t);
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  };
}

function interpolateRgbaStops(t, stops) {
  let i = 0;
  for (; i < stops.length - 1; i++) {
    if (t <= stops[i + 1].t) break;
  }
  const a = stops[Math.max(0, i)];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  if (a.t === b.t) return { r: a.r, g: a.g, b: a.b, a: a.a };
  const u = (t - a.t) / (b.t - a.t);
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
    a: a.a + (b.a - a.a) * u,
  };
}

function linearRgbAt(px, py, box, stops) {
  const { x1, y1, x2, y2 } = box;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return interpolateRgbStops(0, stops);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return interpolateRgbStops(t, stops);
}

function linearRgbaAt(px, py, box, stops) {
  const { x1, y1, x2, y2 } = box;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return interpolateRgbaStops(0, stops);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return interpolateRgbaStops(t, stops);
}

/**
 * Color estilo Riseform en coordenadas de lienzo (chrome + capa liquid encima).
 */
export function riseformChromeColorAt(canvasX, canvasY, boxes) {
  const chrome = linearRgbAt(canvasX, canvasY, boxes.chrome, CHROME_STOPS);
  const liq = linearRgbaAt(canvasX, canvasY, boxes.liquid, LIQUID_STOPS);
  const a = liq.a;
  return {
    r: Math.round(chrome.r * (1 - a) + liq.r * a),
    g: Math.round(chrome.g * (1 - a) + liq.g * a),
    b: Math.round(chrome.b * (1 - a) + liq.b * a),
  };
}

/**
 * Color medio de las cuatro esquinas (RGB).
 */
export function cornerAverageRgb(data, w, h, channels) {
  const idx = (x, y) => (Math.min(y, h - 1) * w + Math.min(x, w - 1)) * channels;
  const corners = [
    idx(0, 0),
    idx(w - 1, 0),
    idx(0, h - 1),
    idx(w - 1, h - 1),
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const i of corners) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: r / 4, g: g / 4, b: b / 4 };
}

export function colorDist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/**
 * Lienzo completo: bandas = canvasBg; región imagen: fondo plano → canvasBg; primer plano → gradiente Riseform.
 */
export function composeChromeCanvas(fullW, fullH, padLeft, padTop, imgRaw, iw, ih, canvasBg, tolerance) {
  const out = Buffer.alloc(fullW * fullH * 4);
  const bgRef = cornerAverageRgb(imgRaw, iw, ih, 4);
  const boxes = riseformGradientBoxes(fullW, fullH);

  for (let cy = 0; cy < fullH; cy++) {
    for (let cx = 0; cx < fullW; cx++) {
      const o = (cy * fullW + cx) * 4;
      if (cx < padLeft || cx >= padLeft + iw || cy < padTop || cy >= padTop + ih) {
        out[o] = canvasBg.r;
        out[o + 1] = canvasBg.g;
        out[o + 2] = canvasBg.b;
        out[o + 3] = 255;
        continue;
      }
      const sx = cx - padLeft;
      const sy = cy - padTop;
      const si = (sy * iw + sx) * 4;
      const r = imgRaw[si];
      const g = imgRaw[si + 1];
      const b = imgRaw[si + 2];
      const a = imgRaw[si + 3];
      const nearBg = colorDist({ r, g, b }, bgRef) < tolerance;
      const faint = a < 12;
      if (faint || nearBg) {
        out[o] = canvasBg.r;
        out[o + 1] = canvasBg.g;
        out[o + 2] = canvasBg.b;
        out[o + 3] = 255;
      } else {
        const c = riseformChromeColorAt(cx + 0.5, cy + 0.5, boxes);
        out[o] = c.r;
        out[o + 1] = c.g;
        out[o + 2] = c.b;
        out[o + 3] = 255;
      }
    }
  }
  return out;
}
