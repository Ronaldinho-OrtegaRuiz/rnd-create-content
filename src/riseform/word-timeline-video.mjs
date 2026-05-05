import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import ffmpegStatic from "ffmpeg-static";
import { renderRiseformChromeLinePng } from "./riseform-line-frame.mjs";
import {
  computeRiseformPosterStackLayout,
  renderRiseformStagedBlackToChromeFrame,
} from "./solid-typography-poster.mjs";

/**
 * @typedef {"frames"|"staged"|"groups"} RiseformWordVideoMode
 * Palabra a palabra (frames), ritmo arriba/centro/abajo (staged), o bloques (groups).
 */

/** Segundos base por segmento antes de multiplicar por `speed` del preset. */
const BASE_HOLD_SEC = 0.72;

/** Negro al inicio y al final de cada MP4 (concat con lavfi). */
const BLACK_LEADER_TRAILER_SEC = 1;

/** Pasos por línea en modo staged (negro → cromo); más = transición más suave. */
const STAGED_BLEND_STEPS = 8;

/**
 * Presets de transición + ritmo (mismo vídeo lógico, varias salidas MP4).
 * `speed` alarga o acorta el tiempo en pantalla de cada segmento (1 = neutro).
 */
export const RISEFORM_WORD_VIDEO_PRESETS = {
  smooth: { transition: "fade", speed: 1.0 },
  fast: { transition: "cut", speed: 0.6 },
  flow: { transition: "slide", speed: 0.9 },
  impact: { transition: "zoom", speed: 0.8 },
  calm: { transition: "fade", speed: 1.4 },
};

function resolveFfmpegBinary() {
  if (typeof ffmpegStatic === "string" && ffmpegStatic.length > 0 && existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return "ffmpeg";
}

/**
 * @param {string} kind fade | slide | zoom
 */
function xfadeTransitionName(kind) {
  if (kind === "slide") return "slideright";
  if (kind === "zoom") return "zoomin";
  return "fade";
}

function splitWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/**
 * @param {string[]} words
 * @returns {string[]}
 */
function defaultPhraseGroups(words) {
  if (words.length === 0) return [];
  if (words.length === 1) return [words[0]];
  if (words.length === 2) return [words[0], words[1]];
  return [words[0], words.slice(1, -1).join(" "), words[words.length - 1]];
}

/**
 * @param {string[]} words
 * @param {unknown} rawGroups
 * @returns {string[]}
 */
function resolveGroupStrings(words, rawGroups) {
  if (Array.isArray(rawGroups) && rawGroups.length > 0) {
    const g = rawGroups
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean);
    if (g.length) return g;
  }
  const joined = words.join(" ");
  if (/[,;]/.test(joined)) {
    return joined
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return defaultPhraseGroups(words);
}

/**
 * @param {number} index
 * @returns {{ verticalAlign: "top"|"center"|"bottom"; fontScale: number }}
 */
function stagedLayout(index) {
  const r = index % 3;
  if (r === 0) return { verticalAlign: "top", fontScale: 1.02 };
  if (r === 1) return { verticalAlign: "center", fontScale: 0.68 };
  return { verticalAlign: "bottom", fontScale: 1.08 };
}

/**
 * @param {RiseformWordVideoMode} mode
 * @param {string} text
 * @param {unknown} rawGroups
 * @returns {string[]}
 */
export function buildWordTimelineSegments(mode, text, rawGroups) {
  const words = splitWords(text);
  if (words.length === 0) return [];
  if (mode === "groups") return resolveGroupStrings(words, rawGroups);
  return words;
}

/**
 * @param {RiseformWordVideoMode} mode
 * @param {string[]} segments
 */
function frameSpecsForSegments(mode, segments) {
  if (mode === "frames") {
    return segments.map((t) => ({
      text: t,
      verticalAlign: /** @type {const} */ ("center"),
      fontScale: 1,
    }));
  }
  return segments.map((t, i) => {
    const { verticalAlign, fontScale } = stagedLayout(i);
    return { text: t, verticalAlign, fontScale };
  });
}

function scaleFilter(w, h) {
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1,fps=30`;
}

/**
 * @param {string} workDir
 * @param {number} n
 * @param {number} holdSec
 * @param {string} ffmpegBin
 * @param {number} w
 * @param {number} h
 */
async function encodeCutConcat(workDir, n, holdSec, ffmpegBin, w, h) {
  const abs = (i) => resolve(join(workDir, `f${i}.png`)).replace(/\\/g, "/");
  let list = "";
  for (let i = 0; i < n; i++) {
    list += `file '${abs(i)}'\n`;
    list += `duration ${holdSec}\n`;
  }
  list += `file '${abs(n - 1)}'\n`;
  await writeFile(join(workDir, "concat.txt"), list, "utf8");
  const vf = `${scaleFilter(w, h)}`;
  const outPath = join(workDir, `out_cut_${Date.now()}.mp4`);
  const args = [
    "-hide_banner",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    join(workDir, "concat.txt"),
    "-vf",
    vf,
    "-vsync",
    "vfr",
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
  const run = spawnSync(ffmpegBin, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (run.error) throw new Error(run.error.message);
  if (run.status !== 0) {
    throw new Error(run.stderr?.slice(-2000) || "ffmpeg concat failed");
  }
  return readFile(outPath);
}

/**
 * @param {string} workDir
 * @param {number} n
 * @param {number} holdSec
 * @param {number} transDur
 * @param {string} transName
 * @param {string} ffmpegBin
 * @param {number} w
 * @param {number} h
 */
/**
 * Primer enlace xfade siempre `fade`; el resto usa el tipo del preset (slide/zoom/fade…).
 * @param {{ transition: string }} preset
 */
async function encodeXfadeChain(workDir, n, holdSec, transDur, preset, ffmpegBin, w, h) {
  const scale = scaleFilter(w, h);
  const inputs = [];
  for (let i = 0; i < n; i++) {
    inputs.push("-loop", "1", "-t", String(holdSec), "-i", join(workDir, `f${i}.png`));
  }

  const scaled = [];
  for (let i = 0; i < n; i++) {
    scaled.push(`[${i}:v]${scale}[v${i}]`);
  }

  let chain = "v0";
  const xfadeParts = [];
  for (let i = 1; i < n; i++) {
    const outLabel = i === n - 1 ? "vout" : `vx${i}`;
    const offset = i * (holdSec - transDur);
    const transName = i === 1 ? "fade" : xfadeTransitionName(preset.transition);
    xfadeParts.push(`[${chain}][v${i}]xfade=transition=${transName}:duration=${transDur}:offset=${offset}[${outLabel}]`);
    chain = outLabel;
  }

  const filterComplex = [...scaled, ...xfadeParts].join(";");
  const outPath = join(workDir, `out_xf_${Date.now()}.mp4`);
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
    "yuv420p",
    "-movflags",
    "+faststart",
    outPath,
  ];
  const run = spawnSync(ffmpegBin, args, { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  if (run.error) throw new Error(run.error.message);
  if (run.status !== 0) {
    throw new Error(run.stderr?.slice(-2500) || "ffmpeg xfade failed");
  }
  return readFile(outPath);
}

/**
 * Añade `sec` de negro al inicio y al final del MP4 (misma resolución).
 * @param {Buffer} innerMp4
 */
async function padMp4BlackEnds(innerMp4, w, h, sec, workDir, ffmpegBin) {
  if (sec <= 0) return innerMp4;
  const innerPath = join(workDir, `inner_pad_${Date.now()}.mp4`);
  const outPath = join(workDir, `out_padded_${Date.now()}.mp4`);
  await writeFile(innerPath, innerMp4);
  const colorIn = `color=c=black:s=${w}x${h}:d=${sec}:r=30`;
  const args = [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    colorIn,
    "-i",
    innerPath,
    "-f",
    "lavfi",
    "-i",
    colorIn,
    "-filter_complex",
    "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
    "-map",
    "[v]",
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
  await rm(innerPath, { force: true }).catch(() => {});
  if (run.error) throw new Error(run.error.message);
  if (run.status !== 0) {
    throw new Error(run.stderr?.slice(-2500) || "ffmpeg pad black ends failed");
  }
  const buf = await readFile(outPath);
  await rm(outPath, { force: true }).catch(() => {});
  return buf;
}

/**
 * @param {string} workDir
 * @param {number} n
 * @param {{ transition: string; speed: number }} preset
 * @param {number} w
 * @param {number} h
 * @param {string} ffmpegBin
 * @param {{ stagedBlendSteps?: number }} [encodeOpts]
 */
async function encodeOneMp4(workDir, n, preset, w, h, ffmpegBin, encodeOpts = {}) {
  const stagedSteps =
    typeof encodeOpts.stagedBlendSteps === "number" && encodeOpts.stagedBlendSteps > 1
      ? Math.min(24, Math.round(encodeOpts.stagedBlendSteps))
      : 1;
  const baseBeat = BASE_HOLD_SEC * preset.speed;
  const hold =
    stagedSteps > 1
      ? Math.max(0.05, baseBeat / stagedSteps)
      : Math.max(0.22, baseBeat);

  /** @type {Buffer} */
  let innerBuf;

  if (n === 1) {
    const outPath = join(workDir, `out_single_${Date.now()}.mp4`);
    const vf = scaleFilter(w, h).replace(",fps=30", "");
    const dur = Math.max(1.4, hold * 2.2);
    const args = [
      "-hide_banner",
      "-y",
      "-loop",
      "1",
      "-i",
      join(workDir, "f0.png"),
      "-t",
      String(dur),
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
    const run = spawnSync(ffmpegBin, args, { encoding: "utf8", maxBuffer: 15 * 1024 * 1024 });
    if (run.error) throw new Error(run.error.message);
    if (run.status !== 0) throw new Error(run.stderr?.slice(-2000) || "ffmpeg single frame failed");
    innerBuf = await readFile(outPath);
    await rm(outPath, { force: true }).catch(() => {});
  } else if (preset.transition === "cut") {
    innerBuf = await encodeCutConcat(workDir, n, hold, ffmpegBin, w, h);
  } else {
    let transDur = Math.min(0.48, hold * 0.42);
    if (hold - transDur < 0.1) transDur = Math.max(0.04, hold * 0.32);
    if (transDur >= hold * 0.88) transDur = Math.max(0.03, hold * 0.38);
    innerBuf = await encodeXfadeChain(workDir, n, hold, transDur, preset, ffmpegBin, w, h);
  }

  return padMp4BlackEnds(innerBuf, w, h, BLACK_LEADER_TRAILER_SEC, workDir, ffmpegBin);
}

const MAX_SEGMENTS = 22;
const MAX_PRESETS = 6;

/**
 * Genera varios MP4 (mismo modo y texto, un archivo por preset) con fondo negro y tipografía Riseform.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {RiseformWordVideoMode} [opts.video_mode="frames"] frames = una palabra por plano centrada; staged = **póster acumulativo** (líneas de arriba abajo, se van sumando); groups = frases (coma o grupos explícitos)
 * @param {string[]} [opts.presets] claves de {@link RISEFORM_WORD_VIDEO_PRESETS}; por defecto todas
 * @param {string[]} [opts.groups] solo video_mode groups
 * @param {number} [opts.width=1080]
 * @param {number} [opts.height=1920]
 * @returns {Promise<{ video_mode: RiseformWordVideoMode; segments: string[]; videos: Array<{ preset: string; transition: string; speed: number; mime: string; video_base64: string }> }>}
 */
export async function renderRiseformWordTimelineVideos(opts) {
  const text = typeof opts.text === "string" ? opts.text.trim() : "";
  if (!text) {
    throw new Error("text no puede estar vacío");
  }

  const video_mode =
    opts.video_mode === "staged" || opts.video_mode === "groups" ? opts.video_mode : "frames";

  const segments = buildWordTimelineSegments(video_mode, text, opts.groups);
  if (segments.length === 0) {
    throw new Error("No hay segmentos (texto sin palabras)");
  }
  if (segments.length > MAX_SEGMENTS) {
    throw new Error(`Máximo ${MAX_SEGMENTS} segmentos (palabras o grupos)`);
  }

  const width = Math.max(64, Math.min(1920, Math.round(Number(opts.width) || 1080)));
  const height = Math.max(64, Math.min(1920, Math.round(Number(opts.height) || 1920)));

  const allKeys = Object.keys(RISEFORM_WORD_VIDEO_PRESETS);
  let presetKeys =
    Array.isArray(opts.presets) && opts.presets.length > 0
      ? opts.presets.filter((k) => typeof k === "string" && RISEFORM_WORD_VIDEO_PRESETS[k])
      : allKeys;
  presetKeys = [...new Set(presetKeys)];
  if (presetKeys.length === 0) presetKeys = ["smooth"];
  if (presetKeys.length > MAX_PRESETS) {
    presetKeys = presetKeys.slice(0, MAX_PRESETS);
  }

  /** @type {Buffer[]} */
  let pngs;
  if (video_mode === "staged") {
    const layout = computeRiseformPosterStackLayout({
      lines: segments,
      width,
      height,
    });
    const sub = STAGED_BLEND_STEPS;
    pngs = [];
    for (let k = 0; k < segments.length; k++) {
      for (let s = 0; s < sub; s++) {
        const t = sub <= 1 ? 1 : s / (sub - 1);
        pngs.push(await renderRiseformStagedBlackToChromeFrame(layout, k, t));
      }
    }
  } else {
    const specs = frameSpecsForSegments(video_mode, segments);
    pngs = await Promise.all(
      specs.map((s) =>
        renderRiseformChromeLinePng({
          text: s.text,
          width,
          height,
          verticalAlign: s.verticalAlign,
          fontScale: s.fontScale,
          fontSizeProfileMatch: video_mode === "frames",
        }),
      ),
    );
  }

  const ffmpegBin = resolveFfmpegBinary();
  const probe = spawnSync(ffmpegBin, ["-hide_banner", "-version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    throw new Error("ffmpeg no disponible (instala ffmpeg o usa ffmpeg-static del proyecto)");
  }

  const workDir = await mkdtemp(join(tmpdir(), "riseform-word-vid-"));
  try {
    await mkdir(workDir, { recursive: true });
    for (let i = 0; i < pngs.length; i++) {
      await writeFile(join(workDir, `f${i}.png`), pngs[i]);
    }

    /** @type {Array<{ preset: string; transition: string; speed: number; mime: string; video_base64: string }>} */
    const videos = [];
    for (const key of presetKeys) {
      const preset = RISEFORM_WORD_VIDEO_PRESETS[key];
      const buf = await encodeOneMp4(workDir, pngs.length, preset, width, height, ffmpegBin, {
        stagedBlendSteps: video_mode === "staged" ? STAGED_BLEND_STEPS : 1,
      });
      videos.push({
        preset: key,
        transition: preset.transition,
        speed: preset.speed,
        mime: "video/mp4",
        video_base64: buf.toString("base64"),
      });
    }

    return {
      video_mode,
      segments,
      width,
      height,
      background: "#000000",
      text_style: "playfair_chrome_liquid",
      leader_trailer_black_sec: BLACK_LEADER_TRAILER_SEC,
      staged_reveal: video_mode === "staged",
      staged_blend_steps: video_mode === "staged" ? STAGED_BLEND_STEPS : undefined,
      timeline_frame_count: pngs.length,
      videos,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
