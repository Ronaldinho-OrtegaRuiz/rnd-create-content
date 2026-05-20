import sharp from "sharp";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { log, logErr } from "../log.mjs";
import { dirname, join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const outDir = join(repoRoot, "generated");
const orbitronPath = join(repoRoot, "fonts", "Orbitron", "Orbitron-VariableFont_wght.ttf");
const orbitronFont = await opentype.load(orbitronPath);
const interPath = join(repoRoot, "fonts", "Inter", "Inter-VariableFont_opsz,wght.ttf");
const interFont = await opentype.load(interPath);
const manropePath = join(repoRoot, "fonts", "Manrope", "Manrope-VariableFont_wght.ttf");
const manropeFont = await opentype.load(manropePath);
const plusJakartaSansPath = join(repoRoot, "fonts", "plus_jakarta_sans", "PlusJakartaSans-VariableFont_wght.ttf");
const plusJakartaSansFont = await opentype.load(plusJakartaSansPath);
const playfairDisplayPath = join(
  repoRoot,
  "fonts",
  "Playfair_Display",
  "PlayfairDisplay-VariableFont_wght.ttf",
);
const playfairDisplayFont = await opentype.load(playfairDisplayPath);
const spaceGroteskPath = join(repoRoot, "fonts", "space_grotesk", "SpaceGrotesk-VariableFont_wght.ttf");
const spaceGroteskFont = await opentype.load(spaceGroteskPath);

const font =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/** Mismos colores en perfil y portada (verde neón → azul → morado → naranja → rojo). */
const CHROME_STOPS = `
    <stop offset="0%" stop-color="#020403"/>
    <stop offset="10%" stop-color="#14532d"/>
    <stop offset="22%" stop-color="#39ff14"/>
    <stop offset="34%" stop-color="#00b8ff"/>
    <stop offset="46%" stop-color="#2563eb"/>
    <stop offset="58%" stop-color="#9333ea"/>
    <stop offset="70%" stop-color="#ff6b00"/>
    <stop offset="82%" stop-color="#ff3d00"/>
    <stop offset="94%" stop-color="#ef4444"/>
    <stop offset="100%" stop-color="#450a0a"/>
`;

const ACCENT_CHROME_STOPS = `
    <stop offset="0%" stop-color="#0d2214"/>
    <stop offset="12%" stop-color="#0d2214"/>
    <stop offset="25%" stop-color="#1c4f34"/>
    <stop offset="40%" stop-color="#14567c"/>
    <stop offset="55%" stop-color="#334f96"/>
    <stop offset="70%" stop-color="#6a3d8a"/>
    <stop offset="84%" stop-color="#8b4e20"/>
    <stop offset="100%" stop-color="#8b4e20"/>
`;

const LIQUID_STOPS = `
    <stop offset="0%" stop-color="#39ff14" stop-opacity="0"/>
    <stop offset="38%" stop-color="#39ff14" stop-opacity="0"/>
    <stop offset="45%" stop-color="#7dd3fc" stop-opacity="0.52"/>
    <stop offset="49%" stop-color="#c4b5fd" stop-opacity="0.48"/>
    <stop offset="53%" stop-color="#fdba74" stop-opacity="0.42"/>
    <stop offset="57%" stop-color="#fca5a5" stop-opacity="0.38"/>
    <stop offset="64%" stop-color="#ef4444" stop-opacity="0"/>
    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
`;

/**
 * @param {string} idPrefix
 * @param {{ x1: number; y1: number; x2: number; y2: number }} chrome
 * @param {{ x1: number; y1: number; x2: number; y2: number }} liquid
 */
function gradientDefs(idPrefix, chrome, liquid) {
  return `
<defs>
  <linearGradient id="${idPrefix}Chrome" gradientUnits="userSpaceOnUse" x1="${chrome.x1}" y1="${chrome.y1}" x2="${chrome.x2}" y2="${chrome.y2}">
    ${CHROME_STOPS}
  </linearGradient>
  <linearGradient id="${idPrefix}Liquid" gradientUnits="userSpaceOnUse" x1="${liquid.x1}" y1="${liquid.y1}" x2="${liquid.x2}" y2="${liquid.y2}">
    ${LIQUID_STOPS}
  </linearGradient>
</defs>`;
}

function accentGradientDefs(idPrefix, chrome, liquid) {
  return `
<defs>
  <linearGradient id="${idPrefix}Chrome" gradientUnits="userSpaceOnUse" x1="${chrome.x1}" y1="${chrome.y1}" x2="${chrome.x2}" y2="${chrome.y2}">
    ${ACCENT_CHROME_STOPS}
  </linearGradient>
  <linearGradient id="${idPrefix}Liquid" gradientUnits="userSpaceOnUse" x1="${liquid.x1}" y1="${liquid.y1}" x2="${liquid.x2}" y2="${liquid.y2}">
    ${LIQUID_STOPS}
  </linearGradient>
</defs>`;
}

/**
 * Chrome Goth: capas de trazo + relleno cromo + sheen líquido (sin sombra de caída).
 * @param {string} typoAttrs atributos tipográficos (font-size, weight, letter-spacing…)
 */
function chromeTypeTextStack(x, y, text, idPrefix, typoAttrs, strokeScale = 1) {
  const s = (n) => String(Number((n * strokeScale).toFixed(2)));
  return `
<text x="${x}" y="${y}" dominant-baseline="middle" text-anchor="middle" ${typoAttrs} fill="none" stroke="#000000" stroke-width="${s(8)}" stroke-linejoin="miter" stroke-miterlimit="2">${text}</text>
<text x="${x}" y="${y}" dominant-baseline="middle" text-anchor="middle" ${typoAttrs} fill="none" stroke="#0f172a" stroke-width="${s(4.5)}" stroke-linejoin="miter" stroke-miterlimit="2">${text}</text>
<text x="${x}" y="${y}" dominant-baseline="middle" text-anchor="middle" ${typoAttrs} fill="none" stroke="#1e293b" stroke-width="${s(1.75)}" stroke-linejoin="miter" stroke-miterlimit="2">${text}</text>
<text x="${x}" y="${y}" dominant-baseline="middle" text-anchor="middle" ${typoAttrs} fill="url(#${idPrefix}Chrome)" stroke="#020617" stroke-width="${s(0.85)}" stroke-linejoin="miter" stroke-miterlimit="2">${text}</text>
<text x="${x}" y="${y}" dominant-baseline="middle" text-anchor="middle" ${typoAttrs} fill="url(#${idPrefix}Liquid)" stroke="none">${text}</text>
<text x="${x}" y="${y}" dominant-baseline="middle" text-anchor="middle" ${typoAttrs} fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="${s(0.5)}" stroke-linejoin="miter" stroke-miterlimit="2">${text}</text>
`.trim();
}

function chromeTypeTextNoBorder(x, y, text, idPrefix, typoAttrs) {
  return `
<text x="${x}" y="${y}" dominant-baseline="middle" text-anchor="middle" ${typoAttrs} fill="url(#${idPrefix}Chrome)" stroke="none">${text}</text>
<text x="${x}" y="${y}" dominant-baseline="middle" text-anchor="middle" ${typoAttrs} fill="url(#${idPrefix}Liquid)" stroke="none">${text}</text>
`.trim();
}

function chromePathNoBorder(pathD, idPrefix) {
  const base = `d="${pathD}" fill-rule="evenodd"`;
  return `
<path ${base} fill="url(#${idPrefix}Chrome)" stroke="none"/>
<path ${base} fill="url(#${idPrefix}Liquid)" stroke="none"/>
`.trim();
}

const HOOK_W = 800;
const HOOK_H = 600;

/** Cromo solo dentro del mismo tono (oscuro → vivo → claro → oscuro). */
function hueFrameStops(v) {
  return `
    <stop offset="0%" stop-color="${v.deep}"/>
    <stop offset="34%" stop-color="${v.pure}"/>
    <stop offset="66%" stop-color="${v.bright}"/>
    <stop offset="100%" stop-color="${v.deep}"/>
`;
}

/** Reflejo líquido monocromo (solo ese color, sin blanco arcoíris). */
function monoLiquidStops(hex) {
  return `
    <stop offset="0%" stop-color="${hex}" stop-opacity="0"/>
    <stop offset="38%" stop-color="${hex}" stop-opacity="0"/>
    <stop offset="46%" stop-color="${hex}" stop-opacity="0.5"/>
    <stop offset="50%" stop-color="${hex}" stop-opacity="0.42"/>
    <stop offset="56%" stop-color="${hex}" stop-opacity="0"/>
    <stop offset="100%" stop-color="${hex}" stop-opacity="0"/>
`;
}

/**
 * Perímetro rectangular con púas (Chrome / tribal líquido), sin deformar el bounding box lógico.
 * `seg` = número de dientes por lado; púas hacia fuera del rect.
 */
function buildThornyRectPathD(x, y, w, h, seg, amp) {
  const p = (a, b) => `${a.toFixed(2)} ${b.toFixed(2)}`;
  let d = `M ${p(x, y)}`;
  let k;
  for (k = 0; k < seg; k++) {
    const am = amp * (0.82 + 0.36 * Math.sin(k * 1.7));
    d += ` L ${p(x + ((k + 0.5) / seg) * w, y - am)}`;
    d += ` L ${p(x + ((k + 1) / seg) * w, y)}`;
  }
  for (k = 0; k < seg; k++) {
    const am = amp * (0.82 + 0.36 * Math.sin(k * 1.9 + 1));
    d += ` L ${p(x + w + am, y + ((k + 0.5) / seg) * h)}`;
    d += ` L ${p(x + w, y + ((k + 1) / seg) * h)}`;
  }
  for (k = 0; k < seg; k++) {
    const am = amp * (0.82 + 0.36 * Math.sin(k * 1.6 + 2));
    d += ` L ${p(x + w - ((k + 0.5) / seg) * w, y + h + am)}`;
    d += ` L ${p(x + w - ((k + 1) / seg) * w, y + h)}`;
  }
  for (k = 0; k < seg; k++) {
    const am = amp * (0.82 + 0.36 * Math.sin(k * 1.8 + 0.5));
    d += ` L ${p(x - am, y + h - ((k + 0.5) / seg) * h)}`;
    d += ` L ${p(x, y + h - ((k + 1) / seg) * h)}`;
  }
  d += " Z";
  return d;
}

/** Marco tecnológico: rectángulo con esquinas biseladas y muescas laterales. */
function buildTechFramePathD(x, y, w, h, cut = 28, notch = 14) {
  const x2 = x + w;
  const y2 = y + h;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const p = (a, b) => `${a.toFixed(2)} ${b.toFixed(2)}`;
  return `
M ${p(x + cut, y)}
L ${p(x2 - cut, y)}
L ${p(x2, y + cut)}
L ${p(x2, cy - notch)}
L ${p(x2 - notch, cy)}
L ${p(x2, cy + notch)}
L ${p(x2, y2 - cut)}
L ${p(x2 - cut, y2)}
L ${p(x + cut, y2)}
L ${p(x, y2 - cut)}
L ${p(x, cy + notch)}
L ${p(x + notch, cy)}
L ${p(x, cy - notch)}
L ${p(x, y + cut)}
Z
`.trim();
}

/** Vértices CCW de elipse / “O” poligonal. */
function ellipseVerts(cx, cy, rx, ry, n) {
  const v = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    v.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return v;
}

/**
 * Polígono CCW con púas hacia fuera (cyber sigil / tribal líquido).
 * @param {number[][]} verts
 * @param {number} te dientes por arista
 */
function thornifyPolygon(verts, te, amp, jitter = 0.12) {
  const n = verts.length;
  const ps = (x, y) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  let d = "";
  for (let i = 0; i < n; i++) {
    const p0 = verts[i];
    const p1 = verts[(i + 1) % n];
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy) || 1;
    if (i === 0) d = `M ${ps(p0[0], p0[1])}`;
    for (let j = 0; j < te; j++) {
      const t1 = (j + 0.5) / te;
      const t2 = (j + 1) / te;
      const jm = amp * (1 + jitter * Math.sin(j * 2.9 + i * 1.3));
      const ox = (dy / len) * jm;
      const oy = (-dx / len) * jm;
      const xm = p0[0] + dx * t1 + ox;
      const ym = p0[1] + dy * t1 + oy;
      const xe = p0[0] + dx * t2;
      const ye = p0[1] + dy * t2;
      d += ` L ${ps(xm, ym)} L ${ps(xe, ye)}`;
    }
  }
  d += " Z";
  return d;
}

/** “WORD” como contornos tribales (solo trazo, mismo cromo que el marco). */
function buildSigilWordPathD() {
  const cy = 300;
  const te = 3;
  const ampL = 7.5;
  const ampO = 6.2;
  const ampS = 6.8;

  const cxW = 258;
  const w = 34;
  const h = 50;
  const vertsW = [
    [cxW - w, cy - h * 0.92],
    [cxW - w * 0.52, cy + h * 1.02],
    [cxW - w * 0.06, cy - h * 0.02],
    [cxW, cy - h * 0.58],
    [cxW + w * 0.06, cy - h * 0.02],
    [cxW + w * 0.52, cy + h * 1.02],
    [cxW + w, cy - h * 0.92],
    [cxW + w * 0.72, cy - h * 0.82],
    [cxW, cy + h * 0.38],
    [cxW - w * 0.72, cy - h * 0.82],
  ];

  const cxO = 378;
  const outerO = ellipseVerts(cxO, cy, 40, 46, 12);
  const innerO = ellipseVerts(cxO, cy, 22, 28, 10);

  const cxR = 488;
  const vertsR = [
    [cxR - 28, cy - 44],
    [cxR - 28, cy + 44],
    [cxR - 10, cy + 44],
    [cxR - 10, cy + 10],
    [cxR + 6, cy + 10],
    [cxR + 22, cy + 44],
    [cxR + 38, cy + 44],
    [cxR + 20, cy + 8],
    [cxR + 20, cy - 44],
    [cxR - 10, cy - 44],
  ];

  const cxD = 598;
  const vertsD = [
    [cxD - 32, cy - 46],
    [cxD - 14, cy - 46],
    [cxD + 28, cy - 38],
    [cxD + 40, cy],
    [cxD + 28, cy + 38],
    [cxD - 14, cy + 46],
    [cxD - 32, cy + 46],
  ];

  const dW = thornifyPolygon(vertsW, te, ampL);
  const dOo = thornifyPolygon(outerO, te, ampO);
  const dOi = thornifyPolygon(innerO, Math.max(2, te - 1), ampO * 0.72);
  const dR = thornifyPolygon(vertsR, te, ampS);
  const dD = thornifyPolygon(vertsD, te, ampS);
  return `${dW} ${dOo} ${dOi} ${dR} ${dD}`;
}

/**
 * Misma pila cromo que el rect, pero sobre un path (varias aristas = “no una sola línea”).
 */
function chromeThornPathStack(pathD, idPrefix, strokeScale = 1) {
  const s = (n) => String(Number((n * strokeScale).toFixed(2)));
  const base = `d="${pathD}" fill="none" stroke-linejoin="miter" stroke-miterlimit="2.5"`;
  return `
<path ${base} stroke="#000000" stroke-width="${s(13)}"/>
<path ${base} stroke="#0f172a" stroke-width="${s(8.5)}"/>
<path ${base} stroke="#1e293b" stroke-width="${s(3.8)}"/>
<path ${base} stroke="url(#${idPrefix}Chrome)" stroke-width="${s(5.2)}"/>
<path ${base} stroke="url(#${idPrefix}Liquid)" stroke-width="${s(4.4)}"/>
<path ${base} stroke="rgba(255,255,255,0.34)" stroke-width="${s(0.6)}"/>
`.trim();
}

/** Estilo cromo neón para marco tecnológico (verde hook). */
function chromeTechFrameStack(pathD, idPrefix, strokeScale = 1) {
  const s = (n) => String(Number((n * strokeScale).toFixed(2)));
  const base = `d="${pathD}" fill="none" stroke-linejoin="bevel" stroke-miterlimit="2.2"`;
  return `
<path ${base} stroke="#010b06" stroke-width="${s(16)}"/>
<path ${base} stroke="#052e16" stroke-width="${s(10)}"/>
<path ${base} stroke="url(#${idPrefix}Chrome)" stroke-width="${s(6)}"/>
<path ${base} stroke="url(#${idPrefix}Liquid)" stroke-width="${s(4.8)}"/>
<path ${base} stroke="#86efac" stroke-width="${s(1.2)}" stroke-dasharray="${s(16)} ${s(10)}" stroke-linecap="square"/>
`.trim();
}

/** Igual que el stack cromo, pero con relleno para evitar letras "huecas". */
function chromeFilledPathStack(
  pathD,
  idPrefix,
  glowColor,
  strokeScale = 1,
  withGlow = true,
  flatFill = false,
  withOutline = true,
) {
  const s = (n) => String(Number((n * strokeScale).toFixed(2)));
  const base = `d="${pathD}" fill-rule="evenodd"`;
  const glowLayers = withGlow
    ? `
<path ${base} fill="none" stroke="${glowColor}" stroke-width="${s(14)}" stroke-linejoin="round" opacity="0.12"/>
<path ${base} fill="none" stroke="${glowColor}" stroke-width="${s(7)}" stroke-linejoin="round" opacity="0.17"/>`
    : "";
  const fillLayers = flatFill
    ? `<path ${base} fill="${glowColor}" stroke="${withOutline ? "#020617" : "none"}" stroke-width="${withOutline ? s(1) : "0"}" stroke-linejoin="round"/>`
    : `
<path ${base} fill="url(#${idPrefix}Chrome)" stroke="#020617" stroke-width="${s(1)}" stroke-linejoin="round"/>
<path ${base} fill="url(#${idPrefix}Liquid)" stroke="none"/>
<path ${base} fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="${s(0.5)}" stroke-linejoin="round"/>`;
  return `
${glowLayers}
${fillLayers}
`.trim();
}

/** Glow radial suave para que el contenido flote sin marco. */
function hookGlowBackground(variant) {
  const id = `${variant.prefix}_halo`;
  return `
<defs>
  <radialGradient id="${id}" cx="50%" cy="50%" r="60%">
    <stop offset="0%" stop-color="${variant.pure}" stop-opacity="0.17"/>
    <stop offset="36%" stop-color="${variant.pure}" stop-opacity="0.09"/>
    <stop offset="66%" stop-color="${variant.deep}" stop-opacity="0.06"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
  </radialGradient>
</defs>
<ellipse cx="${HOOK_W / 2}" cy="${HOOK_H / 2}" rx="310" ry="188" fill="url(#${id})"/>
`.trim();
}

/** Convierte texto en contorno SVG usando la fuente Orbitron (.ttf). */
function buildOrbitronWordPathD(text, cx, cy, fontSize) {
  const path = orbitronFont.getPath(text, 0, 0, fontSize, { kerning: true });
  const box = path.getBoundingBox();
  const tx = cx - (box.x1 + box.x2) / 2;
  const ty = cy - (box.y1 + box.y2) / 2;
  path.commands.forEach((command) => {
    if (typeof command.x === "number") command.x += tx;
    if (typeof command.y === "number") command.y += ty;
    if (typeof command.x1 === "number") command.x1 += tx;
    if (typeof command.y1 === "number") command.y1 += ty;
    if (typeof command.x2 === "number") command.x2 += tx;
    if (typeof command.y2 === "number") command.y2 += ty;
  });
  return path.toPathData(2);
}

/** Convierte texto en contorno SVG usando la fuente Inter (.ttf). */
function buildInterWordPathD(text, cx, cy, fontSize) {
  const path = interFont.getPath(text, 0, 0, fontSize, { kerning: true });
  const box = path.getBoundingBox();
  const tx = cx - (box.x1 + box.x2) / 2;
  const ty = cy - (box.y1 + box.y2) / 2;
  path.commands.forEach((command) => {
    if (typeof command.x === "number") command.x += tx;
    if (typeof command.y === "number") command.y += ty;
    if (typeof command.x1 === "number") command.x1 += tx;
    if (typeof command.y1 === "number") command.y1 += ty;
    if (typeof command.x2 === "number") command.x2 += tx;
    if (typeof command.y2 === "number") command.y2 += ty;
  });
  return path.toPathData(2);
}

/** Convierte texto en contorno SVG usando la fuente Manrope (.ttf). */
function buildManropeWordPathD(text, cx, cy, fontSize) {
  const path = manropeFont.getPath(text, 0, 0, fontSize, { kerning: true });
  const box = path.getBoundingBox();
  const tx = cx - (box.x1 + box.x2) / 2;
  const ty = cy - (box.y1 + box.y2) / 2;
  path.commands.forEach((command) => {
    if (typeof command.x === "number") command.x += tx;
    if (typeof command.y === "number") command.y += ty;
    if (typeof command.x1 === "number") command.x1 += tx;
    if (typeof command.y1 === "number") command.y1 += ty;
    if (typeof command.x2 === "number") command.x2 += tx;
    if (typeof command.y2 === "number") command.y2 += ty;
  });
  return path.toPathData(2);
}

/** Convierte texto en contorno SVG usando Plus Jakarta Sans (.ttf). */
function buildPlusJakartaWordPathD(text, cx, cy, fontSize) {
  const path = plusJakartaSansFont.getPath(text, 0, 0, fontSize, { kerning: true });
  const box = path.getBoundingBox();
  const tx = cx - (box.x1 + box.x2) / 2;
  const ty = cy - (box.y1 + box.y2) / 2;
  path.commands.forEach((command) => {
    if (typeof command.x === "number") command.x += tx;
    if (typeof command.y === "number") command.y += ty;
    if (typeof command.x1 === "number") command.x1 += tx;
    if (typeof command.y1 === "number") command.y1 += ty;
    if (typeof command.x2 === "number") command.x2 += tx;
    if (typeof command.y2 === "number") command.y2 += ty;
  });
  return path.toPathData(2);
}

/** Convierte texto en contorno SVG usando Playfair Display (.ttf). */
function buildPlayfairWordPathD(text, cx, cy, fontSize) {
  const path = playfairDisplayFont.getPath(text, 0, 0, fontSize, { kerning: true });
  const box = path.getBoundingBox();
  const tx = cx - (box.x1 + box.x2) / 2;
  const ty = cy - (box.y1 + box.y2) / 2;
  path.commands.forEach((command) => {
    if (typeof command.x === "number") command.x += tx;
    if (typeof command.y === "number") command.y += ty;
    if (typeof command.x1 === "number") command.x1 += tx;
    if (typeof command.y1 === "number") command.y1 += ty;
    if (typeof command.x2 === "number") command.x2 += tx;
    if (typeof command.y2 === "number") command.y2 += ty;
  });
  return path.toPathData(2);
}

/** Convierte texto en contorno SVG usando Space Grotesk (.ttf). */
/** @param {import("opentype.js").GlyphRenderOptions} [pathOptions] p. ej. `{ letterSpacing: 2/fontSize }` → ~2px entre glifos */
function buildSpaceGroteskWordPathD(text, cx, cy, fontSize, pathOptions) {
  const opts = { kerning: true, ...(pathOptions || {}) };
  const path = spaceGroteskFont.getPath(text, 0, 0, fontSize, opts);
  const box = path.getBoundingBox();
  const tx = cx - (box.x1 + box.x2) / 2;
  const ty = cy - (box.y1 + box.y2) / 2;
  path.commands.forEach((command) => {
    if (typeof command.x === "number") command.x += tx;
    if (typeof command.y === "number") command.y += ty;
    if (typeof command.x1 === "number") command.x1 += tx;
    if (typeof command.y1 === "number") command.y1 += ty;
    if (typeof command.x2 === "number") command.x2 += tx;
    if (typeof command.y2 === "number") command.y2 += ty;
  });
  return path.toPathData(2);
}

/** defs: marco + letras comparten el mismo cromo / líquido monocromo. */
function hookDefs(variant) {
  const pf = `${variant.prefix}_f`;
  const frameChromeBox = { x1: 0, y1: 0, x2: HOOK_W, y2: HOOK_H };
  const frameLiquidBox = { x1: 0, y1: HOOK_H * 0.5, x2: HOOK_W, y2: HOOK_H * 0.48 };
  return `
<defs>
  <linearGradient id="${pf}Chrome" gradientUnits="userSpaceOnUse" x1="${frameChromeBox.x1}" y1="${frameChromeBox.y1}" x2="${frameChromeBox.x2}" y2="${frameChromeBox.y2}">
    ${hueFrameStops(variant)}
  </linearGradient>
  <linearGradient id="${pf}Liquid" gradientUnits="userSpaceOnUse" x1="${frameLiquidBox.x1}" y1="${frameLiquidBox.y1}" x2="${frameLiquidBox.x2}" y2="${frameLiquidBox.y2}">
    ${monoLiquidStops(variant.pure)}
  </linearGradient>
</defs>`;
}

/**
 * Variante hook: marco tribal una sola hebra + “WORD” como paths tribales (mismo cromo).
 */
const hookPhotoVariants = [
  {
    id: "hook_photo_verde",
    prefix: "hk_v",
    pure: "#39ff14",
    deep: "#14532d",
    bright: "#c8ffbe",
  },
  {
    id: "hook_photo_azul",
    prefix: "hk_a",
    pure: "#00b8ff",
    deep: "#075985",
    bright: "#a5f3fc",
  },
  {
    id: "hook_photo_morado",
    prefix: "hk_m",
    pure: "#9333ea",
    deep: "#4c1d95",
    bright: "#e9d5ff",
  },
  {
    id: "hook_photo_naranja",
    prefix: "hk_n",
    pure: "#ff6b00",
    deep: "#7c2d12",
    bright: "#ffdba4",
  },
  {
    id: "hook_photo_rojo",
    prefix: "hk_r",
    pure: "#ef4444",
    deep: "#7f1d1d",
    bright: "#fecaca",
  },
];

const shortDefinitionVariants = [
  {
    id: "short_definition_ia",
    key: "AI",
    phrase: "A method used to train AI models with data",
    accentWords: ["train", "AI"],
    pure: "#39ff14",
    deep: "#14532d",
    bright: "#c8ffbe",
  },
  {
    id: "short_definition_psicologia",
    key: "PSYCHOLOGY",
    phrase: "A mental bias that affects how we judge others",
    accentWords: ["mental bias", "judge"],
    pure: "#9333ea",
    deep: "#4c1d95",
    bright: "#e9d5ff",
  },
  {
    id: "short_definition_dinero",
    key: "MONEY",
    phrase: "A measure of how profitable an investment is",
    accentWords: ["profitable", "investment"],
    pure: "#00b8ff",
    deep: "#075985",
    bright: "#a5f3fc",
  },
  {
    id: "short_definition_cultura",
    key: "CULTURE",
    phrase: "A word describing a deep emotional connection",
    accentWords: ["deep", "connection"],
    pure: "#ff6b00",
    deep: "#7c2d12",
    bright: "#ffdba4",
  },
  {
    id: "short_definition_relaciones",
    key: "RELATIONSHIPS",
    phrase: "When someone suddenly cuts off communication",
    accentWords: ["suddenly", "communication"],
    pure: "#ef4444",
    deep: "#7f1d1d",
    bright: "#fecaca",
  },
];

const extraValueVariants = [
  {
    id: "extra_value_ia",
    key: "AI",
    pure: "#39ff14",
    deep: "#14532d",
    bright: "#c8ffbe",
    phrase: "AI models improve with quality data, feedback loops, and consistent retraining.",
  },
  {
    id: "extra_value_psicologia",
    key: "PSYCHOLOGY",
    pure: "#9333ea",
    deep: "#4c1d95",
    bright: "#e9d5ff",
    phrase: "Biases quietly shape judgment, emotions, and how we interpret others.",
  },
  {
    id: "extra_value_dinero",
    key: "MONEY",
    pure: "#00b8ff",
    deep: "#075985",
    bright: "#a5f3fc",
    phrase: "Strong returns balance profit, risk, and long-term consistency.",
  },
  {
    id: "extra_value_cultura",
    key: "CULTURE",
    pure: "#ff6b00",
    deep: "#7c2d12",
    bright: "#ffdba4",
    phrase: "Language preserves identity through meanings that cannot be directly translated.",
  },
  {
    id: "extra_value_relaciones",
    key: "RELATIONSHIPS",
    pure: "#ef4444",
    deep: "#7f1d1d",
    bright: "#fecaca",
    phrase: "Sudden silence creates uncertainty, anxiety, and unresolved emotional closure.",
  },
];

function hookWordFontSize(displayWord) {
  const len = displayWord.length;
  if (len <= 4) return 130;
  if (len <= 7) return 112;
  if (len <= 10) return 96;
  if (len <= 14) return 82;
  return Math.max(56, 130 - len * 4);
}

/** Hook card: tribal frame + palabra centrada (misma lógica que PNG estáticos). */
function hookWordOverlay(variant, displayWord = "WORD") {
  const pf = `${variant.prefix}_f`;
  const isGreen = variant.id === "hook_photo_verde";
  const isBlue = variant.id === "hook_photo_azul";
  const isPurple = variant.id === "hook_photo_morado";
  const isOrange = variant.id === "hook_photo_naranja";
  const isRed = variant.id === "hook_photo_rojo";
  const w = String(displayWord || "WORD").trim() || "WORD";
  const fs = hookWordFontSize(w);
  const dWord = buildSigilWordPathD();
  const dOrbitronWord = buildOrbitronWordPathD(w, HOOK_W / 2, HOOK_H / 2, fs);
  const dInterWord = buildInterWordPathD(w, HOOK_W / 2, HOOK_H / 2, fs);
  const dManropeWord = buildManropeWordPathD(w, HOOK_W / 2, HOOK_H / 2, fs);
  const dPlayfairWord = buildPlayfairWordPathD(w, HOOK_W / 2, HOOK_H / 2, fs);
  const dPlusJakartaWord = buildPlusJakartaWordPathD(w, HOOK_W / 2, HOOK_H / 2, fs);
  return `
${hookDefs(variant)}
${isGreen ? chromeFilledPathStack(dOrbitronWord, pf, variant.pure, 1.18, false, true) : isBlue ? chromeFilledPathStack(dInterWord, pf, variant.pure, 1.18, false, true) : isPurple ? chromeFilledPathStack(dManropeWord, pf, variant.pure, 1.18, false, true) : isOrange ? chromeFilledPathStack(dPlayfairWord, pf, variant.pure, 1.18, false, true) : isRed ? chromeFilledPathStack(dPlusJakartaWord, pf, variant.pure, 1.18, false, true) : chromeThornPathStack(dWord, pf, 0.58)}
`.trim();
}

const RISEFORM_COVER_PHRASE = "This is your sign to keep going.";

/** Mismos gradientes `sthk` que `style_hook`, escalados al lienzo 800×600 de referencia. */
function styleHookGradientBox(targetW, targetH) {
  const sx = targetW / 800;
  const sy = targetH / 600;
  return {
    chrome: { x1: 64 * sx, y1: 96 * sy, x2: 736 * sx, y2: 504 * sy },
    liquid: { x1: 0 * sx, y1: 300 * sy, x2: 800 * sx, y2: 288 * sy },
  };
}

/** Perfil Riseform: “Riseform” en Playfair Display + relleno como `style_hook`. */
function riseformProfileOverlay() {
  const idPrefix = "sthk";
  const W = 512;
  const H = 512;
  const { chrome, liquid } = styleHookGradientBox(W, H);
  const word = "Riseform";
  const baseFs = Math.round(130 * (W / 800));
  const fs = Math.max(44, Math.round(baseFs * 0.58));
  const d = buildPlayfairWordPathD(word, W / 2, H / 2, fs);
  return `
${accentGradientDefs(idPrefix, chrome, liquid)}
${chromePathNoBorder(d, idPrefix)}
`.trim();
}

/** Portada Riseform: frase en Playfair Display + relleno como `style_hook`. */
function riseformCoverOverlay() {
  const idPrefix = "sthk";
  const W = 1280;
  const H = 400;
  const { chrome, liquid } = styleHookGradientBox(W, H);
  const lines = wrapByChars(RISEFORM_COVER_PHRASE, 40);
  const fs = 36;
  const lineGap = 48;
  const cx = W / 2;
  const midY = H / 2;
  const startY = midY - ((lines.length - 1) * lineGap) / 2;
  const paths = lines.map((line, i) => {
    const d = buildPlayfairWordPathD(line.trim(), cx, startY + i * lineGap, fs);
    return chromePathNoBorder(d, idPrefix);
  });
  return `
${accentGradientDefs(idPrefix, chrome, liquid)}
${paths.join("\n")}
`.trim();
}

function wrapByChars(text, maxCharsPerLine = 42) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function phraseWithAccents(phrase, accentWords) {
  const lower = phrase.toLowerCase();
  /** @type {{ start: number; end: number }[]} */
  const ranges = [];
  for (const rawWord of accentWords) {
    const word = rawWord.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(word, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + word.length });
      from = idx + word.length;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  /** @type {{ text: string; accent: boolean }[]} */
  const chunks = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) {
      chunks.push({ text: phrase.slice(cursor, range.start), accent: false });
    }
    chunks.push({ text: phrase.slice(range.start, range.end), accent: true });
    cursor = range.end;
  }
  if (cursor < phrase.length) {
    chunks.push({ text: phrase.slice(cursor), accent: false });
  }
  return chunks.length ? chunks : [{ text: phrase, accent: false }];
}

function shortDefinitionOverlayDynamic(variant, idSuffix, { titleKey, phrase, accentWords }) {
  const sid = `${variant.prefix}_${String(idSuffix).replace(/[^a-zA-Z0-9_]/g, "")}`;
  const accents = Array.isArray(accentWords) ? accentWords.map((a) => String(a).trim()).filter(Boolean) : [];
  const lines = wrapByChars(phrase, 27).slice(0, 3);
  const lineGap = 60;
  const startY = 336 - ((lines.length - 1) * lineGap) / 2;
  const textRows = lines
    .map((line, idx) => {
      const lineChunks = phraseWithAccents(line, accents);
      const inner = lineChunks
        .map((chunk) =>
          chunk.accent
            ? `<tspan fill="${variant.pure}" font-weight="800">${escapeXml(chunk.text)}</tspan>`
            : `<tspan fill="#F5F5F5" font-weight="600">${escapeXml(chunk.text)}</tspan>`,
        )
        .join("");
      return `<tspan x="${HOOK_W / 2}" y="${startY + idx * lineGap}" xml:space="preserve">${inner}</tspan>`;
    })
    .join("");
  const title = escapeXml(String(titleKey ?? ""));
  return `
<defs>
  <linearGradient id="${sid}_bg" x1="4%" y1="6%" x2="96%" y2="94%">
    <stop offset="0%" stop-color="#000000"/>
    <stop offset="100%" stop-color="#000000"/>
  </linearGradient>
  <filter id="${sid}_titleGlow" x="-30%" y="-70%" width="160%" height="240%">
    <feGaussianBlur stdDeviation="5.8" />
  </filter>
</defs>
<rect x="0" y="0" width="${HOOK_W}" height="${HOOK_H}" fill="url(#${sid}_bg)"/>
<text x="${HOOK_W / 2}" y="170" fill="${variant.pure}" text-anchor="middle" font-family="${font}" font-size="58" font-weight="900" letter-spacing="0.04em" opacity="0.62" filter="url(#${sid}_titleGlow)">${title}</text>
<text x="${HOOK_W / 2}" y="170" fill="rgba(248,250,252,0.88)" text-anchor="middle" font-family="${font}" font-size="58" font-weight="900" letter-spacing="0.04em">${title}</text>
<text text-anchor="middle" font-family="${font}" font-size="49" letter-spacing="0.002em" word-spacing="0.08em" xml:space="preserve">${textRows}</text>
<line x1="218" y1="472" x2="382" y2="472" stroke="${variant.pure}" stroke-opacity="0.78" stroke-width="2"/>
<line x1="418" y1="472" x2="582" y2="472" stroke="${variant.pure}" stroke-opacity="0.78" stroke-width="2"/>
<circle cx="${HOOK_W / 2}" cy="472" r="4" fill="#f8fafc"/>
<circle cx="${HOOK_W / 2}" cy="472" r="10" fill="${variant.pure}" fill-opacity="0.45"/>
`.trim();
}

function shortDefinitionOverlay(variant) {
  return shortDefinitionOverlayDynamic(variant, variant.id, {
    titleKey: variant.key,
    phrase: variant.phrase,
    accentWords: variant.accentWords,
  });
}

function extraValueOverlayDynamic(variant, phrase) {
  const text = String(phrase ?? "").trim() || "…";
  const lines = wrapByChars(text, 20).slice(0, 7);
  const lineGap = 40;
  const startY = 304 - ((lines.length - 1) * lineGap) / 2;
  const textRows = lines
    .map(
      (line, idx) =>
        `<tspan x="${HOOK_W / 2}" y="${startY + idx * lineGap}" xml:space="preserve">${escapeXml(line)}</tspan>`,
    )
    .join("");
  const cardX = 128;
  const cardY = 74;
  const cardW = 544;
  const cardH = 452;
  const cardR = 28;
  return `
<defs>
</defs>
<rect x="0" y="0" width="${HOOK_W}" height="${HOOK_H}" fill="#000000"/>
<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" fill="#000000" fill-opacity="0.94"/>
<line x1="${cardX - 1}" y1="${cardY + cardR}" x2="${cardX - 1}" y2="${cardY + cardH - cardR}" stroke="${variant.pure}" stroke-opacity="0.82" stroke-width="2.8"/>
<line x1="${cardX + cardW + 1}" y1="${cardY + cardR}" x2="${cardX + cardW + 1}" y2="${cardY + cardH - cardR}" stroke="${variant.pure}" stroke-opacity="0.82" stroke-width="2.8"/>
<text text-anchor="middle" font-family="${font}" font-size="36" font-weight="620" letter-spacing="0.001em" word-spacing="0.03em" fill="rgba(245,245,245,0.96)" xml:space="preserve">${textRows}</text>
`.trim();
}

function extraValueOverlay(variant) {
  return extraValueOverlayDynamic(variant, variant.phrase);
}

function styleHookOverlay() {
  const d = buildSpaceGroteskWordPathD("WORD", 400, 300, 130);
  return `
${accentGradientDefs(
  "sthk",
  { x1: 64, y1: 96, x2: 736, y2: 504 },
  { x1: 0, y1: 300, x2: 800, y2: 288 },
)}
${chromePathNoBorder(d, "sthk")}
`.trim();
}

function styleShortOverlay() {
  const phrase = "A measure of how profitable an investment is";
  const lines = wrapByChars(phrase, 27).slice(0, 3);
  const lineGap = 60;
  const startY = 336 - ((lines.length - 1) * lineGap) / 2;
  const textRows = lines
    .map((line, idx) => {
      const lineChunks = phraseWithAccents(line, ["profitable", "investment"]);
      const inner = lineChunks
        .map((chunk) =>
          chunk.accent
            ? `<tspan fill="url(#stshChrome)" font-weight="800">${escapeXml(chunk.text)}</tspan>`
            : `<tspan fill="#F5F5F5" font-weight="600">${escapeXml(chunk.text)}</tspan>`,
        )
        .join("");
      return `<tspan x="${HOOK_W / 2}" y="${startY + idx * lineGap}" xml:space="preserve">${inner}</tspan>`;
    })
    .join("");
  return `
${accentGradientDefs(
  "stsh",
  { x1: 64, y1: 96, x2: 736, y2: 504 },
  { x1: 0, y1: 300, x2: 800, y2: 288 },
)}
<rect x="0" y="0" width="${HOOK_W}" height="${HOOK_H}" fill="#000000"/>
<text x="${HOOK_W / 2}" y="170" fill="url(#stshChrome)" text-anchor="middle" font-family="${font}" font-size="58" font-weight="900" letter-spacing="0.04em" opacity="0.62">${"MONEY"}</text>
<text x="${HOOK_W / 2}" y="170" fill="url(#stshChrome)" text-anchor="middle" font-family="${font}" font-size="58" font-weight="900" letter-spacing="0.04em">${"MONEY"}</text>
<text text-anchor="middle" font-family="${font}" font-size="49" letter-spacing="0.002em" word-spacing="0.08em" xml:space="preserve">${textRows}</text>
<line x1="218" y1="472" x2="382" y2="472" stroke="url(#stshChrome)" stroke-opacity="0.78" stroke-width="2"/>
<line x1="418" y1="472" x2="582" y2="472" stroke="url(#stshChrome)" stroke-opacity="0.78" stroke-width="2"/>
<circle cx="${HOOK_W / 2}" cy="472" r="4" fill="#f8fafc"/>
<circle cx="${HOOK_W / 2}" cy="472" r="10" fill="url(#stshChrome)" fill-opacity="0.45"/>
`.trim();
}

function styleExtraValueOverlay() {
  const phrase = "Strong returns balance profit, risk, and long-term consistency.";
  const lines = wrapByChars(phrase, 20).slice(0, 7);
  const lineGap = 40;
  const startY = 304 - ((lines.length - 1) * lineGap) / 2;
  const textRows = lines
    .map(
      (line, idx) =>
        `<tspan x="${HOOK_W / 2}" y="${startY + idx * lineGap}" xml:space="preserve">${escapeXml(line)}</tspan>`,
    )
    .join("");
  const cardX = 128;
  const cardY = 74;
  const cardW = 544;
  const cardH = 452;
  const cardR = 28;
  return `
${accentGradientDefs(
  "stev",
  { x1: 64, y1: 96, x2: 736, y2: 504 },
  { x1: 0, y1: 300, x2: 800, y2: 288 },
)}
<rect x="0" y="0" width="${HOOK_W}" height="${HOOK_H}" fill="#000000"/>
<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardR}" fill="#000000" fill-opacity="0.94"/>
<line x1="${cardX - 1}" y1="${cardY + cardR}" x2="${cardX - 1}" y2="${cardY + cardH - cardR}" stroke="url(#stevChrome)" stroke-opacity="0.82" stroke-width="4.2"/>
<line x1="${cardX + cardW + 1}" y1="${cardY + cardR}" x2="${cardX + cardW + 1}" y2="${cardY + cardH - cardR}" stroke="url(#stevChrome)" stroke-opacity="0.82" stroke-width="4.2"/>
<text text-anchor="middle" font-family="${font}" font-size="36" font-weight="620" letter-spacing="0.001em" word-spacing="0.03em" fill="rgba(245,245,245,0.96)" xml:space="preserve">${textRows}</text>
`.trim();
}

/** @type {{ id: string; width: number; height: number; overlay?: Buffer }[]} */
const specs = [
  {
    id: "profile_photo",
    width: 512,
    height: 512,
    overlay: svgBuffer(512, 512, profileOverlay()),
  },
  {
    id: "cover_photo",
    width: 1280,
    height: 400,
    overlay: svgBuffer(1280, 400, coverOverlay()),
  },
  {
    id: "profile_photo_preview",
    width: 512,
    height: 512,
    overlay: svgBuffer(512, 512, profileOverlayPreview()),
  },
  {
    id: "cover_photo_preview",
    width: 1280,
    height: 400,
    overlay: svgBuffer(1280, 400, coverOverlayPreview()),
  },
  {
    id: "riseform_profile",
    width: 512,
    height: 512,
    overlay: svgBuffer(512, 512, riseformProfileOverlay()),
  },
  {
    id: "riseform_cover",
    width: 1280,
    height: 400,
    overlay: svgBuffer(1280, 400, riseformCoverOverlay()),
  },
  {
    id: "style_hook",
    width: HOOK_W,
    height: HOOK_H,
    overlay: svgBuffer(HOOK_W, HOOK_H, styleHookOverlay()),
  },
  {
    id: "style_short",
    width: HOOK_W,
    height: HOOK_H,
    overlay: svgBuffer(HOOK_W, HOOK_H, styleShortOverlay()),
  },
  {
    id: "style_extra_value",
    width: HOOK_W,
    height: HOOK_H,
    overlay: svgBuffer(HOOK_W, HOOK_H, styleExtraValueOverlay()),
  },
  ...hookPhotoVariants.map((v) => ({
    id: v.id,
    width: HOOK_W,
    height: HOOK_H,
    overlay: svgBuffer(HOOK_W, HOOK_H, hookWordOverlay(v, "WORD")),
  })),
  ...shortDefinitionVariants.map((v) => ({
    id: v.id,
    width: HOOK_W,
    height: HOOK_H,
    overlay: svgBuffer(HOOK_W, HOOK_H, shortDefinitionOverlay(v)),
  })),
  ...extraValueVariants.map((v) => ({
    id: v.id,
    width: HOOK_W,
    height: HOOK_H,
    overlay: svgBuffer(HOOK_W, HOOK_H, extraValueOverlay(v)),
  })),
];

function svgBuffer(width, height, inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${inner}</svg>`;
  return Buffer.from(svg, "utf8");
}

const black = { r: 0, g: 0, b: 0, alpha: 1 };

/** Misma paleta que hooks estáticos: tech=verde, money=azul, psychology=morado, culture=naranja, love=rojo */
export const variantForCategoryId = {
  tech: hookPhotoVariants[0],
  psychology: hookPhotoVariants[2],
  money: hookPhotoVariants[1],
  culture: hookPhotoVariants[3],
  love: hookPhotoVariants[4],
};

export function resolveVariantForCategory(categoryId) {
  return variantForCategoryId[categoryId] || variantForCategoryId.money;
}

async function pngFromSvgOverlay(width, height, innerSvg) {
  const overlay = svgBuffer(width, height, innerSvg);
  return sharp({
    create: { width, height, channels: 4, background: black },
  })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/** Tres PNG (hook, short_definition, extra_value) listos para data URL o guardar en disco. */
export async function renderDynamicContentPack({ word, description, extra, highlights, categoryId }) {
  const variant = resolveVariantForCategory(categoryId);
  const uid = randomUUID().replace(/-/g, "").slice(0, 10);
  const displayWord = String(word ?? "").trim() || "WORD";
  log(
    "[render-cards] inicio |",
    JSON.stringify({
      categoryId,
      variant: variant.id,
      accent: variant.pure,
      word: displayWord,
      highlights,
    }),
  );

  const shortInner = shortDefinitionOverlayDynamic(variant, uid, {
    titleKey: displayWord,
    phrase: String(description ?? "").trim() || "…",
    accentWords: Array.isArray(highlights) ? highlights : [],
  });

  const [hookPng, shortPng, extraPng] = await Promise.all([
    pngFromSvgOverlay(HOOK_W, HOOK_H, hookWordOverlay(variant, displayWord)),
    pngFromSvgOverlay(HOOK_W, HOOK_H, shortInner),
    pngFromSvgOverlay(HOOK_W, HOOK_H, extraValueOverlayDynamic(variant, String(extra ?? "").trim() || "…")),
  ]);
  log(
    "[render-cards] sharp terminó (3 PNG) |",
    JSON.stringify({
      hook_bytes: hookPng.length,
      short_bytes: shortPng.length,
      extra_bytes: extraPng.length,
    }),
  );

  return {
    width: HOOK_W,
    height: HOOK_H,
    category_id: categoryId,
    accent_color: variant.pure,
    hook: hookPng,
    short_definition: shortPng,
    extra_value: extraPng,
  };
}

/** Binario embebido (`ffmpeg-static`) o `ffmpeg` del PATH como respaldo */
function resolveFfmpegBinary() {
  if (typeof ffmpegStatic === "string" && ffmpegStatic.length > 0 && existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return "ffmpeg";
}

/**
 * Las tres tarjetas PNG que devuelve `renderDynamicContentPack` (Gemini + categoría).
 * @param {[Buffer, Buffer, Buffer]} pngBuffers hook, short_definition, extra_value
 * @returns {Promise<Buffer | null>} MP4 o null si ffmpeg falla
 */
export async function buildSlideshowMp4FromPngBuffers(pngBuffers) {
  if (!Array.isArray(pngBuffers) || pngBuffers.length !== 3) {
    return null;
  }
  const ffmpegBin = resolveFfmpegBinary();
  const probe = spawnSync(ffmpegBin, ["-hide_banner", "-version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    logErr(
      "[rnd-word] ffmpeg no disponible (binario embebido ni PATH): vídeo omitido.",
      probe.stderr?.slice(0, 300) || probe.error?.message || "",
    );
    return null;
  }

  const d1 = 2;
  const d2 = 3;
  const d3 = 3;
  const f = 0.5;
  const W = 1280;
  const H = 720;
  const offset1 = d1 - f;
  const v01Duration = d1 + d2 - f;
  const offset2 = v01Duration - f;
  const scale = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1,fps=30`;
  const filter = [
    `[0:v]${scale}[v0]`,
    `[1:v]${scale}[v1]`,
    `[2:v]${scale}[v2]`,
    `[v0][v1]xfade=transition=fade:duration=${f}:offset=${offset1}[v01]`,
    `[v01][v2]xfade=transition=fade:duration=${f}:offset=${offset2}[vout]`,
  ].join(";");

  let workDir;
  try {
    workDir = await mkdtemp(join(tmpdir(), "rnd-words-slideshow-"));
    const p0 = join(workDir, "0.png");
    const p1 = join(workDir, "1.png");
    const p2 = join(workDir, "2.png");
    const outPath = join(workDir, "out.mp4");
    await writeFile(p0, pngBuffers[0]);
    await writeFile(p1, pngBuffers[1]);
    await writeFile(p2, pngBuffers[2]);

    const args = [
      "-hide_banner",
      "-y",
      "-loop",
      "1",
      "-t",
      String(d1),
      "-i",
      p0,
      "-loop",
      "1",
      "-t",
      String(d2),
      "-i",
      p1,
      "-loop",
      "1",
      "-t",
      String(d3),
      "-i",
      p2,
      "-filter_complex",
      filter,
      "-map",
      "[vout]",
      "-an",
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
    const run = spawnSync(ffmpegBin, args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    if (run.error) {
      logErr("[rnd-word] ffmpeg:", run.error.message);
      return null;
    }
    if (run.status !== 0) {
      logErr("[rnd-word] ffmpeg:", run.stderr?.slice(-2500) || run.stdout);
      return null;
    }
    const mp4 = await readFile(outPath);
    log(
      "[rnd-word] vídeo listo |",
      `hook→short→extra | ${d1}s+${d2}s+${d3}s xfade=${f}s | ${mp4.length} bytes`,
    );
    return mp4;
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function runStaticImageExport() {
  await mkdir(outDir, { recursive: true });
  for (const { id, width, height, overlay } of specs) {
    const path = join(outDir, `${id}.png`);
    let pipeline = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: black,
      },
    });

    if (overlay) {
      pipeline = pipeline.composite([{ input: overlay, top: 0, left: 0 }]);
    }

    await pipeline.png().toFile(path);
    log("OK", path, `${width}x${height}`);
  }

  log("Listo. Abre rnd-word.html en el navegador.");
}

function profileOverlay() {
  /** Premium perfil: negro (fondo sharp) + RND blanco, grande, centrado, letter-spacing ~2px (opentype: em). */
  const fontSize = 122;
  const letterSpacing = 2 / fontSize;
  const d = buildSpaceGroteskWordPathD("RND", 256, 256, fontSize, { letterSpacing });
  return `
<path d="${d}" fill="#FFFFFF" fill-rule="evenodd"/>
`.trim();
}

function coverOverlay() {
  /** Portada: dos líneas intencionales, centrado un poco alto; línea 2 gris suave + glow muy leve en el bloque. */
  const cx = 640;
  const y1 = 166;
  const y2 = 248;
  const font1 = 54;
  const font2 = 50;
  const d1 = buildSpaceGroteskWordPathD("new words daily", cx, y1, font1, {
    letterSpacing: 2.5 / font1,
  });
  const d2 = buildSpaceGroteskWordPathD("concepts in seconds", cx, y2, font2, {
    letterSpacing: 3 / font2,
  });
  return `
<defs>
  <filter id="cvSoftGlow" x="-8%" y="-40%" width="116%" height="180%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="0.9" result="blur"/>
    <feFlood flood-color="#ffffff" flood-opacity="0.22" result="flood"/>
    <feComposite in="flood" in2="blur" operator="in" result="glow"/>
    <feMerge>
      <feMergeNode in="glow"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
<g filter="url(#cvSoftGlow)">
  <path d="${d1}" fill="#FFFFFF" fill-rule="evenodd"/>
  <path d="${d2}" fill="#CFCFCF" fill-rule="evenodd"/>
</g>
`.trim();
}

/** Perfil “marca” para rnd-word.html: halo sutil multicolor + RND con relleno y bloom ligero (perfil clásico: profile_photo; riseform: riseform_profile con “Riseform”). */
function profileOverlayPreview() {
  const fontSize = 122;
  const letterSpacing = 2 / fontSize;
  const d = buildSpaceGroteskWordPathD("RND", 256, 256, fontSize, { letterSpacing });
  return `
<defs>
  <radialGradient id="prvHalo" cx="50%" cy="50%" r="68%" gradientUnits="objectBoundingBox">
    <stop offset="0%" stop-color="#39ff14" stop-opacity="0.125"/>
    <stop offset="22%" stop-color="#00b8ff" stop-opacity="0.098"/>
    <stop offset="44%" stop-color="#9333ea" stop-opacity="0.089"/>
    <stop offset="66%" stop-color="#ff6b00" stop-opacity="0.071"/>
    <stop offset="88%" stop-color="#ef4444" stop-opacity="0.054"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="prvLetter" x1="28%" y1="22%" x2="72%" y2="78%" gradientUnits="objectBoundingBox">
    <stop offset="0%" stop-color="#ffffff"/>
    <stop offset="52%" stop-color="#f1f5f9"/>
    <stop offset="100%" stop-color="#cbd5e1"/>
  </linearGradient>
  <filter id="prvBloom" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.85" result="b"/>
    <feFlood flood-color="#c5d3e8" flood-opacity="0.21" result="f"/>
    <feComposite in="f" in2="b" operator="in" result="g"/>
    <feMerge>
      <feMergeNode in="g"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
<rect x="0" y="0" width="512" height="512" fill="url(#prvHalo)"/>
<g filter="url(#prvBloom)">
  <path d="${d}" fill="url(#prvLetter)" fill-rule="evenodd"/>
</g>
`.trim();
}

/** Portada “marca” para rnd-word.html: negro + franja horizontal de marca + línea neón suave; copy con ritmo (portada clásica: cover_photo; estilo hook: riseform_cover). */
function coverOverlayPreview() {
  const cx = 640;
  const y1 = 164;
  const y2 = 246;
  const font1 = 52;
  const font2 = 48;
  const d1 = buildSpaceGroteskWordPathD("New words. Daily.", cx, y1, font1, {
    letterSpacing: 2.2 / font1,
  });
  const d2 = buildSpaceGroteskWordPathD("Concepts in seconds.", cx, y2, font2, {
    letterSpacing: 2.6 / font2,
  });
  const lineY = 312;
  return `
<defs>
  <linearGradient id="cvPrBand" x1="0" y1="200" x2="1280" y2="200" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#000000"/>
    <stop offset="14%" stop-color="#0c2418"/>
    <stop offset="30%" stop-color="#0c2838"/>
    <stop offset="48%" stop-color="#1a1240"/>
    <stop offset="66%" stop-color="#281808"/>
    <stop offset="84%" stop-color="#240c10"/>
    <stop offset="100%" stop-color="#000000"/>
  </linearGradient>
  <linearGradient id="cvPrNeon" x1="120" y1="${lineY}" x2="1160" y2="${lineY}" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#39ff14" stop-opacity="0"/>
    <stop offset="18%" stop-color="#39ff14" stop-opacity="0.35"/>
    <stop offset="36%" stop-color="#38bdf8" stop-opacity="0.55"/>
    <stop offset="54%" stop-color="#a78bfa" stop-opacity="0.5"/>
    <stop offset="72%" stop-color="#fdba74" stop-opacity="0.42"/>
    <stop offset="90%" stop-color="#f87171" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
  </linearGradient>
  <filter id="cvPrNeonBlur" x="-5%" y="-200%" width="110%" height="500%">
    <feGaussianBlur stdDeviation="5" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="blur"/>
    </feMerge>
  </filter>
  <filter id="cvPrTypeGlow" x="-8%" y="-40%" width="116%" height="180%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur"/>
    <feFlood flood-color="#ffffff" flood-opacity="0.18" result="flood"/>
    <feComposite in="flood" in2="blur" operator="in" result="glow"/>
    <feMerge>
      <feMergeNode in="glow"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
<rect x="0" y="0" width="1280" height="400" fill="#000000"/>
<rect x="0" y="0" width="1280" height="400" fill="url(#cvPrBand)" opacity="0.92"/>
<line x1="100" y1="${lineY}" x2="1180" y2="${lineY}" stroke="url(#cvPrNeon)" stroke-width="10" stroke-linecap="round" opacity="0.22" filter="url(#cvPrNeonBlur)"/>
<line x1="140" y1="${lineY}" x2="1140" y2="${lineY}" stroke="url(#cvPrNeon)" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/>
<g filter="url(#cvPrTypeGlow)">
  <path d="${d1}" fill="#FFFFFF" fill-rule="evenodd"/>
  <path d="${d2}" fill="#B8BCC8" fill-rule="evenodd"/>
</g>
`.trim();
}
