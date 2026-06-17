import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { riseformGradientBoxes } from "../../riseform/core/chrome-raster.mjs";
import { accentGradientDefs, chromePathNoBorder } from "../../riseform/core/riseform-chrome-svg.mjs";
import { posterMonoFont } from "../../riseform/pipelines/solid-typography-poster.mjs";
import { resolveFfmpegBinary } from "../../riseform/pipelines/fractal-background-video.mjs";

const POSTER_BACKGROUND = "#000000";

function escapeXmlAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

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

function measureLineWidth(font, text, fontSize) {
  const path = font.getPath(text, 0, 0, fontSize, { kerning: true });
  const box = path.getBoundingBox();
  return box.x2 - box.x1;
}

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
    line.push(w);
  }
  if (line.length) lines.push(line.join(" "));
  return lines;
}

/** Estados typewriter: FV → Fractal Voice (1 espacio, sin guión). */
export function fractalVoiceIntroStates() {
  /** @type {string[]} */
  const states = ["FV"];
  let left = "F";
  for (const ch of "ractal") {
    left += ch;
    states.push(`${left} V`);
  }
  let right = "V";
  for (const ch of "oice") {
    right += ch;
    states.push(`Fractal ${right}`);
  }
  return states;
}

/** Outro: se borra todo hasta negro (sin dejar FV). */
export function fractalVoiceOutroStates() {
  return [...fractalVoiceIntroStates()].reverse().concat([""]);
}

/** Typewriter carácter a carácter del título tal cual. */
export function themeTitleTypewriterStates(title) {
  const t = String(title || "").trim();
  if (!t) return [""];
  /** @type {string[]} */
  const states = [];
  for (let i = 1; i <= t.length; i++) {
    states.push(t.slice(0, i));
  }
  return states;
}

function brandFontSize(width, height, kind) {
  const shortSide = Math.min(width, height);
  if (kind === "fv") {
    return Math.max(48, Math.round(shortSide * (width > height ? 0.11 : 0.09)));
  }
  return Math.max(22, Math.round(shortSide * (width > height ? 0.042 : 0.038)));
}

/**
 * PNG negro + texto chrome (IBM Plex Mono).
 * @param {string} text
 * @param {number} width
 * @param {number} height
 * @param {"fv"|"title"} kind
 */
export async function renderChromeBrandTextPng(text, width, height, kind = "fv") {
  const w = Math.max(32, Math.round(width));
  const h = Math.max(32, Math.round(height));
  const font = posterMonoFont;
  const fontSize = brandFontSize(w, h, kind);
  const pad = Math.round(Math.min(w, h) * (kind === "fv" ? 0.08 : 0.12));
  const innerW = w - 2 * pad;

  if (!text.trim()) {
    const svgEmpty = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${POSTER_BACKGROUND}"/></svg>`;
    return sharp(Buffer.from(svgEmpty, "utf8")).png().toBuffer();
  }

  const lines =
    kind === "title" ? wrapTextToWidth(font, text, innerW, fontSize) : [text];
  const lineGap = fontSize * 0.22;
  const lineHeights = lines.map((ln) => {
    const p = font.getPath(ln, 0, 0, fontSize, { kerning: true });
    const b = p.getBoundingBox();
    return b.y2 - b.y1;
  });
  const totalH =
    lineHeights.reduce((a, lh, i) => a + lh + (i < lineHeights.length - 1 ? lineGap : 0), 0) ||
    fontSize;

  let y = pad + (h - 2 * pad - totalH) / 2;
  const pathDs = [];
  for (let i = 0; i < lines.length; i++) {
    const lh = lineHeights[i];
    const cy = y + lh / 2;
    pathDs.push(pathDCentered(font, lines[i], w / 2, cy, fontSize));
    y += lh + (i < lines.length - 1 ? lineGap : 0);
  }

  const boxes = riseformGradientBoxes(w, h);
  const idPrefix = `br_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const defs = accentGradientDefs(idPrefix, boxes.chrome, boxes.liquid);
  const pathMarkup = pathDs.map((d) => chromePathNoBorder(d, idPrefix)).join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="${POSTER_BACKGROUND}"/>
  ${defs}
  ${pathMarkup}
</svg>`;

  return sharp(Buffer.from(svg, "utf8")).png().toBuffer();
}

/**
 * @param {string} workDir
 * @param {string[]} states
 * @param {number[]} holdSecPerState
 * @param {number} w
 * @param {number} h
 * @param {"fv"|"title"} kind
 * @param {number} [fadeOutSec=0]
 */
export async function encodeTypewriterClip(
  workDir,
  states,
  holdSecPerState,
  w,
  h,
  kind,
  fadeOutSec = 0,
) {
  await mkdir(workDir, { recursive: true });
  const ffmpegBin = resolveFfmpegBinary();
  const n = states.length;

  for (let i = 0; i < n; i++) {
    const png = await renderChromeBrandTextPng(states[i], w, h, kind);
    await writeFile(join(workDir, `tw${i}.png`), png);
  }

  const inputs = [];
  for (let i = 0; i < n; i++) {
    inputs.push("-loop", "1", "-t", String(Math.max(0.04, holdSecPerState[i] || 0.1)), "-i", join(workDir, `tw${i}.png`));
  }

  const scaled = [];
  for (let i = 0; i < n; i++) {
    scaled.push(`[${i}:v]scale=${w}:${h}:flags=lanczos,format=yuv420p,setsar=1,fps=30[v${i}]`);
  }
  const concatIn = states.map((_, i) => `[v${i}]`).join("");
  let filter = `${scaled.join(";")};${concatIn}concat=n=${n}:v=1:a=0[vcat]`;

  let outLabel = "vcat";
  if (fadeOutSec > 0) {
    const totalDur = holdSecPerState.reduce((a, d) => a + d, 0);
    const st = Math.max(0, totalDur - fadeOutSec);
    filter += `;[vcat]fade=t=out:st=${st.toFixed(3)}:d=${fadeOutSec.toFixed(3)}:color=black[vout]`;
    outLabel = "vout";
  } else {
    filter += `;[vcat]copy[vout]`;
  }

  const outPath = join(workDir, `typewriter_${Date.now()}.mp4`);
  const args = [
    "-hide_banner",
    "-y",
    ...inputs,
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

  const run = spawnSync(ffmpegBin, args, { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
  if (run.error) throw new Error(run.error.message);
  if (run.status !== 0) {
    throw new Error(run.stderr?.slice(-3500) || "ffmpeg typewriter failed");
  }
  return readFile(outPath);
}

function probeMp4DurationSec(ffmpegBin, filePath) {
  const run = spawnSync(ffmpegBin, ["-hide_banner", "-i", filePath], { encoding: "utf8" });
  const durMatch = /Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/.exec(run.stderr || "");
  if (!durMatch) return 4;
  return Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);
}

/** Fade in/out a negro en un clip (p. ej. cuerpo fractal entre intro y outro). */
export async function applyVideoEdgeFades(workDir, mp4Buf, fadeInSec, fadeOutSec) {
  const ffmpegBin = resolveFfmpegBinary();
  await mkdir(workDir, { recursive: true });
  const inPath = join(workDir, "edge_in.mp4");
  const outPath = join(workDir, "edge_out.mp4");
  await writeFile(inPath, mp4Buf);
  const dur = probeMp4DurationSec(ffmpegBin, inPath);
  const outSt = Math.max(0, dur - fadeOutSec);
  const vf = `fade=t=in:st=0:d=${fadeInSec.toFixed(3)}:color=black,fade=t=out:st=${outSt.toFixed(3)}:d=${fadeOutSec.toFixed(3)}:color=black`;
  const args = [
    "-hide_banner",
    "-y",
    "-i",
    inPath,
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
  const run = spawnSync(ffmpegBin, args, { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
  if (run.error) throw new Error(run.error.message);
  if (run.status !== 0) {
    throw new Error(run.stderr?.slice(-3000) || "ffmpeg edge fade failed");
  }
  return readFile(outPath);
}

export const BRAND_INTRO_FADE_OUT_SEC = 2.2;
export const BRAND_OUTRO_FADE_OUT_SEC = 3.0;
export const BRAND_BODY_EDGE_FADE_SEC = 2.0;

/** @param {string} workDir @param {Buffer} mp4Buf */
export async function writeAndProbeMp4Duration(workDir, mp4Buf) {
  await mkdir(workDir, { recursive: true });
  const p = join(workDir, "probe_dur.mp4");
  await writeFile(p, mp4Buf);
  return probeMp4DurationSec(resolveFfmpegBinary(), p);
}

export async function renderBrandIntroFvClip(workDir, w, h) {
  const states = fractalVoiceIntroStates();
  return encodeTypewriterClip(
    workDir,
    states,
    introBrandTimings(states),
    w,
    h,
    "fv",
    BRAND_INTRO_FADE_OUT_SEC,
  );
}

export async function renderBrandIntroThemeClip(workDir, w, h, title) {
  const states = themeTitleTypewriterStates(title);
  return encodeTypewriterClip(
    workDir,
    states,
    themeIntroTimings(states),
    w,
    h,
    "title",
    BRAND_INTRO_FADE_OUT_SEC,
  );
}

export async function renderBrandOutroClip(workDir, w, h) {
  const states = fractalVoiceOutroStates();
  return encodeTypewriterClip(
    workDir,
    states,
    outroBrandTimings(states),
    w,
    h,
    "fv",
    BRAND_OUTRO_FADE_OUT_SEC,
  );
}

/**
 * Intro + cuerpo (con fades a negro) + outro Fractal Voice.
 * @param {object} opts
 * @param {"fv"|"theme"} opts.introKind
 * @param {string} [opts.themeTitle]
 */
export async function wrapWithBrandBookends(workDir, bodyBuf, opts) {
  const width = opts.width;
  const height = opts.height;
  const sub = join(workDir, "brand");
  const body = await applyVideoEdgeFades(
    join(sub, "body"),
    bodyBuf,
    BRAND_BODY_EDGE_FADE_SEC,
    BRAND_BODY_EDGE_FADE_SEC,
  );
  /** @type {Buffer[]} */
  const parts = [];
  if (opts.introKind === "fv") {
    parts.push(await renderBrandIntroFvClip(join(sub, "intro"), width, height));
  } else if (opts.introKind === "theme") {
    parts.push(
      await renderBrandIntroThemeClip(join(sub, "intro"), width, height, opts.themeTitle || ""),
    );
  }
  parts.push(body);
  parts.push(await renderBrandOutroClip(join(sub, "outro"), width, height));
  const buffer = await concatMp4Parts(join(sub, "concat"), parts, width, height);
  const duration_sec = await writeAndProbeMp4Duration(join(sub, "probe"), buffer);
  return { buffer, duration_sec: Math.round(duration_sec * 10) / 10 };
}

/** @param {Buffer[]} parts */
export async function concatMp4Parts(workDir, parts, w, h, fadeSec = 1.5) {
  void w;
  void h;
  void fadeSec;
  const ffmpegBin = resolveFfmpegBinary();
  await mkdir(workDir, { recursive: true });
  const paths = [];
  for (let i = 0; i < parts.length; i++) {
    const p = join(workDir, `part${i}.mp4`);
    await writeFile(p, parts[i]);
    paths.push(p);
  }

  if (paths.length === 1) return readFile(paths[0]);

  const listPath = join(workDir, "concat_list.txt");
  const listBody = paths
    .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(listPath, listBody);

  const outPath = join(workDir, `concat_${Date.now()}.mp4`);
  const args = [
    "-hide_banner",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
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
    throw new Error(run.stderr?.slice(-3500) || "ffmpeg concat failed");
  }
  return readFile(outPath);
}

export function typewriterTimings(states, { fvHold = 0.45, letterSec = 0.09, finalHold = 0.35 } = {}) {
  return states.map((s, i) => {
    if (i === 0 && s === "FV") return fvHold;
    if (i === states.length - 1) return finalHold;
    return letterSec;
  });
}

/** Intro FV: pausa larga con “Fractal Voice” completo antes del fade. */
export function introBrandTimings(states) {
  return states.map((s, i) => {
    if (i === 0 && s === "FV") return 0.55;
    if (i === states.length - 1) return 2.5;
    return 0.1;
  });
}

/** Intro vertical: pausa con título completo antes del fade. */
export function themeIntroTimings(states) {
  return states.map((_, i) => (i === states.length - 1 ? 2.5 : 0.08));
}

/** Outro: pausa al inicio + borrado lento letra a letra. */
export function outroBrandTimings(states) {
  return states.map((_, i) => {
    if (i === 0) return 2.8;
    if (i === states.length - 1) return 0.6;
    return 0.18;
  });
}
