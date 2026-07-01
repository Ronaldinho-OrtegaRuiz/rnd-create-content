import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logErr } from "../src/rnd-word/log.mjs";

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

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--text" && argv[i + 1]) out.text = argv[++i];
    else if (a === "--lang" && argv[i + 1]) out.lang = argv[++i];
    else if (a === "--out" && argv[i + 1]) out.out = argv[++i];
    else if (a === "--slides" && argv[i + 1]) out.slides = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.out) {
  logErr("Uso: npm run voice:synth -- --text \"...\" --lang es --out output/test.wav");
  process.exit(1);
}

const outPath = join(REPO_ROOT, args.out);
mkdirSync(dirname(outPath), { recursive: true });

const pyArgs = [
  join(VOICE_DIR, "synthesize.py"),
  "--out",
  outPath,
  "--lang",
  args.lang || "es",
];
if (args.slides) pyArgs.push("--slides", join(REPO_ROOT, args.slides));
else if (args.text) pyArgs.push("--text", args.text);
else {
  logErr("Falta --text o --slides");
  process.exit(1);
}

const run = spawnSync(resolvePython(), pyArgs, { cwd: REPO_ROOT, stdio: "inherit" });
process.exit(run.status ?? 1);
