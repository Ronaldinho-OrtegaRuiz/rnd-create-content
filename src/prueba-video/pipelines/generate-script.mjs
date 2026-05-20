import { log } from "../../rnd-word/log.mjs";
import { generateWithGemini } from "../../rnd-word/services/gemini-client.mjs";
import {
  buildGeminiVideoScriptPrompt,
  DEFAULT_SCRIPT_DURATION_SEC,
  MAX_LONG_DURATION_SEC,
  MAX_SHORT_DURATION_SEC,
  MIN_LONG_DURATION_SEC,
  MIN_SHORT_DURATION_SEC,
  SHORT_SCRIPT_DURATION_SEC,
} from "../prompts/gemini-video-script.mjs";

export const MIN_SEGMENT_DURATION_SEC = 10;
export const MAX_SEGMENT_DURATION_SEC = 28;
export const MAX_SCRIPT_SEGMENTS = 22;

/** Encabezados tipo lista que queremos evitar en pantalla. */
const BULLET_HEADING_RE =
  /^(ventajas|desaf[ií]os|aplicaciones|ejemplo|introducci[oó]n|conclusi[oó]n|beneficios|riesgos|pasos|resumen)\s*:/i;

export const MIN_SHORT_SLIDE_DURATION_SEC = 3;
export const MAX_SHORT_SLIDE_DURATION_SEC = 10;
export const MAX_SHORT_SLIDES = 8;

/**
 * @param {{ text: string; duration_sec: number }[]} slides
 * @param {number} targetSec
 * @param {number} minDur
 * @param {number} maxDur
 */
export function normalizeSlideDurations(slides, targetSec, minDur, maxDur) {
  if (slides.length === 0) return slides;
  let sum = slides.reduce((a, s) => a + s.duration_sec, 0);
  if (sum <= 0) {
    const even = targetSec / slides.length;
    return slides.map((s) => ({
      ...s,
      duration_sec: Math.max(minDur, Math.round(even * 10) / 10),
    }));
  }
  const scale = targetSec / sum;
  return slides.map((s) => {
    let d = s.duration_sec * scale;
    d = Math.max(minDur, Math.min(maxDur, d));
    return { ...s, duration_sec: Math.round(d * 10) / 10 };
  });
}

/**
 * Convierte texto de diapositiva a prosa legible (sin viñetas en \\n).
 * @param {string} text
 */
export function polishSlideText(text) {
  let t = String(text || "").trim();
  if (!t) return t;
  t = t.replace(/\r\n/g, "\n").replace(/\n+/g, " ");
  t = t.replace(/\s{2,}/g, " ");
  if (BULLET_HEADING_RE.test(t)) {
    t = t.replace(BULLET_HEADING_RE, "").trim();
    if (t.length > 0) {
      t = t.charAt(0).toUpperCase() + t.slice(1);
    }
  }
  return t;
}

/**
 * Escala duraciones hasta cumplir un mínimo total (p. ej. 3 min).
 * @param {{ duration_sec: number }[]} slides
 * @param {number} minTotalSec
 * @param {number} minDur
 * @param {number} maxDur
 */
export function ensureMinimumTotalDuration(slides, minTotalSec, minDur, maxDur) {
  if (slides.length === 0 || minTotalSec <= 0) return slides;

  const sum = (list) => list.reduce((a, s) => a + s.duration_sec, 0);
  let result = slides.map((s) => ({ ...s }));

  if (sum(result) >= minTotalSec) return result;

  let scale = minTotalSec / sum(result);
  result = result.map((s) => ({
    ...s,
    duration_sec:
      Math.round(Math.max(minDur, Math.min(maxDur, s.duration_sec * scale)) * 10) / 10,
  }));

  if (sum(result) < minTotalSec) {
    scale = minTotalSec / sum(result);
    result = result.map((s) => ({
      ...s,
      duration_sec: Math.round(Math.max(minDur, s.duration_sec * scale) * 10) / 10,
    }));
  }

  return result;
}

/**
 * Escala duraciones si el total supera el máximo (p. ej. 5 min).
 * @param {{ duration_sec: number }[]} slides
 * @param {number} maxTotalSec
 * @param {number} minDur
 * @param {number} maxDur
 */
export function ensureMaximumTotalDuration(slides, maxTotalSec, minDur, maxDur) {
  if (slides.length === 0 || maxTotalSec <= 0) return slides;

  const sum = (list) => list.reduce((a, s) => a + s.duration_sec, 0);
  let result = slides.map((s) => ({ ...s }));

  if (sum(result) <= maxTotalSec) return result;

  const scale = maxTotalSec / sum(result);
  result = result.map((s) => ({
    ...s,
    duration_sec:
      Math.round(Math.max(minDur, Math.min(maxDur, s.duration_sec * scale)) * 10) / 10,
  }));

  if (sum(result) > maxTotalSec) {
    const scale2 = maxTotalSec / sum(result);
    result = result.map((s) => ({
      ...s,
      duration_sec: Math.round(Math.max(minDur, s.duration_sec * scale2) * 10) / 10,
    }));
  }

  return result;
}

/**
 * Ajusta al rango [minTotal, maxTotal].
 * @param {{ duration_sec: number }[]} slides
 */
export function clampSlidesTotalDuration(slides, targetSec, minDur, maxDur, minTotalSec, maxTotalSec) {
  let out = normalizeSlideDurations(slides, targetSec, minDur, maxDur);
  if (minTotalSec > 0) out = ensureMinimumTotalDuration(out, minTotalSec, minDur, maxDur);
  if (maxTotalSec > 0) out = ensureMaximumTotalDuration(out, maxTotalSec, minDur, maxDur);
  return out;
}

/**
 * @param {unknown} rawList
 * @returns {Array<{ part: number; text: string; duration_sec: number }>}
 */
function extractRawSlides(rawList) {
  const arr = Array.isArray(rawList) ? rawList : [];
  return arr
    .map((slide, i) => {
      const text = String(slide?.text || "").trim();
      const duration_sec = Number(slide?.duration_sec ?? slide?.durationSec ?? slide?.duration);
      const part = Number(slide?.part ?? slide?.slide ?? i + 1);
      if (!text) return null;
      const polished = polishSlideText(text);
      if (!polished) return null;
      const d = Number.isFinite(duration_sec) && duration_sec > 0 ? duration_sec : 12;
      return { part: Number.isFinite(part) ? part : i + 1, text: polished, duration_sec: d };
    })
    .filter(Boolean);
}

/**
 * @param {unknown} langRaw
 * @param {"es"|"en"} language
 */
function parseLanguageScriptBlock(langRaw, language) {
  if (!langRaw || typeof langRaw !== "object") {
    throw new Error(`Falta scripts.${language} en la respuesta de Gemini`);
  }

  const title = String(langRaw.title || "").trim() || (language === "es" ? "Sin título" : "Untitled");
  const short_title =
    String(langRaw.short_title || langRaw.shortTitle || langRaw.title || "").trim() || title;

  const slidesRaw =
    langRaw.slides ?? langRaw.diapositivas ?? langRaw.segments ?? langRaw.parts ?? [];
  const shortRaw = langRaw.short_slides ?? langRaw.shortSlides ?? langRaw.short_segments ?? [];

  const slides = extractRawSlides(slidesRaw);
  const short_slides = extractRawSlides(shortRaw);

  if (slides.length === 0) {
    throw new Error(`scripts.${language}.slides vacío (se esperan diapositivas con text y duration_sec)`);
  }
  if (short_slides.length === 0) {
    throw new Error(`scripts.${language}.short_slides vacío (vídeo vertical ~30 s)`);
  }

  return { title, short_title, slides, short_slides };
}

/**
 * @param {Array<{ part: number; text: string; duration_sec: number }>} slides
 * @param {number} targetSec
 * @param {number} minDur
 * @param {number} maxDur
 */
/**
 * @param {Array<{ part: number; text: string; duration_sec: number }>} slides
 * @param {number} targetSec
 * @param {number} minDur
 * @param {number} maxDur
 * @param {number} [minTotalSec]
 * @param {number} [maxTotalSec]
 */
function finalizeSlides(slides, targetSec, minDur, maxDur, minTotalSec = 0, maxTotalSec = 0) {
  const normalized = clampSlidesTotalDuration(
    slides,
    targetSec,
    minDur,
    maxDur,
    minTotalSec,
    maxTotalSec,
  );
  return normalized.map((s, i) => ({
    part: slides[i]?.part ?? i + 1,
    index: i,
    text: s.text,
    duration_sec: s.duration_sec,
  }));
}

/**
 * @param {unknown} raw
 * @param {{ longDurationSec: number; shortDurationSec: number; minLongDurationSec: number; maxLongDurationSec: number; minShortDurationSec: number; maxShortDurationSec: number }} targets
 */
export function parseGeminiBilingualVideoScript(raw, targets) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Gemini devolvió un objeto inválido");
  }

  const concept_summary = String(raw.concept_summary || raw.conceptSummary || "").trim();
  const scriptsRoot = raw.scripts && typeof raw.scripts === "object" ? raw.scripts : null;
  if (!scriptsRoot) {
    throw new Error("Gemini debe devolver scripts.es y scripts.en con slides y short_slides");
  }

  const esBlock = parseLanguageScriptBlock(scriptsRoot.es, "es");
  const enBlock = parseLanguageScriptBlock(scriptsRoot.en, "en");

  if (esBlock.slides.length !== enBlock.slides.length) {
    throw new Error(
      `slides: ES y EN deben tener el mismo número de partes (es=${esBlock.slides.length}, en=${enBlock.slides.length})`,
    );
  }
  if (esBlock.short_slides.length !== enBlock.short_slides.length) {
    throw new Error(
      `short_slides: ES y EN deben coincidir (es=${esBlock.short_slides.length}, en=${enBlock.short_slides.length})`,
    );
  }
  if (esBlock.slides.length > MAX_SCRIPT_SEGMENTS) {
    throw new Error(`Demasiadas diapositivas (${esBlock.slides.length}); máximo ${MAX_SCRIPT_SEGMENTS}`);
  }
  if (esBlock.short_slides.length > MAX_SHORT_SLIDES) {
    throw new Error(`Demasiadas short_slides (${esBlock.short_slides.length}); máximo ${MAX_SHORT_SLIDES}`);
  }

  for (const block of [esBlock, enBlock]) {
    for (const s of [...block.slides, ...block.short_slides]) {
      if (BULLET_HEADING_RE.test(s.text)) {
        log(`[prueba-video/script] aviso: texto tipo lista corregido | ${s.text.slice(0, 48)}…`);
      }
    }
  }

  const esSlides = finalizeSlides(
    esBlock.slides,
    targets.longDurationSec,
    MIN_SEGMENT_DURATION_SEC,
    MAX_SEGMENT_DURATION_SEC,
    targets.minLongDurationSec,
    targets.maxLongDurationSec,
  );

  const enSlides = enBlock.slides.map((seg, i) => ({
    part: seg.part ?? i + 1,
    index: i,
    text: seg.text,
    duration_sec: esSlides[i].duration_sec,
  }));

  const esShort = finalizeSlides(
    esBlock.short_slides,
    targets.shortDurationSec,
    MIN_SHORT_SLIDE_DURATION_SEC,
    MAX_SHORT_SLIDE_DURATION_SEC,
    targets.minShortDurationSec,
    targets.maxShortDurationSec,
  );

  const enShort = enBlock.short_slides.map((seg, i) => ({
    part: seg.part ?? i + 1,
    index: i,
    text: seg.text,
    duration_sec: esShort[i].duration_sec,
  }));

  const long_total_sec =
    Math.round(esSlides.reduce((a, s) => a + s.duration_sec, 0) * 10) / 10;
  const short_total_sec =
    Math.round(esShort.reduce((a, s) => a + s.duration_sec, 0) * 10) / 10;

  function langPack(language, block, slides, shortSlides, totalLong, totalShort) {
    return {
      title: block.title,
      short_title: block.short_title,
      language,
      slides,
      short_slides: shortSlides,
      segments: slides,
      short_segments: shortSlides,
      slide_count: slides.length,
      short_slide_count: shortSlides.length,
      total_duration_sec: totalLong,
      short_total_duration_sec: totalShort,
      duration_target_sec: targets.longDurationSec,
      short_duration_target_sec: targets.shortDurationSec,
    };
  }

  return {
    concept_summary,
    format: "slides",
    long_duration_target_sec: targets.longDurationSec,
    min_long_duration_sec: targets.minLongDurationSec,
    max_long_duration_sec: targets.maxLongDurationSec,
    short_duration_target_sec: targets.shortDurationSec,
    min_short_duration_sec: targets.minShortDurationSec,
    max_short_duration_sec: targets.maxShortDurationSec,
    slide_count: esSlides.length,
    short_slide_count: esShort.length,
    total_duration_sec: long_total_sec,
    short_total_duration_sec: short_total_sec,
    segment_count: esSlides.length,
    es: langPack("es", esBlock, esSlides, esShort, long_total_sec, short_total_sec),
    en: langPack("en", enBlock, enSlides, enShort, long_total_sec, short_total_sec),
  };
}

/**
 * @param {object} opts
 * @param {string} opts.concept
 * @param {string} opts.geminiApiKey
 * @param {number} [opts.longDurationSec]
 * @param {number} [opts.shortDurationSec]
 */
export async function generateVideoScriptWithGemini(opts) {
  const concept = typeof opts.concept === "string" ? opts.concept.trim() : "";
  if (!concept) {
    throw new Error("concept no puede estar vacío");
  }

  let longDurationSec =
    typeof opts.longDurationSec === "number" &&
    opts.longDurationSec >= MIN_LONG_DURATION_SEC &&
    opts.longDurationSec <= MAX_LONG_DURATION_SEC
      ? Math.round(opts.longDurationSec)
      : DEFAULT_SCRIPT_DURATION_SEC;
  longDurationSec = Math.min(MAX_LONG_DURATION_SEC, Math.max(MIN_LONG_DURATION_SEC, longDurationSec));

  const shortDurationSec =
    typeof opts.shortDurationSec === "number" &&
    opts.shortDurationSec >= MIN_SHORT_DURATION_SEC &&
    opts.shortDurationSec <= MAX_SHORT_DURATION_SEC
      ? Math.round(opts.shortDurationSec)
      : SHORT_SCRIPT_DURATION_SEC;

  const prompt = buildGeminiVideoScriptPrompt({
    concept,
    longDurationSec,
    shortDurationSec,
  });

  log(
    `[prueba-video/script] Gemini | concept_chars=${concept.length} long=${longDurationSec}s short=${shortDurationSec}s slides es+en`,
  );

  const raw = await generateWithGemini({
    apiKey: opts.geminiApiKey,
    prompt,
  });

  const script = parseGeminiBilingualVideoScript(raw, {
    longDurationSec,
    shortDurationSec,
    minLongDurationSec: MIN_LONG_DURATION_SEC,
    maxLongDurationSec: MAX_LONG_DURATION_SEC,
    minShortDurationSec: MIN_SHORT_DURATION_SEC,
    maxShortDurationSec: MAX_SHORT_DURATION_SEC,
  });

  if (script.total_duration_sec < MIN_LONG_DURATION_SEC) {
    throw new Error(
      `Guion largo: ${script.total_duration_sec}s — mínimo ${MIN_LONG_DURATION_SEC}s (2:45)`,
    );
  }
  if (script.total_duration_sec > MAX_LONG_DURATION_SEC) {
    throw new Error(
      `Guion largo: ${script.total_duration_sec}s — máximo ${MAX_LONG_DURATION_SEC}s (5:00)`,
    );
  }
  if (script.short_total_duration_sec < MIN_SHORT_DURATION_SEC) {
    throw new Error(
      `Guion short: ${script.short_total_duration_sec}s — mínimo ${MIN_SHORT_DURATION_SEC}s`,
    );
  }
  if (script.short_total_duration_sec > MAX_SHORT_DURATION_SEC) {
    throw new Error(
      `Guion short: ${script.short_total_duration_sec}s — máximo ${MAX_SHORT_DURATION_SEC}s`,
    );
  }

  log(
    `[prueba-video/script] OK | slides=${script.slide_count} long=${script.total_duration_sec}s (${MIN_LONG_DURATION_SEC}–${MAX_LONG_DURATION_SEC}) short=${script.short_total_duration_sec}s (${MIN_SHORT_DURATION_SEC}–${MAX_SHORT_DURATION_SEC})`,
  );
  return script;
}
