import { log, logErr } from "../log.mjs";

const MODEL = "gemini-2.5-flash-lite";

/** Claves de guion cuyo valor debe ser string entre comillas. */
const JSON_STRING_VALUE_KEYS = ["concept_summary", "title", "short_title", "text"];

/**
 * Gemini a veces omite la comilla de apertura: "text": Hola mundo",
 * @param {string} text
 */
export function repairGeminiJsonText(text) {
  let s = String(text || "").trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    s = s.slice(start, end + 1);
  }

  for (const key of JSON_STRING_VALUE_KEYS) {
    const re = new RegExp(`("${key}"\\s*:\\s*)(?!")((?:[^"\\\\]|\\\\.)*?)",`, "gs");
    s = s.replace(re, (_m, prefix, value) => {
      const trimmed = value.trim();
      const escaped = trimmed
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r\n/g, "\\n")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t");
      return `${prefix}"${escaped}",`;
    });
  }

  return s;
}

/**
 * @param {string} text
 */
export function parseGeminiJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch (firstErr) {
    const repaired = repairGeminiJsonText(raw);
    try {
      const parsed = JSON.parse(repaired);
      log(
        `[Gemini] JSON reparado (${firstErr instanceof Error ? firstErr.message : firstErr})`,
      );
      return parsed;
    } catch (err) {
      const preview = repaired.length > 2400 ? `${repaired.slice(0, 2400)}…` : repaired;
      throw new Error(
        `Gemini returned invalid JSON (${err instanceof Error ? err.message : err}): ${preview}`,
      );
    }
  }
}

export async function generateWithGemini({ apiKey, prompt }) {
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const bodyLen =
    JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
    }).length;
  log(`[Gemini] enviando petición | model=${MODEL} | prompt_chars=${prompt.length} | request_json_chars≈${bodyLen}`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    logErr(`[Gemini] error HTTP ${response.status}`);
    throw new Error(`Gemini error ${response.status}: ${detail}`);
  }

  log(`[Gemini] HTTP ${response.status} (OK), parseando JSON del modelo…`);
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no content");
  }

  const parsed = parseGeminiJson(text);

  log(
    "[Gemini] respuesta OK | keys=",
    parsed && typeof parsed === "object" ? Object.keys(parsed).join(", ") : typeof parsed,
  );

  return parsed;
}
