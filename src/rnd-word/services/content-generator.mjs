import { log } from "../log.mjs";
import { buildSlideshowMp4FromPngBuffers, renderDynamicContentPack } from "../lib/content-cards.mjs";
import { createSeedInput } from "../domain/seed-inputs.mjs";
import { createContent } from "../domain/contents.mjs";
import { buildGeminiPrompt } from "../prompts/gemini-content.mjs";
import { generateWithGemini } from "./gemini-client.mjs";

export async function createContentFromInput({ word, context, categoryId, geminiApiKey }) {
  const seedInput = createSeedInput({ word, context, categoryId });
  log(
    "[create-content] seed_input guardado |",
    JSON.stringify({ id: seedInput.id, category_id: seedInput.category_id, word: seedInput.word }),
  );

  const prompt = buildGeminiPrompt({ word, context });
  log(
    `[create-content] enviando a Gemini | prompt_chars=${prompt.length} | word=${JSON.stringify(word)}`,
  );

  const gemini = await generateWithGemini({
    apiKey: geminiApiKey,
    prompt,
  });

  const description = String(gemini?.description || "").trim();
  const extra = String(gemini?.extra || "").trim();
  const highlights = Array.isArray(gemini?.highlights)
    ? gemini.highlights.map((v) => String(v).trim()).filter(Boolean).slice(0, 2)
    : [];

  log(
    "[create-content] Gemini respondió |",
    JSON.stringify({
      description_preview: description.length > 120 ? `${description.slice(0, 120)}…` : description,
      extra_preview: extra.length > 120 ? `${extra.slice(0, 120)}…` : extra,
      highlights,
    }),
  );

  if (!description || !extra) {
    throw new Error("Gemini response missing description or extra");
  }

  const content = createContent({
    word,
    categoryId,
    description,
    extra,
    highlights,
  });
  log("[create-content] content guardado |", JSON.stringify({ id: content.id, status: content.status }));

  log(
    "[create-content] generando imágenes (hook, short_definition, extra_value) |",
    JSON.stringify({ categoryId, word }),
  );
  const pack = await renderDynamicContentPack({
    word,
    description,
    extra,
    highlights,
    categoryId,
  });

  const slideshow = await buildSlideshowMp4FromPngBuffers([
    pack.hook,
    pack.short_definition,
    pack.extra_value,
  ]);

  const images = {
    width: pack.width,
    height: pack.height,
    mime: "image/png",
    accent_color: pack.accent_color,
    hook_base64: pack.hook.toString("base64"),
    short_definition_base64: pack.short_definition.toString("base64"),
    extra_value_base64: pack.extra_value.toString("base64"),
    video_mime: "video/mp4",
    video_base64: slideshow ? slideshow.toString("base64") : null,
    video_available: Boolean(slideshow),
  };
  log(
    "[create-content] imágenes listas |",
    JSON.stringify({
      size_px: `${pack.width}x${pack.height}`,
      accent_color: pack.accent_color,
      hook_bytes: pack.hook.length,
      short_bytes: pack.short_definition.length,
      extra_bytes: pack.extra_value.length,
      video_bytes: slideshow ? slideshow.length : 0,
    }),
  );

  return {
    seed_input: seedInput,
    content,
    model: "gemini-2.5-flash-lite",
    images,
  };
}
