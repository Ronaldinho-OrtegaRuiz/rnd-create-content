import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";
import { riseformGradientBoxes } from "../core/chrome-raster.mjs";
import { playfairDisplayFont } from "../core/playfair-display-font.mjs";
import { accentGradientDefs, chromePathNoBorder } from "../core/riseform-chrome-svg.mjs";

/** Fondo siempre negro (alineado con lienzo Riseform). */
export const POSTER_BACKGROUND = "#000000";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const BOLD_CANDIDATES = [
  join(repoRoot, "fonts", "Playfair_Display", "static", "PlayfairDisplay-Bold.ttf"),
  join(repoRoot, "fonts", "Playfair_Display", "PlayfairDisplay-Bold.ttf"),
];

/** Serif bold si existe en disco; si no, variable Playfair (proyecto Riseform). */
export const posterSerifFont = await loadBoldSerif();

async function loadBoldSerif() {
  for (const p of BOLD_CANDIDATES) {
    if (existsSync(p)) {
      try {
        return await opentype.load(p);
      } catch {
        /* siguiente */
      }
    }
  }
  return playfairDisplayFont;
}

/**
 * @param {import("opentype.js").Font} font
 * @param {string} text
 * @param {number} fontSize
 */
function measureLineWidth(font, text, fontSize) {
  const path = font.getPath(text, 0, 0, fontSize, { kerning: true });
  const box = path.getBoundingBox();
  return box.x2 - box.x1;
}

/**
 * @param {import("opentype.js").Font} font
 * @param {string} text
 * @param {number} cx
 * @param {number} cy
 * @param {number} fontSize
 */
function pathDCentered(font, text, cx, cy, fontSize) {
  const path = font.getPath(text, 0, 0, fontSize, { kerning: true });
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

/**
 * Salto de línea por ancho (palabras).
 * @param {import("opentype.js").Font} font
 */
function wrapTextToWidth(font, text, maxWidth, fontSize) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  /** @type {string[]} */
  const lines = [];
  let line = [];
  for (const w of words) {
    const candidate = line.length ? `${line.join(" ")} ${w}` : w;
    if (measureLineWidth(font, candidate, fontSize) <= maxWidth) {
      line.push(w);
      continue;
    }
    if (line.length) {
      lines.push(line.join(" "));
      line = [];
    }
    if (measureLineWidth(font, w, fontSize) <= maxWidth) {
      line.push(w);
    } else {
      lines.push(w);
    }
  }
  if (line.length) lines.push(line.join(" "));
  return lines;
}

/**
 * Altura total del bloque: bbox por línea + hueco relativo al tamaño.
 * @param {import("opentype.js").Font} font
 */
function measureStackHeight(font, lines, fontSize, lineGapRatio) {
  if (lines.length === 0) return 0;
  const gap = fontSize * lineGapRatio;
  let total = 0;
  lines.forEach((line, i) => {
    const path = font.getPath(line, 0, 0, fontSize, { kerning: true });
    const b = path.getBoundingBox();
    total += b.y2 - b.y1;
    if (i < lines.length - 1) total += gap;
  });
  return total;
}

/**
 * Comprueba si el texto cabe en el rectángulo interior.
 * @param {import("opentype.js").Font} font
 */
function layoutFits(font, text, maxW, maxH, fontSize, lineGapRatio) {
  const lines = wrapTextToWidth(font, text, maxW, fontSize);
  if (lines.length === 0) return false;
  for (const ln of lines) {
    if (measureLineWidth(font, ln, fontSize) > maxW + 0.5) return false;
  }
  const h = measureStackHeight(font, lines, fontSize, lineGapRatio);
  return h <= maxH + 0.5;
}

/**
 * Busca el mayor fontSize entero que encaja.
 * @param {import("opentype.js").Font} font
 */
function findBestFontSize(font, text, maxW, maxH, lineGapRatio) {
  let lo = 4;
  let hi = Math.floor(Math.min(maxW, maxH) * 1.2);
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (layoutFits(font, text, maxW, maxH, mid, lineGapRatio)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best > 0 ? best : 4;
}

/**
 * Reduce fs hasta que líneas y altura encajen (palabra muy larga sin espacios).
 * @param {import("opentype.js").Font} font
 */
function tightenUntilFits(font, text, innerW, innerH, lineGapRatio, fontSize) {
  let fs = fontSize;
  for (let i = 0; i < 400 && fs >= 4; i++) {
    const lines = wrapTextToWidth(font, text, innerW, fs);
    const wOk = lines.every((ln) => measureLineWidth(font, ln, fs) <= innerW + 1);
    const h = measureStackHeight(font, lines, fs, lineGapRatio);
    if (wOk && h <= innerH + 1) return fs;
    fs -= 1;
  }
  return Math.max(4, fs);
}

function escapeXmlAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * Genera PNG: fondo negro fijo + texto Playfair con el mismo relleno Chrome/Liquid que Riseform.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} [opts.paddingRatio] (defecto 0.125)
 * @param {number} [opts.lineGapRatio] (defecto 0.22)
 * @param {import("opentype.js").Font} [opts.font] serif Riseform
 * @returns {Promise<Buffer>} PNG
 */
export async function renderSolidTypographyPoster(opts) {
  const text = typeof opts.text === "string" ? opts.text : "";
  const width = Math.max(32, Math.round(Number(opts.width) || 512));
  const height = Math.max(32, Math.round(Number(opts.height) || 512));
  const background = POSTER_BACKGROUND;
  const paddingRatio =
    typeof opts.paddingRatio === "number" && opts.paddingRatio > 0 && opts.paddingRatio < 0.35
      ? opts.paddingRatio
      : 0.125;
  const lineGapRatio =
    typeof opts.lineGapRatio === "number" && opts.lineGapRatio >= 0 && opts.lineGapRatio < 0.6 ? opts.lineGapRatio : 0.22;

  const font = opts.font || posterSerifFont;

  const shortSide = Math.min(width, height);
  const pad = Math.round(shortSide * paddingRatio);
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;

  if (!text.trim()) {
    const svgEmpty = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${escapeXmlAttr(background)}"/></svg>`;
    return sharp(Buffer.from(svgEmpty, "utf8")).png().toBuffer();
  }

  let fontSize = findBestFontSize(font, text, innerW, innerH, lineGapRatio);
  fontSize = tightenUntilFits(font, text, innerW, innerH, lineGapRatio, fontSize);
  const lines = wrapTextToWidth(font, text, innerW, fontSize);
  const gap = fontSize * lineGapRatio;

  const lineBoxes = lines.map((line) => {
    const p = font.getPath(line, 0, 0, fontSize, { kerning: true });
    return p.getBoundingBox();
  });
  const heights = lineBoxes.map((b) => b.y2 - b.y1);
  const totalStack =
    heights.reduce((a, h, i) => a + h + (i < heights.length - 1 ? gap : 0), 0) || heights[0] || fontSize;

  let yCursor = pad + (innerH - totalStack) / 2;
  const pathDs = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = heights[i];
    const cy = yCursor + h / 2;
    pathDs.push(pathDCentered(font, line, width / 2, cy, fontSize));
    yCursor += h + (i < lines.length - 1 ? gap : 0);
  }

  const boxes = riseformGradientBoxes(width, height);
  const idPrefix = `pst_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const defs = accentGradientDefs(idPrefix, boxes.chrome, boxes.liquid);
  const pathMarkup = pathDs.map((d) => chromePathNoBorder(d, idPrefix)).join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXmlAttr(background)}"/>
  ${defs}
  ${pathMarkup}
</svg>`;

  return sharp(Buffer.from(svg, "utf8")).png().toBuffer();
}

/**
 * Comprueba si un bloque de líneas fijas cabe en el rectángulo interior.
 * @param {import("opentype.js").Font} font
 * @param {string[]} lines
 */
function linesStackFits(font, lines, maxW, maxH, fontSize, lineGapRatio) {
  for (const ln of lines) {
    if (measureLineWidth(font, ln, fontSize) > maxW + 0.5) return false;
  }
  return measureStackHeight(font, lines, fontSize, lineGapRatio) <= maxH + 0.5;
}

/**
 * Mayor tamaño para un bloque de líneas conocidas.
 * @param {import("opentype.js").Font} font
 * @param {string[]} lines
 */
function findBestFontSizeForLines(font, lines, maxW, maxH, lineGapRatio) {
  let lo = 4;
  let hi = Math.floor(Math.min(maxW, maxH) * 1.15);
  let best = 4;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (linesStackFits(font, lines, maxW, maxH, mid, lineGapRatio)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best > 0 ? best : 4;
}

/**
 * @param {import("opentype.js").Font} font
 * @param {string[]} lines
 */
function tightenLinesUntilFits(font, lines, innerW, innerH, lineGapRatio, fontSize) {
  let fs = fontSize;
  for (let i = 0; i < 500 && fs >= 4; i++) {
    const wOk = lines.every((ln) => measureLineWidth(font, ln, fs) <= innerW + 1);
    const h = measureStackHeight(font, lines, fs, lineGapRatio);
    if (wOk && h <= innerH + 1) return fs;
    fs -= 1;
  }
  return Math.max(4, fs);
}

/**
 * Geometría del póster apilado (una línea = una entrada) para render o revelado por máscaras.
 *
 * @param {object} opts
 * @param {string[]} opts.lines
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} [opts.paddingRatio=0.1]
 * @param {number} [opts.lineGapRatio=0.2]
 * @param {import("opentype.js").Font} [opts.font]
 * @returns {{ width: number; height: number; background: string; fontSize: number; pad: number; gap: number; lines: Array<{ text: string; cy: number; pathD: string; bbox: { x1: number; y1: number; x2: number; y2: number } }> }}
 */
export function computeRiseformPosterStackLayout(opts) {
  const lines = Array.isArray(opts.lines)
    ? opts.lines.map((l) => String(l).trim()).filter(Boolean)
    : [];
  const width = Math.max(32, Math.round(Number(opts.width) || 1080));
  const height = Math.max(32, Math.round(Number(opts.height) || 1920));
  const background = POSTER_BACKGROUND;
  const paddingRatio =
    typeof opts.paddingRatio === "number" && opts.paddingRatio > 0 && opts.paddingRatio < 0.35
      ? opts.paddingRatio
      : 0.1;
  const lineGapRatio =
    typeof opts.lineGapRatio === "number" && opts.lineGapRatio >= 0 && opts.lineGapRatio < 0.55
      ? opts.lineGapRatio
      : 0.2;

  const font = opts.font || posterSerifFont;
  const shortSide = Math.min(width, height);
  const pad = Math.round(shortSide * paddingRatio);
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;

  if (lines.length === 0) {
    return { width, height, background, fontSize: 4, pad, gap: 0, lines: [] };
  }

  let fontSize = findBestFontSizeForLines(font, lines, innerW, innerH, lineGapRatio);
  fontSize = tightenLinesUntilFits(font, lines, innerW, innerH, lineGapRatio, fontSize);
  const gap = fontSize * lineGapRatio;

  const heights = lines.map((line) => {
    const p = font.getPath(line, 0, 0, fontSize, { kerning: true });
    const b = p.getBoundingBox();
    return b.y2 - b.y1;
  });

  let yWalk = pad;
  /** @type {Array<{ text: string; cy: number; pathD: string; bbox: { x1: number; y1: number; x2: number; y2: number } }>} */
  const lineInfos = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = heights[i];
    const cy = yWalk + h / 2;
    const pathD = pathDCentered(font, line, width / 2, cy, fontSize);
    const bboxRaw = font.getPath(line, width / 2, cy, fontSize, { kerning: true }).getBoundingBox();
    lineInfos.push({
      text: line,
      cy,
      pathD,
      bbox: { x1: bboxRaw.x1, y1: bboxRaw.y1, x2: bboxRaw.x2, y2: bboxRaw.y2 },
    });
    yWalk += h + (i < lines.length - 1 ? gap : 0);
  }

  return { width, height, background, fontSize, pad, gap, lines: lineInfos };
}

/**
 * Póster Riseform: varias líneas fijas apiladas **desde arriba** (misma capa, sin reemplazar).
 * Útil para vídeo “staged”: cada frame añade una línea más; el tamaño se reajusta para que todo quepa.
 *
 * @param {object} opts
 * @param {string[]} opts.lines líneas en orden (ej. una palabra por línea)
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} [opts.paddingRatio=0.1]
 * @param {number} [opts.lineGapRatio=0.2]
 * @param {import("opentype.js").Font} [opts.font]
 * @returns {Promise<Buffer>} PNG
 */
export async function renderRiseformChromePosterStackLines(opts) {
  const layout = computeRiseformPosterStackLayout(opts);
  const { width, height, background, lines } = layout;

  if (lines.length === 0) {
    const svgEmpty = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${escapeXmlAttr(background)}"/></svg>`;
    return sharp(Buffer.from(svgEmpty, "utf8")).png().toBuffer();
  }

  const boxes = riseformGradientBoxes(width, height);
  const idPrefix = `stk_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const defs = accentGradientDefs(idPrefix, boxes.chrome, boxes.liquid);
  const pathMarkup = lines.map((ln) => chromePathNoBorder(ln.pathD, idPrefix)).join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXmlAttr(background)}"/>
  ${defs}
  ${pathMarkup}
</svg>`;

  return sharp(Buffer.from(svg, "utf8")).png().toBuffer();
}

function svgPathDAttr(pathD) {
  return String(pathD).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/**
 * Un fotograma del modo “staged”: composición fija; líneas ya pasadas en cromo; la línea `focusLineIndex`
 * interpola **negro → gradiente** (`blendT` 0…1); líneas futuras solo en negro (invisibles sobre fondo negro).
 *
 * @param {ReturnType<typeof computeRiseformPosterStackLayout>} layout
 * @param {number} focusLineIndex 0…n-1
 * @param {number} blendT 0 = solo negro en esa línea, 1 = cromo completo
 * @returns {Promise<Buffer>} PNG
 */
export async function renderRiseformStagedBlackToChromeFrame(layout, focusLineIndex, blendT) {
  const { width, height, background, lines } = layout;
  const n = lines.length;
  if (n === 0) {
    const svgEmpty = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${escapeXmlAttr(background)}"/></svg>`;
    return sharp(Buffer.from(svgEmpty, "utf8")).png().toBuffer();
  }

  const k = Math.max(0, Math.min(n - 1, Math.floor(focusLineIndex)));
  const a = Math.max(0, Math.min(1, Number(blendT) || 0));
  const boxes = riseformGradientBoxes(width, height);
  const idPrefix = `stg_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const defs = accentGradientDefs(idPrefix, boxes.chrome, boxes.liquid);

  const parts = [];
  for (let i = 0; i < n; i++) {
    const { pathD } = lines[i];
    const dAttr = svgPathDAttr(pathD);
    if (i < k) {
      parts.push(chromePathNoBorder(pathD, idPrefix));
    } else if (i > k) {
      parts.push(`<path d="${dAttr}" fill="#000000" fill-rule="evenodd" stroke="none"/>`);
    } else {
      const oBlack = (1 - a).toFixed(4);
      const oChrome = a.toFixed(4);
      parts.push(
        `<path d="${dAttr}" fill="#000000" fill-rule="evenodd" stroke="none" opacity="${oBlack}"/>`,
      );
      if (a > 0.0005) {
        parts.push(`<g opacity="${oChrome}">${chromePathNoBorder(pathD, idPrefix)}</g>`);
      }
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXmlAttr(background)}"/>
  ${defs}
  ${parts.join("\n")}
</svg>`;

  return sharp(Buffer.from(svg, "utf8")).png().toBuffer();
}
