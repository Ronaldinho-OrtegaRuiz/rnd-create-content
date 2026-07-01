import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { log, logErr } from "../src/rnd-word/log.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const VOICE_DIR = join(REPO_ROOT, "src", "prueba-video", "voice");

function resolvePython() {
  const venvPy = join(VOICE_DIR, ".venv", "Scripts", "python.exe");
  if (existsSync(venvPy)) return venvPy;
  const venvPyUnix = join(VOICE_DIR, ".venv", "bin", "python");
  if (existsSync(venvPyUnix)) return venvPyUnix;
  return "python";
}

function runVoiceScript(scriptName, extraArgs = []) {
  const py = resolvePython();
  const script = join(VOICE_DIR, scriptName);
  const run = spawnSync(py, [script, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (run.error) {
    logErr(run.error.message);
    process.exit(1);
  }
  process.exit(run.status ?? 1);
}

const prepare = process.argv.includes("--prepare");
if (prepare) {
  log("[voice] preparar dataset RVC…");
  runVoiceScript("prepare_rvc_dataset.py");
} else {
  log("[voice] validar muestras…");
  runVoiceScript("check_samples.py", ["--lang", "all"]);
}
