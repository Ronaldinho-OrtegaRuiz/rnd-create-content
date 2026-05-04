import { log, logErr } from "../log.mjs";

const MODEL = "gemini-2.5-flash-lite";

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

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${text}`);
  }

  log(
    "[Gemini] respuesta OK | keys=",
    parsed && typeof parsed === "object" ? Object.keys(parsed).join(", ") : typeof parsed,
  );

  return parsed;
}
