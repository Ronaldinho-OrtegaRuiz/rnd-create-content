import sharp from "sharp";
import { composeChromeCanvas, cornerAverageRgb } from "./chrome-raster.mjs";
import {
  ocrWordsFromPng,
  filterOcrWords,
  eraseNonBgInBoxes,
  compositeRetypeLayers,
} from "./photo-retype.mjs";

/** Mismos formatos que Riseform estático (generate-images). */
export const RISEFORM_STYLE_PRESETS = {
  profile: { width: 512, height: 512 },
  cover: { width: 1280, height: 400 },
};

/**
 * @param {string|undefined} hex ej. "#000000" o "#f5f0e8"
 * @returns {{ r: number; g: number; b: number; alpha: number }}
 */
export function parseHexBackground(hex) {
  if (!hex || typeof hex !== "string") {
    return { r: 0, g: 0, b: 0, alpha: 1 };
  }
  const m = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) {
    return { r: 0, g: 0, b: 0, alpha: 1 };
  }
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };
}

/**
 * @param {Buffer} inputBuffer
 * @param {{
 *   preset: keyof typeof RISEFORM_STYLE_PRESETS;
 *   background?: string;
 *   style?: "pad" | "chrome"; por defecto `chrome` (gradiente Riseform); usa `pad` solo si lo pasas explícitamente.
 *   tolerance?: number;
 *   refont?: boolean;
 * }} opts
 * - `pad`: encajar + bandas (comportamiento anterior).
 * - `chrome`: estima color de fondo por esquinas; píxeles similares → color de lienzo; resto → gradiente Riseform (como profile/cover estáticos). Funciona bien con fondo plano (blanco, etc.); fotos con fondo complejo: mejor `pad`.
 * - `refont`: OCR + borra texto detectado en la zona y lo redibuja con Playfair Display y el mismo relleno Chrome/Liquid que riseform_profile / riseform_cover (mejor con texto claro sobre fondo uniforme).
 * @returns {Promise<{ png: Buffer; retypeBlocks: number }>}
 */
export async function stylePhotoToRiseformCanvas(inputBuffer, opts) {
  const preset = opts?.preset === "cover" ? "cover" : "profile";
  const { width, height } = RISEFORM_STYLE_PRESETS[preset];
  const bg = parseHexBackground(opts?.background);
  const style = opts?.style === "pad" ? "pad" : "chrome";
  const refont = opts?.refont === true;
  const tolRaw = opts?.tolerance;
  const tolerance =
    typeof tolRaw === "number" && Number.isFinite(tolRaw) && tolRaw >= 0 && tolRaw <= 120
      ? tolRaw
      : 48;

  const {
    data: imgRawIn,
    info,
  } = await sharp(inputBuffer)
    .rotate()
    .resize({
      width,
      height,
      fit: "inside",
      withoutEnlargement: false,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const iw = info.width;
  const ih = info.height;
  const padTop = Math.floor((height - ih) / 2);
  const padBottom = height - ih - padTop;
  const padLeft = Math.floor((width - iw) / 2);
  const padRight = width - iw - padLeft;

  let workRaw = imgRawIn;
  /** @type {ReturnType<typeof filterOcrWords>} */
  let retypeWords = [];

  if (refont) {
    const ocrPng = await sharp(imgRawIn, {
      raw: { width: iw, height: ih, channels: 4 },
    })
      .png()
      .toBuffer();
    retypeWords = filterOcrWords(await ocrWordsFromPng(ocrPng));
    if (retypeWords.length > 0) {
      workRaw = Buffer.from(imgRawIn);
      const bgRef = cornerAverageRgb(workRaw, iw, ih, 4);
      eraseNonBgInBoxes(
        workRaw,
        iw,
        ih,
        retypeWords.map((w) => w.bbox),
        bgRef,
        tolerance,
      );
    }
  }

  if (style === "pad") {
    let png = await sharp(workRaw, {
      raw: { width: iw, height: ih, channels: 4 },
    })
      .png()
      .toBuffer();

    png = await sharp(png)
      .extend({
        top: padTop,
        bottom: padBottom,
        left: padLeft,
        right: padRight,
        background: bg,
      })
      .png()
      .toBuffer();

    if (refont && retypeWords.length > 0) {
      png = await compositeRetypeLayers(png, retypeWords, padLeft, padTop, iw, ih, width, height);
    }
    return { png, retypeBlocks: retypeWords.length };
  }

  const canvasBuf = composeChromeCanvas(
    width,
    height,
    padLeft,
    padTop,
    workRaw,
    iw,
    ih,
    { r: bg.r, g: bg.g, b: bg.b },
    tolerance,
  );

  let png = await sharp(canvasBuf, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  if (refont && retypeWords.length > 0) {
    png = await compositeRetypeLayers(png, retypeWords, padLeft, padTop, iw, ih, width, height);
  }

  return { png, retypeBlocks: retypeWords.length };
}
