/**
 * Síntesis de voz para prueba-video (Fractal Voice).
 * Fase actual: validación + Piper demo.
 * Fase siguiente: Piper → RVC → WAV por slide / vídeo.
 *
 * Integración pipeline (cuando el modelo esté listo):
 *   Tras generateVideoScriptWithGemini, en paralelo con fractales y lofi:
 *     synthesizeNarrationForScript({ script, lang, workDir })
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "../../rnd-word/log.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const VOICE_DIR = join(__dirname, "..", "voice");

export const VOICE_SAMPLES = {
  es: join(VOICE_DIR, "samples", "es"),
  en: join(VOICE_DIR, "samples", "en"),
};

export const VOICE_MODELS_DIR = join(VOICE_DIR, "models");

/** @returns {string} */
export function resolveVoicePython() {
  const win = join(VOICE_DIR, ".venv", "Scripts", "python.exe");
  if (existsSync(win)) return win;
  const unix = join(VOICE_DIR, ".venv", "bin", "python");
  if (existsSync(unix)) return unix;
  return "python";
}

/**
 * @param {"es"|"en"} lang
 * @returns {boolean}
 */
export function hasTrainedVoiceModel(lang) {
  const specific = join(VOICE_MODELS_DIR, `fractal-voice-${lang}.pth`);
  const generic = join(VOICE_MODELS_DIR, "fractal-voice.pth");
  return existsSync(specific) || existsSync(generic);
}

/**
 * @param {object} opts
 * @param {string} opts.text
 * @param {"es"|"en"} opts.lang
 * @param {string} opts.outPath
 * @returns {Promise<void>}
 */
export function synthesizeVoiceToFile(opts) {
  return new Promise((resolve, reject) => {
    const py = resolveVoicePython();
    const script = join(VOICE_DIR, "synthesize.py");
    const args = [
      script,
      "--text",
      opts.text,
      "--lang",
      opts.lang,
      "--out",
      opts.outPath,
    ];
    log(`[voice] synthesize ${opts.lang} → ${opts.outPath}`);
    const child = spawn(py, args, { cwd: VOICE_DIR, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr?.on("data", (c) => {
      err += String(c);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `synthesize.py exit ${code}`));
    });
  });
}

/**
 * Placeholder: narración completa desde guion Gemini.
 * Se activará en run-prueba-video cuando fractal-voice-*.pth exista.
 *
 * @param {object} _opts
 * @param {{ slides: { text: string; duration_sec: number }[] }} _opts.scriptLang
 * @param {"es"|"en"} _opts.lang
 * @param {string} _opts.workDir
 */
export async function synthesizeNarrationForScript(_opts) {
  throw new Error(
    "synthesizeNarrationForScript: pendiente de integrar RVC. Entrena el modelo primero (npm run voice:train).",
  );
}

/**
 * TODO (post-voz): llamar en paralelo tras el guion Gemini:
 *
 *   const [fractal, lofi, narration] = await Promise.all([
 *     renderFractalBackgroundToFile(...),
 *     renderLofiToneWav(...),
 *     synthesizeNarrationForScript(...),
 *   ]);
 */
