/**
 * Prueba rápida: lofi procedural según concepto.
 * Uso: node scripts/generate-lofi-sample.mjs "concepto aquí"
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderLofiToneWav } from "../src/prueba-video/pipelines/lofi-tone-generator.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "output");
const concept = process.argv.slice(2).join(" ") || "La disciplina como hábito diario";
const durationSec = process.env.LOFI_SEC ? Number(process.env.LOFI_SEC) : 30;

await mkdir(OUT, { recursive: true });
console.log(`Generando lofi ${durationSec}s | concepto: "${concept}"`);

const t0 = Date.now();
const { wav, params } = await renderLofiToneWav({ durationSec, concept });
const outPath = join(OUT, "lofi-sample.wav");
await writeFile(outPath, wav);

console.log(`  params: ${JSON.stringify(params)}`);
console.log(`  → ${outPath}`);
console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
