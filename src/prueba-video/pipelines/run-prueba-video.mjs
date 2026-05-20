import { log } from "../../rnd-word/log.mjs";
import {
  DEFAULT_SCRIPT_DURATION_SEC,
  MAX_LONG_DURATION_SEC,
  MIN_LONG_DURATION_SEC,
  SHORT_SCRIPT_DURATION_SEC,
} from "../prompts/gemini-video-script.mjs";
import { generateVideoScriptWithGemini } from "./generate-script.mjs";
import {
  renderScriptCoverTimelineMp4,
  RISEFORM_COVER_ASPECT,
  SHORT_VERTICAL_ASPECT,
} from "./script-cover-video.mjs";

/** Vista previa: largo al mínimo del rango (2:45); short sigue ~30 s. */
export const PREVIEW_LONG_DURATION_SEC = MIN_LONG_DURATION_SEC;

/**
 * @param {object} opts
 * @param {string} opts.concept
 * @param {string} opts.geminiApiKey
 * @param {boolean} [opts.preview=false]
 * @param {number} [opts.longDurationSec]
 * @param {number} [opts.shortDurationSec]
 * @param {boolean} [opts.includeVideo=true]
 * @param {number} [opts.width] largo horizontal
 * @param {number} [opts.height] largo horizontal
 */
export async function runPruebaVideoGenerate(opts) {
  const concept = typeof opts.concept === "string" ? opts.concept.trim() : "";
  if (!concept) {
    throw new Error("concept no puede estar vacío");
  }

  let longDurationSec = DEFAULT_SCRIPT_DURATION_SEC;
  if (opts.preview === true) {
    longDurationSec = PREVIEW_LONG_DURATION_SEC;
  } else if (
    typeof opts.longDurationSec === "number" &&
    opts.longDurationSec >= MIN_LONG_DURATION_SEC &&
    opts.longDurationSec <= MAX_LONG_DURATION_SEC
  ) {
    longDurationSec = Math.round(opts.longDurationSec);
  }
  longDurationSec = Math.min(MAX_LONG_DURATION_SEC, Math.max(MIN_LONG_DURATION_SEC, longDurationSec));

  const shortDurationSec =
    typeof opts.shortDurationSec === "number" &&
    opts.shortDurationSec >= 15 &&
    opts.shortDurationSec <= 90
      ? Math.round(opts.shortDurationSec)
      : SHORT_SCRIPT_DURATION_SEC;

  const script = await generateVideoScriptWithGemini({
    concept,
    geminiApiKey: opts.geminiApiKey,
    longDurationSec,
    shortDurationSec,
  });

  /** @type {{ long: { es: null|object; en: null|object }; short: { es: null|object; en: null|object } }} */
  const videos = {
    long: { es: null, en: null },
    short: { es: null, en: null },
  };

  if (opts.includeVideo !== false) {
    const longW = opts.width ?? RISEFORM_COVER_ASPECT.width;
    const longH = opts.height ?? RISEFORM_COVER_ASPECT.height;
    const shortW = SHORT_VERTICAL_ASPECT.width;
    const shortH = SHORT_VERTICAL_ASPECT.height;

    log(
      `[prueba-video] render 4 MP4 | long=${script.slide_count} short=${script.short_slide_count} preview=${!!opts.preview}`,
    );

    const [longEs, longEn, shortEs, shortEn] = await Promise.all([
      renderScriptCoverTimelineMp4({
        segments: script.es.slides,
        width: longW,
        height: longH,
      }),
      renderScriptCoverTimelineMp4({
        segments: script.en.slides,
        width: longW,
        height: longH,
      }),
      renderScriptCoverTimelineMp4({
        segments: script.es.short_slides,
        width: shortW,
        height: shortH,
        paddingRatio: 0.14,
      }),
      renderScriptCoverTimelineMp4({
        segments: script.en.short_slides,
        width: shortW,
        height: shortH,
        paddingRatio: 0.14,
      }),
    ]);

    videos.long.es = { ...longEs, format: "horizontal", role: "long" };
    videos.long.en = { ...longEn, format: "horizontal", role: "long" };
    videos.short.es = { ...shortEs, format: "vertical_9_16", role: "short" };
    videos.short.en = { ...shortEn, format: "vertical_9_16", role: "short" };

    log(
      `[prueba-video] OK long es=${longEs.duration_sec}s en=${longEn.duration_sec}s | short es=${shortEs.duration_sec}s en=${shortEn.duration_sec}s`,
    );
  }

  return {
    concept,
    preview_mode: opts.preview === true,
    long_duration_target_sec: longDurationSec,
    min_long_duration_sec: MIN_LONG_DURATION_SEC,
    max_long_duration_sec: MAX_LONG_DURATION_SEC,
    short_duration_target_sec: shortDurationSec,
    script,
    videos,
  };
}
