import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { riseformGradientBoxes } from "./chrome-raster.mjs";
import { posterSerifFont, POSTER_BACKGROUND } from "./solid-typography-poster.mjs";
import { accentGradientDefs, chromePathNoBorder } from "./riseform-chrome-svg.mjs";

/** Lienzo de referencia para escalar la fuente como en `style-photo` perfil (512×512). */
const PROFILE_FONT_REF = 512;

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

function escapeXmlAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {import("opentype.js").Font} font
 * @param {string} text
 * @param {number} fs
 */
function lineBox(font, text, fs) {
  const path = font.getPath(text, 0, 0, fs, { kerning: true });
  return path.getBoundingBox();
}

/**
 * Mayor tamaño de una sola línea que cabe en el rectángulo.
 * @param {import("opentype.js").Font} font
 */
function maxFontSingleLine(font, text, maxW, maxH) {
  let lo = 4;
  let hi = Math.floor(Math.min(maxW, maxH) * 1.45);
  let best = 4;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const box = lineBox(font, text, mid);
    const w = box.x2 - box.x1;
    const h = box.y2 - box.y1;
    if (w <= maxW + 0.5 && h <= maxH + 0.5) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Una línea de texto Riseform (Playfair + Chrome/Liquid) sobre negro.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {"top"|"center"|"bottom"} [opts.verticalAlign="center"]
 * @param {number} [opts.fontScale=1] 0.35–1.35 relativo al máximo que cabe
 * @param {boolean} [opts.fontSizeProfileMatch] si true, el tamaño de fuente es el mismo que cabría en un perfil **512×512** (no cambia el ancho/alto del vídeo)
 * @param {import("opentype.js").Font} [opts.font]
 * @returns {Promise<Buffer>}
 */
export async function renderRiseformChromeLinePng(opts) {
  const text = typeof opts.text === "string" ? opts.text.trim() : "";
  const width = Math.max(32, Math.round(Number(opts.width) || 720));
  const height = Math.max(32, Math.round(Number(opts.height) || 1280));
  const verticalAlign =
    opts.verticalAlign === "top" || opts.verticalAlign === "bottom" ? opts.verticalAlign : "center";
  const fontScale =
    typeof opts.fontScale === "number" && opts.fontScale >= 0.25 && opts.fontScale <= 1.4
      ? opts.fontScale
      : 1;

  const shortSide = Math.min(width, height);
  const pad = Math.round(shortSide * 0.1);
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const font = opts.font || posterSerifFont;

  if (!text) {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${escapeXmlAttr(POSTER_BACKGROUND)}"/></svg>`;
    return sharp(Buffer.from(svg, "utf8")).png().toBuffer();
  }

  const profileMatch = opts.fontSizeProfileMatch === true;
  let fontSize;
  if (profileMatch) {
    const refPad = Math.round(PROFILE_FONT_REF * 0.1);
    const refInnerW = PROFILE_FONT_REF - 2 * refPad;
    const refInnerH = PROFILE_FONT_REF - 2 * refPad;
    const profileMaxFs = maxFontSingleLine(font, text, refInnerW, refInnerH);
    fontSize = Math.max(8, Math.round(profileMaxFs * fontScale));
    while (fontSize > 8 && measureLineWidth(font, text, fontSize) > innerW + 0.5) {
      fontSize -= 1;
    }
  } else {
    const maxFs = maxFontSingleLine(font, text, innerW, innerH);
    fontSize = Math.max(8, Math.round(maxFs * fontScale));
    while (fontSize > 8 && measureLineWidth(font, text, fontSize) > innerW + 0.5) {
      fontSize -= 1;
    }
  }

  const box = lineBox(font, text, fontSize);
  const lineHalfH = (box.y2 - box.y1) / 2;
  let cy;
  if (verticalAlign === "top") cy = pad + innerH * 0.2 + lineHalfH;
  else if (verticalAlign === "bottom") cy = height - pad - innerH * 0.2 - lineHalfH;
  else cy = height / 2;

  const d = pathDCentered(font, text, width / 2, cy, fontSize);
  const boxes = riseformGradientBoxes(width, height);
  const idPrefix = `ln_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const defs = accentGradientDefs(idPrefix, boxes.chrome, boxes.liquid);
  const pathMarkup = chromePathNoBorder(d, idPrefix);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXmlAttr(POSTER_BACKGROUND)}"/>
  ${defs}
  ${pathMarkup}
</svg>`;

  return sharp(Buffer.from(svg, "utf8")).png().toBuffer();
}
