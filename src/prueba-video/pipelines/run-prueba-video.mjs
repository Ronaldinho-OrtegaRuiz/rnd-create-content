import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { log } from "../../rnd-word/log.mjs";
import { renderFractalBackgroundToFile } from "../../riseform/pipelines/fractal-background-video.mjs";
import {
  DEFAULT_SCRIPT_DURATION_SEC,
  MAX_LONG_DURATION_SEC,
  MIN_LONG_DURATION_SEC,
  SHORT_SCRIPT_DURATION_SEC,
} from "../prompts/gemini-video-script.mjs";
import { generateVideoScriptWithGemini } from "./generate-script.mjs";
import {
  computeScriptTimelineMeta,
  renderScriptCoverTimelineMp4,
  RISEFORM_COVER_ASPECT,
  SHORT_VERTICAL_ASPECT,
} from "./script-cover-video.mjs";
import { attachLofiToVideo, deriveLofiParams } from "./lofi-tone-generator.mjs";

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
 * @param {boolean} [opts.includeLofi=true]
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

    const longMeta = computeScriptTimelineMeta(script.es.slides);
    const shortMeta = computeScriptTimelineMeta(script.es.short_slides);
    const fractalSeed = Date.now();

    log(
      `[prueba-video] render 4 MP4 | long=${script.slide_count} (${longMeta.duration_sec}s) short=${script.short_slide_count} (${shortMeta.duration_sec}s) preview=${!!opts.preview}`,
    );

    const fractalWork = await mkdtemp(join(tmpdir(), "prueba-video-fractal-"));
    const longFractalPath = join(fractalWork, "fractal-long.mp4");
    const shortFractalPath = join(fractalWork, "fractal-short.mp4");

    try {
      log("[prueba-video] fractal fondo largo…");
      await renderFractalBackgroundToFile({
        width: longW,
        height: longH,
        durationSec: longMeta.duration_sec,
        seed: fractalSeed,
        outPath: longFractalPath,
        onProgress: (m) => log(`[prueba-video] fractal largo ${m}`),
      });

      log("[prueba-video] fractal fondo short…");
      await renderFractalBackgroundToFile({
        width: shortW,
        height: shortH,
        durationSec: shortMeta.duration_sec,
        seed: fractalSeed + 1,
        outPath: shortFractalPath,
        onProgress: (m) => log(`[prueba-video] fractal short ${m}`),
      });

      log("[prueba-video] composición intro + fractal + outro (4 vídeos)…");

      const [longEs, longEn, shortEs, shortEn] = await Promise.all([
        renderScriptCoverTimelineMp4({
          segments: script.es.slides,
          width: longW,
          height: longH,
          background: "fractal",
          fractalBackgroundPath: longFractalPath,
          fractalSeed,
          brandIntro: "fv",
        }),
        renderScriptCoverTimelineMp4({
          segments: script.en.slides,
          width: longW,
          height: longH,
          background: "fractal",
          fractalBackgroundPath: longFractalPath,
          fractalSeed,
          brandIntro: "fv",
        }),
        renderScriptCoverTimelineMp4({
          segments: script.es.short_slides,
          width: shortW,
          height: shortH,
          paddingRatio: 0.16,
          background: "fractal",
          fractalBackgroundPath: shortFractalPath,
          fractalSeed: fractalSeed + 1,
          brandIntro: "theme",
          themeTitle: script.es.short_title,
        }),
        renderScriptCoverTimelineMp4({
          segments: script.en.short_slides,
          width: shortW,
          height: shortH,
          paddingRatio: 0.16,
          background: "fractal",
          fractalBackgroundPath: shortFractalPath,
          fractalSeed: fractalSeed + 1,
          brandIntro: "theme",
          themeTitle: script.en.short_title,
        }),
      ]);

      videos.long.es = { ...longEs, format: "horizontal", role: "long" };
      videos.long.en = { ...longEn, format: "horizontal", role: "long" };
      videos.short.es = { ...shortEs, format: "vertical_9_16", role: "short" };
      videos.short.en = { ...shortEn, format: "vertical_9_16", role: "short" };

      if (opts.includeLofi !== false) {
        const lofiWork = await mkdtemp(join(tmpdir(), "prueba-video-lofi-"));
        try {
          log("[prueba-video] lofi procedural + mux (4 vídeos)…");
          const longSeed = deriveLofiParams(`${concept}|long`).seed;
          const shortSeed = deriveLofiParams(`${concept}|short`).seed;

          /** @type {Array<{ bucket: "long"|"short"; lang: "es"|"en"; label: string; introKind: "fv"|"theme"; themeTitle?: string; seed: number }>} */
          const lofiJobs = [
            { bucket: "long", lang: "es", label: "1/4 largo ES", introKind: "fv", seed: longSeed },
            { bucket: "long", lang: "en", label: "2/4 largo EN", introKind: "fv", seed: longSeed + 1 },
            {
              bucket: "short",
              lang: "es",
              label: "3/4 short ES",
              introKind: "theme",
              themeTitle: script.es.short_title,
              seed: shortSeed,
            },
            {
              bucket: "short",
              lang: "en",
              label: "4/4 short EN",
              introKind: "theme",
              themeTitle: script.en.short_title,
              seed: shortSeed + 1,
            },
          ];

          for (const job of lofiJobs) {
            const video = videos[job.bucket][job.lang];
            log(
              `[prueba-video] lofi ${job.label} | ${video.duration_sec}s | seed=${job.seed}`,
            );
            const mp4 = Buffer.from(video.video_base64, "base64");
            const { buffer, lofi_params, audio_fades } = await attachLofiToVideo({
              videoMp4: mp4,
              durationSec: video.duration_sec,
              concept,
              seed: job.seed,
              introKind: job.introKind,
              themeTitle: job.themeTitle,
              workDir: join(lofiWork, `${job.bucket}-${job.lang}-${job.seed}`),
              label: job.label,
            });
            videos[job.bucket][job.lang] = {
              ...video,
              audio: true,
              audio_style: "procedural_lofi",
              lofi_params,
              audio_fades,
              video_base64: buffer.toString("base64"),
            };
          }
        } finally {
          await rm(lofiWork, { recursive: true, force: true }).catch(() => {});
        }
      }

      log(
        `[prueba-video] OK long es=${videos.long.es.duration_sec}s en=${videos.long.en.duration_sec}s | short es=${videos.short.es.duration_sec}s en=${videos.short.en.duration_sec}s | lofi=${opts.includeLofi !== false}`,
      );
    } finally {
      await rm(fractalWork, { recursive: true, force: true }).catch(() => {});
    }
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
