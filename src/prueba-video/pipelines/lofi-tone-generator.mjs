/**
 * Lofi procedural (Node + node-web-audio-api).
 * Semilla/concepto → BPM, tonalidad, progresión → WAV.
 */

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OfflineAudioContext } from "node-web-audio-api";
import { log } from "../../rnd-word/log.mjs";
import { resolveFfmpegBinary } from "../../riseform/pipelines/fractal-background-video.mjs";
import {
  BRAND_BODY_EDGE_FADE_SEC,
  BRAND_INTRO_FADE_OUT_SEC,
  BRAND_OUTRO_FADE_OUT_SEC,
  fractalVoiceIntroStates,
  fractalVoiceOutroStates,
  introBrandTimings,
  outroBrandTimings,
  themeIntroTimings,
  themeTitleTypewriterStates,
} from "./brand-typewriter.mjs";

const SAMPLE_RATE = 44100;
/** Trozos de render offline (segundos); permite log de avance. */
const LOFI_RENDER_CHUNK_SEC = 10;
const LOFI_RENDER_HEARTBEAT_SEC = 15;
const KEYS = ["A", "D", "E", "F", "G", "C", "B"];
const PROGRESSIONS = [
  [0, 5, 3, 4],
  [0, 3, 5, 4],
  [0, 4, 5, 3],
  [0, 5, 4, 3],
  [0, 2, 3, 5],
];

function hashSeed(input) {
  const s = String(input ?? "lofi");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {string} [concept] @param {number} [seed] */
export function deriveLofiParams(concept, seed) {
  const base = typeof seed === "number" ? seed : hashSeed(concept || "fractal-voice");
  const rand = mulberry32(base);
  const key = KEYS[base % KEYS.length];
  const prog = PROGRESSIONS[base % PROGRESSIONS.length];
  const bpm = 68 + Math.floor(rand() * 20);
  const mood =
    rand() > 0.66 ? "dreamy" : rand() > 0.33 ? "melancholic" : "focus";
  return { seed: base, key, bpm, progression: prog, mood };
}

function degreeToFreq(key, degree, octave = 3) {
  const roots = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const semitone = (roots[key] + degree) % 12;
  return 440 * 2 ** ((semitone + (octave - 4) * 12 - 9) / 12);
}

function chordFreqs(key, degree, octave = 3) {
  return [0, 4, 7].map((t) => degreeToFreq(key, degree + t, octave));
}

function encodeWavFromAudioBuffer(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numSamples = audioBuffer.length;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = audioBuffer.getChannelData(ch)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      buffer.writeInt16LE(Math.round(clamped * 32767), offset);
      offset += 2;
    }
  }
  return buffer;
}

function createImpulseResponse(ctx, seconds, decay) {
  const len = Math.floor(seconds * ctx.sampleRate);
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
  }
  return impulse;
}

function schedulePad(ctx, dest, freqs, start, duration, gainVal) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainVal, start + 0.08);
  gain.gain.exponentialRampToValueAtTime(gainVal * 0.55, start + duration * 0.45);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(dest);

  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, start);
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }
}

function scheduleKick(ctx, dest, time, gainVal) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
  gain.gain.setValueAtTime(gainVal, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.35);
}

function scheduleHat(ctx, dest, time, gainVal) {
  const len = Math.ceil(0.06 * ctx.sampleRate);
  const noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 7000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainVal, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(time);
  src.stop(time + 0.05);
}

function sumTimings(arr) {
  return arr.reduce((a, d) => a + d, 0);
}

/** @param {"fv"|"theme"} introKind @param {string} [themeTitle] */
export function brandIntroDurationSec(introKind, themeTitle) {
  if (introKind === "fv") {
    return sumTimings(introBrandTimings(fractalVoiceIntroStates()));
  }
  return sumTimings(themeIntroTimings(themeTitleTypewriterStates(themeTitle)));
}

export function brandOutroDurationSec() {
  return sumTimings(outroBrandTimings(fractalVoiceOutroStates()));
}

/**
 * Fades de audio alineados con intro/outro de marca.
 * @param {number} videoDurationSec
 * @param {"fv"|"theme"} introKind
 * @param {string} [themeTitle]
 */
export function computeLofiAudioEdgeFades(videoDurationSec, introKind, themeTitle) {
  const introSec = brandIntroDurationSec(introKind, themeTitle);
  const outroSec = brandOutroDurationSec();
  const fadeInSt = Math.max(0, introSec - BRAND_INTRO_FADE_OUT_SEC);
  const fadeInDur = BRAND_INTRO_FADE_OUT_SEC + BRAND_BODY_EDGE_FADE_SEC;
  const fadeOutDur = BRAND_BODY_EDGE_FADE_SEC + BRAND_OUTRO_FADE_OUT_SEC;
  const fadeOutSt = Math.max(
    fadeInSt + 2,
    videoDurationSec - outroSec - BRAND_BODY_EDGE_FADE_SEC,
  );
  return { fadeInSt, fadeInDur, fadeOutSt, fadeOutDur };
}

function setupLofiGraph(ctx, mood) {
  const master = ctx.createGain();
  master.gain.value = 0.82;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = mood === "melancholic" ? 900 : mood === "dreamy" ? 1600 : 1200;
  filter.Q.value = 0.7;

  const convolver = ctx.createConvolver();
  convolver.buffer = createImpulseResponse(ctx, mood === "dreamy" ? 1.1 : 0.75, mood === "dreamy" ? 2.2 : 3);
  const reverbWet = ctx.createGain();
  reverbWet.gain.value = 0.38;
  const reverbDry = ctx.createGain();
  reverbDry.gain.value = 0.72;

  filter.connect(reverbDry);
  filter.connect(convolver);
  convolver.connect(reverbWet);
  reverbDry.connect(master);
  reverbWet.connect(master);
  master.connect(ctx.destination);

  return filter;
}

function startVinyl(ctx, filter, totalSamples) {
  const vinylLen = Math.min(totalSamples, SAMPLE_RATE * 4);
  const vinylBuf = ctx.createBuffer(1, vinylLen, SAMPLE_RATE);
  const vinylData = vinylBuf.getChannelData(0);
  for (let i = 0; i < vinylLen; i++) vinylData[i] = Math.random() * 2 - 1;
  const vinylSrc = ctx.createBufferSource();
  vinylSrc.buffer = vinylBuf;
  vinylSrc.loop = true;
  const vinylGain = ctx.createGain();
  vinylGain.gain.value = 0.012;
  vinylSrc.connect(vinylGain);
  vinylGain.connect(filter);
  vinylSrc.start(0);
}

function scheduleLofiSegment(ctx, filter, params, segmentStartSec, segmentDurationSec) {
  const { key, bpm, progression } = params;
  const barSec = (60 / bpm) * 4;
  const segmentEnd = segmentStartSec + segmentDurationSec;
  const firstBar = Math.max(0, Math.floor(segmentStartSec / barSec) - 1);
  const lastBar = Math.ceil(segmentEnd / barSec) + 1;
  const padGain = 0.14;
  const kickGain = 0.55;
  const hatGain = 0.18;

  for (let bar = firstBar; bar <= lastBar; bar++) {
    const t0 = bar * barSec;
    const padEnd = t0 + barSec * 1.8;
    if (padEnd <= segmentStartSec || t0 >= segmentEnd) continue;

    const padStart = Math.max(t0, segmentStartSec);
    const padEndClamped = Math.min(padEnd, segmentEnd);
    if (padEndClamped <= padStart) continue;

    const localT0 = padStart - segmentStartSec;
    const localPadDur = padEndClamped - padStart;
    const deg = progression[bar % progression.length];
    schedulePad(ctx, filter, chordFreqs(key, deg, 3), localT0, localPadDur, padGain);

    for (const kickAt of [t0, t0 + (60 / bpm) * 2]) {
      if (kickAt >= segmentStartSec && kickAt < segmentEnd) {
        scheduleKick(ctx, filter, kickAt - segmentStartSec, kickGain);
      }
    }

    for (let step = 0; step < 8; step++) {
      const hatAt = t0 + step * (barSec / 8);
      if (step % 2 === 1 && hatAt >= segmentStartSec && hatAt < segmentEnd) {
        scheduleHat(ctx, filter, hatAt - segmentStartSec, hatGain);
      }
    }
  }
}

function concatAudioBuffers(buffers) {
  if (buffers.length === 0) {
    throw new Error("concatAudioBuffers: vacío");
  }
  if (buffers.length === 1) return buffers[0];

  const channels = buffers[0].numberOfChannels;
  const sampleRate = buffers[0].sampleRate;
  const totalLen = buffers.reduce((a, b) => a + b.length, 0);
  const tmp = new OfflineAudioContext(channels, 1, sampleRate);
  const out = tmp.createBuffer(channels, totalLen, sampleRate);

  let offset = 0;
  for (const buf of buffers) {
    for (let ch = 0; ch < channels; ch++) {
      out.getChannelData(ch).set(buf.getChannelData(ch), offset);
    }
    offset += buf.length;
  }
  return out;
}

async function renderLofiChunk(params, segmentStartSec, segmentDurationSec, onHeartbeat) {
  const totalSamples = Math.ceil(segmentDurationSec * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(2, totalSamples, SAMPLE_RATE);
  const filter = setupLofiGraph(ctx, params.mood);
  startVinyl(ctx, filter, totalSamples);
  scheduleLofiSegment(ctx, filter, params, segmentStartSec, segmentDurationSec);

  const started = Date.now();
  const heartbeat =
    typeof onHeartbeat === "function"
      ? setInterval(() => {
          const elapsed = Math.floor((Date.now() - started) / 1000);
          onHeartbeat(elapsed);
        }, LOFI_RENDER_HEARTBEAT_SEC * 1000)
      : null;

  try {
    return await ctx.startRendering();
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

/**
 * @param {object} opts
 * @param {number} opts.durationSec
 * @param {string} [opts.concept]
 * @param {number} [opts.seed]
 * @param {string} [opts.mood]
 * @param {(msg: string) => void} [opts.onProgress]
 */
export async function renderLofiToneWav(opts) {
  const durationSec = Math.max(4, Math.min(600, Number(opts.durationSec) || 30));
  const params = deriveLofiParams(opts.concept, opts.seed);
  if (opts.mood) params.mood = opts.mood;
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};

  const { key, bpm, mood } = params;
  onProgress(
    `inicio ${durationSec}s | ${key} ${bpm}bpm ${mood} | trozos ${LOFI_RENDER_CHUNK_SEC}s`,
  );

  const chunkCount = Math.ceil(durationSec / LOFI_RENDER_CHUNK_SEC);
  /** @type {AudioBuffer[]} */
  const parts = [];

  for (let i = 0; i < chunkCount; i++) {
    const segmentStartSec = i * LOFI_RENDER_CHUNK_SEC;
    const segmentDurationSec = Math.min(
      LOFI_RENDER_CHUNK_SEC,
      durationSec - segmentStartSec + (i === chunkCount - 1 ? 0.25 : 0),
    );
    onProgress(`render trozo ${i + 1}/${chunkCount} (${segmentDurationSec.toFixed(1)}s)`);

    const part = await renderLofiChunk(params, segmentStartSec, segmentDurationSec, (elapsedSec) => {
      onProgress(`render trozo ${i + 1}/${chunkCount} … ${elapsedSec}s`);
    });
    parts.push(part);
    onProgress(`render trozo ${i + 1}/${chunkCount} OK`);
  }

  const rendered = concatAudioBuffers(parts);
  onProgress(`render completo (${chunkCount} trozos)`);

  return {
    wav: encodeWavFromAudioBuffer(rendered),
    params,
    durationSec,
  };
}

/**
 * Combina MP4 + WAV lofi → MP4 AAC.
 * @param {Buffer} videoMp4
 * @param {Buffer} wavBuf
 * @param {string} workDir
 */
export async function muxLofiAudioIntoMp4(videoMp4, wavBuf, workDir) {
  await mkdir(workDir, { recursive: true });
  const ffmpegBin = resolveFfmpegBinary();
  const videoPath = join(workDir, "video_in.mp4");
  const audioPath = join(workDir, "lofi.wav");
  const outPath = join(workDir, "muxed.mp4");
  await writeFile(videoPath, videoMp4);
  await writeFile(audioPath, wavBuf);

  const args = [
    "-hide_banner",
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outPath,
  ];
  const run = spawnSync(ffmpegBin, args, { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
  if (run.error) throw new Error(run.error.message);
  if (run.status !== 0) {
    throw new Error(run.stderr?.slice(-3000) || "ffmpeg mux audio failed");
  }
  return readFile(outPath);
}

/**
 * Fade de audio al inicio/final (intro/outro de vídeo).
 * @param {Buffer} wavBuf
 * @param {string} workDir
 * @param {number} fadeInSt
 * @param {number} fadeInDur
 * @param {number} fadeOutSt
 * @param {number} fadeOutDur
 * @param {number} durationSec
 */
export async function applyAudioEdgeFades(
  wavBuf,
  workDir,
  fadeInSt,
  fadeInDur,
  fadeOutSt,
  fadeOutDur,
  durationSec,
) {
  await mkdir(workDir, { recursive: true });
  const ffmpegBin = resolveFfmpegBinary();
  const inPath = join(workDir, "lofi_in.wav");
  const outPath = join(workDir, "lofi_faded.wav");
  await writeFile(inPath, wavBuf);
  void durationSec;
  const af = `afade=t=in:st=${fadeInSt.toFixed(3)}:d=${fadeInDur.toFixed(3)},afade=t=out:st=${fadeOutSt.toFixed(3)}:d=${fadeOutDur.toFixed(3)}`;
  const run = spawnSync(
    ffmpegBin,
    ["-hide_banner", "-y", "-i", inPath, "-af", af, outPath],
    { encoding: "utf8", maxBuffer: 40 * 1024 * 1024 },
  );
  if (run.error) throw new Error(run.error.message);
  if (run.status !== 0) {
    throw new Error(run.stderr?.slice(-2000) || "ffmpeg audio fade failed");
  }
  return readFile(outPath);
}

/**
 * Genera lofi, aplica fades de marca y muxea con el MP4.
 * @param {object} opts
 * @param {Buffer} opts.videoMp4
 * @param {number} opts.durationSec
 * @param {string} opts.concept
 * @param {number} [opts.seed]
 * @param {"fv"|"theme"} opts.introKind
 * @param {string} [opts.themeTitle]
 * @param {string} opts.workDir
 * @param {string} [opts.label]
 * @param {(msg: string) => void} [opts.onProgress]
 */
export async function attachLofiToVideo(opts) {
  const label = opts.label || "vídeo";
  const progress = (step) => {
    log(`[prueba-video] lofi ${label} | ${step}`);
    if (typeof opts.onProgress === "function") opts.onProgress(step);
  };

  const t0 = Date.now();
  progress(`generando WAV (${opts.durationSec}s)…`);
  const { wav } = await renderLofiToneWav({
    durationSec: opts.durationSec,
    concept: opts.concept,
    seed: opts.seed,
    onProgress: (msg) => progress(msg),
  });

  progress("fade intro/outro…");
  const fades = computeLofiAudioEdgeFades(opts.durationSec, opts.introKind, opts.themeTitle);
  const faded = await applyAudioEdgeFades(
    wav,
    join(opts.workDir, "fade"),
    fades.fadeInSt,
    fades.fadeInDur,
    fades.fadeOutSt,
    fades.fadeOutDur,
    opts.durationSec,
  );

  progress("mux MP4 + AAC…");
  const muxed = await muxLofiAudioIntoMp4(opts.videoMp4, faded, join(opts.workDir, "mux"));
  const elapsed = Math.round((Date.now() - t0) / 1000);
  progress(`OK (${elapsed}s)`);

  return { buffer: muxed, lofi_params: deriveLofiParams(opts.concept, opts.seed), audio_fades: fades };
}
