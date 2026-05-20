/** Objetivo por defecto del vídeo largo (~5 min, tope del rango). */
export const DEFAULT_SCRIPT_DURATION_SEC = 300;

/** Vídeo largo: mínimo 2:45. */
export const MIN_LONG_DURATION_SEC = 165;

/** Vídeo largo: máximo 5:00. */
export const MAX_LONG_DURATION_SEC = 300;

/** Vídeo corto vertical: objetivo 30 s. */
export const SHORT_SCRIPT_DURATION_SEC = 30;

export const MIN_SHORT_DURATION_SEC = 26;

export const MAX_SHORT_DURATION_SEC = 34;

function mmSs(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * @param {{ concept: string; longDurationSec?: number; shortDurationSec?: number }} input
 */
export function buildGeminiVideoScriptPrompt({
  concept,
  longDurationSec = DEFAULT_SCRIPT_DURATION_SEC,
  shortDurationSec = SHORT_SCRIPT_DURATION_SEC,
}) {
  const longMin = MIN_LONG_DURATION_SEC;
  const longMax = MAX_LONG_DURATION_SEC;
  const longTarget = Math.min(longMax, Math.max(longMin, longDurationSec));

  const shortMin = MIN_SHORT_DURATION_SEC;
  const shortMax = MAX_SHORT_DURATION_SEC;
  const shortTarget = Math.min(shortMax, Math.max(shortMin, shortDurationSec));

  return `Eres guionista para VÍDEOS DE REDES SOCIALES (Reels, TikTok, YouTube Shorts y vídeo largo horizontal).

El texto de cada diapositiva es lo que aparece EN PANTALLA mientras alguien habla o hace voz en off. Debe sonar NATURAL, como si le explicaras el tema a una persona, NO como diapositivas de PowerPoint ni apuntes de clase.

FORMATO DE SALIDA (diapositivas):
Parte N → text (prosa hablada) + duration_sec (segundos en pantalla).

PROHIBIDO en el campo text:
- Listas con viñetas o saltos de línea tipo bullet (no uses \\n para enumerar).
- Encabezados sueltos con dos puntos: "Ventajas:", "Desafíos:", "Aplicaciones:", "Ejemplo:", "Introducción:".
- Frases telegráficas sueltas: "Escalabilidad, variedad, eficiencia."
- Tonos de informe o esquema académico.

OBLIGATORIO en text:
- Frases completas en prosa, tono conversacional de creador de contenido.
- Una idea clara por diapositiva (1 a 3 frases fluidas, máx ~320 caracteres).
- Narrativa con gancho, desarrollo con ejemplos concretos y cierre.

Dos idiomas (misma estructura): scripts.es y scripts.en (traducción natural, mismo número de partes).

Dos formatos por idioma:
1) slides — vídeo LARGO horizontal.
2) short_slides — vídeo CORTO vertical (Reels / TikTok).

══════════════════════════════════════════════════════
DURACIÓN VÍDEO LARGO (slides) — LEER CON ATENCIÓN
══════════════════════════════════════════════════════
La SUMA de todos los duration_sec en scripts.es.slides es la duración REAL del MP4 largo.

DEBE cumplirse SIEMPRE:
• MÍNIMO: ${longMin} segundos = ${mmSs(longMin)} (dos minutos cuarenta y cinco segundos). Nunca menos.
• MÁXIMO: ${longMax} segundos = ${mmSs(longMax)} (cinco minutos). Nunca más.

Rango válido: entre ${mmSs(longMin)} y ${mmSs(longMax)} inclusive.
Objetivo sugerido para este pedido: ~${longTarget} s (~${mmSs(longTarget)}), siempre dentro del rango.

Antes de responder, calcula mentalmente: sum(duration_sec de scripts.es.slides). Si no está entre ${longMin} y ${longMax}, ajusta duration_sec hasta entrar en el rango.

══════════════════════════════════════════════════════
DURACIÓN VÍDEO CORTO (short_slides) — LEER CON ATENCIÓN
══════════════════════════════════════════════════════
La SUMA de duration_sec en scripts.es.short_slides es la duración REAL del short vertical.

DEBE cumplirse SIEMPRE:
• Objetivo: ${shortTarget} segundos (30 segundos).
• MÍNIMO: ${shortMin} s. MÁXIMO: ${shortMax} s.
• Rango válido: entre ${shortMin} y ${shortMax} segundos inclusive.

Calcula sum(short_slides duration_sec) y ajústalo a ~${shortTarget} s sin salir de ${shortMin}–${shortMax}.

Devuelve SOLO JSON válido (sin markdown):

{
  "concept_summary": "resumen en español",
  "scripts": {
    "es": {
      "title": "título largo",
      "short_title": "título short",
      "slides": [
        { "part": 1, "text": "¿Alguna vez has notado que…? Hoy te explico…", "duration_sec": 16 }
      ],
      "short_slides": [
        { "part": 1, "text": "La idea clave en una frase clara y directa.", "duration_sec": 6 }
      ]
    },
    "en": { "title": "...", "short_title": "...", "slides": [...], "short_slides": [...] }
  }
}

Reglas slides (largo):
- 10 a 20 diapositivas; mismo número en es y en; misma duration_sec por índice.
- Cada duration_sec entre 10 y 28.
- part: 1, 2, 3… sin saltos.

Reglas short_slides:
- 4 a 6 diapositivas; mismo conteo es/en; misma duration_sec por índice.
- Cada duration_sec entre 4 y 8.
- Frases completas, gancho + mensaje + cierre.

General:
- Sin emojis ni hashtags.
- short_slides condensa el mismo mensaje del largo.

Concepto del vídeo:
${concept.trim()}`;
}
