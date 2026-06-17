import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderFractalBackgroundToFile, resolveFfmpegBinary } from "../../riseform/pipelines/fractal-background-video.mjs";
import { wrapWithBrandBookends } from "./brand-typewriter.mjs";
import {
  monoOverlayFontSizeCap,
  renderMonoWhiteTextOverlayPng,
  renderSolidTypographyPoster,
} from "../../riseform/pipelines/solid-typography-poster.mjs";

/** Formato largo horizontal 16:9 (YouTube / landscape). */
export const RISEFORM_COVER_ASPECT = { width: 1920, height: 1080 };

/** Formato vertical Reels / TikTok (9:16). */
export const SHORT_VERTICAL_ASPECT = { width: 1080, height: 1920 };

/** Fundido dissolve entre diapositivas (más suave que fade corto). */
const FADE_TARGET_SEC = 1.55;
const FADE_MIN_SEC = 1.0;
const FADE_MAX_SEC = 2.2;
const XFADE_TRANSITION = "dissolve";

function scaleFilter(w, h) {
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1,fps=30`;
}

function scaleFilterRgba(w, h) {
  return `scale=${w}:${h}:flags=lanczos,format=rgba,fps=30`;
}

/**
 * Duración del fundido según el segmento más corto (evita solapamientos inválidos).
 * @param {number[]} durationsSec
 */
export function computeScriptSegmentFadeSec(durationsSec) {
  if (durationsSec.length < 2) return 0;
  const minHold = Math.min(...durationsSec.map((d) => Math.max(0.5, Number(d) || 8)));
  let fade = Math.min(FADE_TARGET_SEC, minHold * 0.32);
  fade = Math.max(FADE_MIN_SEC, Math.min(FADE_MAX_SEC, fade));
  if (minHold < fade + 0.55) {
    fade = Math.max(0.65, (minHold - 0.4) * 0.72);
  }
  return Math.round(fade * 100) / 100;
}

/**
 * Duración real del MP4 tras fundidos entre planos.
 * @param {number[]} durationsSec
 * @param {number} fadeSec
 */
export function timelineDurationAfterFades(durationsSec, fadeSec) {
  const sum = durationsSec.reduce((a, d) => a + d, 0);
  if (durationsSec.length <= 1) return sum;
  return sum - (durationsSec.length - 1) * fadeSec;
}

/**
 * @param {Array<{ duration_sec?: number }>} segments
 */
export function computeScriptTimelineMeta(segments) {
  const durationsSec = segments.map((s) => Math.max(0.5, Number(s.duration_sec) || 12));
  let fadeSec = computeScriptSegmentFadeSec(durationsSec);
  if (durationsSec.length < 2) fadeSec = 0;
  const duration_sec = Math.round(timelineDurationAfterFades(durationsSec, fadeSec) * 10) / 10;
  return { durationsSec, fadeSec, duration_sec };
}

/**
 * @param {string} workDir
 * @param {number} holdSec
 * @param {string} ffmpegBin
 * @param {number} w
 * @param {number} h
 */
async function encodeSingleFrameMp4(workDir, holdSec, ffmpegBin, w, h) {
  const outPath = join(workDir, `out_single_${Date.now()}.mp4`);
  const vf = scaleFilter(w, h).replace(",fps=30", "");
  const args = [
    "-hide_banner",
    "-y",
    "-loop",
    "1",
    "-i",
    join(workDir, "f0.png"),
    "-t",
    String(Math.max(0.8, holdSec)),
    "-vf",
    vf,
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
  const run = spawnSync(ffmpegBin, args, { encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  if (run.error) throw new Error(run.error.message);
  if (run.status !== 0) {
    throw new Error(run.stderr?.slice(-2500) || "ffmpeg single frame failed");
  }
  return readFile(outPath);
}

/**
 * Cadena xfade (fade) con duración distinta por segmento.
 * @param {string} workDir
 * @param {number[]} durationsSec
 * @param {number} fadeSec
 * @param {string} ffmpegBin
 * @param {number} w
 * @param {number} h
 * @param {boolean} [rgba=false]
 */
async function encodeVariableDurationXfade(workDir, durationsSec, fadeSec, ffmpegBin, w, h, rgba = false) {
  const n = durationsSec.length;
  const scale = rgba ? scaleFilterRgba(w, h) : scaleFilter(w, h);
  const inputs = [];
  for (let i = 0; i < n; i++) {
    inputs.push("-loop", "1", "-t", String(durationsSec[i]), "-i", join(workDir, `f${i}.png`));
  }

  const scaled = [];
  for (let i = 0; i < n; i++) {
    scaled.push(`[${i}:v]${scale}[v${i}]`);
  }

  let chain = "v0";
  const xfadeParts = [];
  for (let i = 1; i < n; i++) {
    const outLabel = i === n - 1 ? "vout" : `vx${i}`;
    let offset = 0;
    for (let j = 0; j < i; j++) {
      offset += durationsSec[j];
    }
    offset -= i * fadeSec;
    offset = Math.max(0.05, offset);
    xfadeParts.push(
      `[${chain}][v${i}]xfade=transition=${XFADE_TRANSITION}:duration=${fadeSec}:offset=${offset}[${outLabel}]`,
    );
    chain = outLabel;
  }

  const filterComplex = [...scaled, ...xfadeParts].join(";");
  const outPath = join(workDir, `out_xfade_${Date.now()}.mp4`);
  const args = [
    "-hide_banner",
    "-y",
    ...inputs,
    "-filter_complex",
    filterComplex,
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
    rgba ? "yuva420p" : "yuv420p",
    "-movflags",
    "+faststart",
    outPath,
  ];
  const run = spawnSync(ffmpegBin, args, { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
  if (run.error) throw new Error(run.error.message);
  if (run.status !== 0) {
    throw new Error(run.stderr?.slice(-3000) || "ffmpeg xfade (guion) failed");
  }
  return readFile(outPath);
}

/**
 * Fractal de fondo + overlays de texto (PNG con alpha) en un solo paso ffmpeg.
 */
async function composeFractalWithTextOverlays(
  workDir,
  fractalPath,
  durationsSec,
  fadeSec,
  ffmpegBin,
  w,
  h,
  durationSec,
) {
  const n = durationsSec.length;
  const outPath = join(workDir, `out_fractal_comp_${Date.now()}.mp4`);
  const scale = scaleFilterRgba(w, h);
  const inputs = ["-i", fractalPath];
  for (let i = 0; i < n; i++) {
    inputs.push("-loop", "1", "-t", String(durationsSec[i]), "-i", join(workDir, `f${i}.png`));
  }

  const scaled = [];
  for (let i = 0; i < n; i++) {
    scaled.push(`[${i + 1}:v]${scale}[v${i}]`);
  }

  /** @type {string[]} */
  const filterParts = [...scaled];
  let textOut = "v0";
  if (n > 1) {
    let chain = "v0";
    for (let i = 1; i < n; i++) {
      const outLabel = i === n - 1 ? "vtext" : `vx${i}`;
      let offset = 0;
      for (let j = 0; j < i; j++) {
        offset += durationsSec[j];
      }
      offset -= i * fadeSec;
      offset = Math.max(0.05, offset);
      filterParts.push(
        `[${chain}][v${i}]xfade=transition=${XFADE_TRANSITION}:duration=${fadeSec}:offset=${offset}[${outLabel}]`,
      );
      chain = outLabel;
      textOut = outLabel;
    }
  }

  filterParts.push(`[0:v][${textOut}]overlay=0:0,format=yuv420p[vfinal]`);

  const args = [
    "-hide_banner",
    "-y",
    ...inputs,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vfinal]",
    "-t",
    String(Math.max(0.8, durationSec)),
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

  const run = spawnSync(ffmpegBin, args, { encoding: "utf8", maxBuffer: 120 * 1024 * 1024 });
  if (run.error) throw new Error(run.error.message);
  if (run.status !== 0) {
    throw new Error(run.stderr?.slice(-3500) || "ffmpeg fractal compose failed");
  }
  return readFile(outPath);
}

/**
 * Vídeo sin audio: cada segmento del guion = un plano con tipografía sobre fondo fractal.
 *
 * @param {object} opts
 * @param {Array<{ text: string; duration_sec: number }>} opts.segments
 * @param {number} [opts.width=1280]
 * @param {number} [opts.height=400]
 * @param {number} [opts.fade_sec] fundido entre bloques (opcional)
 * @param {string} [opts.background="fractal"] fractal | solid
 * @param {string} [opts.fractalBackgroundPath] MP4 precalculado (reutilizar entre ES/EN)
 * @param {number} [opts.fractalSeed]
 * @param {"fv"|"theme"} [opts.brandIntro] intro Fractal Voice (largo=fv, short=theme)
 * @param {string} [opts.themeTitle] título tal cual para intro vertical
 * @returns {Promise<{ mime: string; width: number; height: number; duration_sec: number; video_base64: string }>}
 */
export async function renderScriptCoverTimelineMp4(opts) {
  const segments = Array.isArray(opts.slides)
    ? opts.slides
    : Array.isArray(opts.segments)
      ? opts.segments
      : [];
  if (segments.length === 0) {
    throw new Error("slides/segments vacío");
  }

  const useFractal = opts.background !== "solid";

  const width = Math.max(320, Math.min(3840, Math.round(Number(opts.width) || RISEFORM_COVER_ASPECT.width)));
  const height = Math.max(120, Math.min(2160, Math.round(Number(opts.height) || RISEFORM_COVER_ASPECT.height)));

  const paddingRatio =
    typeof opts.paddingRatio === "number" && opts.paddingRatio > 0 && opts.paddingRatio < 0.35
      ? opts.paddingRatio
      : useFractal
        ? height > width
          ? 0.16
          : 0.12
        : 0.1;

  const ffmpegBin = resolveFfmpegBinary();
  const probe = spawnSync(ffmpegBin, ["-hide_banner", "-version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    throw new Error("ffmpeg no disponible (ffmpeg-static o ffmpeg en PATH)");
  }

  const fontSizeCap = monoOverlayFontSizeCap(width, height);
  let { durationsSec, fadeSec, duration_sec } = computeScriptTimelineMeta(segments);
  const brandIntro = opts.brandIntro === "fv" || opts.brandIntro === "theme" ? opts.brandIntro : null;

  const pngs = await Promise.all(
    segments.map((seg) => {
      const text = String(seg.text || "").trim();
      if (useFractal) {
        return renderMonoWhiteTextOverlayPng({
          text,
          width,
          height,
          paddingRatio,
          lineGapRatio: 0.18,
          fontSizeCap,
        });
      }
      return renderSolidTypographyPoster({
        text,
        width,
        height,
        paddingRatio,
        lineGapRatio: 0.2,
      });
    }),
  );

  const workDir = await mkdtemp(join(tmpdir(), "prueba-video-cover-"));
  try {
    await mkdir(workDir, { recursive: true });
    for (let i = 0; i < pngs.length; i++) {
      await writeFile(join(workDir, `f${i}.png`), pngs[i]);
    }

    let buf;
    if (useFractal) {
      let fractalPath = opts.fractalBackgroundPath;
      if (!fractalPath) {
        fractalPath = join(workDir, "fractal-bg.mp4");
        await renderFractalBackgroundToFile({
          width,
          height,
          durationSec: duration_sec,
          seed: typeof opts.fractalSeed === "number" ? opts.fractalSeed : Date.now(),
          outPath: fractalPath,
        });
      }
      buf = await composeFractalWithTextOverlays(
        workDir,
        fractalPath,
        durationsSec,
        fadeSec,
        ffmpegBin,
        width,
        height,
        duration_sec,
      );
      if (brandIntro) {
        const wrapped = await wrapWithBrandBookends(workDir, buf, {
          width,
          height,
          introKind: brandIntro,
          themeTitle: opts.themeTitle,
        });
        buf = wrapped.buffer;
        duration_sec = wrapped.duration_sec;
      }
    } else if (durationsSec.length === 1) {
      buf = await encodeSingleFrameMp4(workDir, durationsSec[0], ffmpegBin, width, height);
    } else {
      buf = await encodeVariableDurationXfade(workDir, durationsSec, fadeSec, ffmpegBin, width, height, false);
    }

    return {
      mime: "video/mp4",
      width,
      height,
      duration_sec,
      frame_count: pngs.length,
      transition: XFADE_TRANSITION,
      transition_fade_sec: fadeSec,
      background: useFractal ? "fractal_julia_chrome" : "#000000",
      text_style: useFractal ? "ibm_plex_mono_white_overlay" : "playfair_chrome_liquid_cover",
      brand_intro: brandIntro,
      brand_outro: brandIntro ? "fractal_voice_typewriter" : null,
      audio: false,
      video_base64: buf.toString("base64"),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
