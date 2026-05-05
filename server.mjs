import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import http from "node:http";
import { URL } from "node:url";
import busboy from "busboy";

const __root = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__root, ".env") });
import { categories, categoryIds } from "./src/rnd-word/domain/categories.mjs";
import { seedInputs } from "./src/rnd-word/domain/seed-inputs.mjs";
import { contents } from "./src/rnd-word/domain/contents.mjs";
import { log, logErr } from "./src/rnd-word/log.mjs";
import { createContentFromInput } from "./src/rnd-word/services/content-generator.mjs";
import { getPlaygroundHtml } from "./src/riseform/panel-html.mjs";
import { RISEFORM_STYLE_PRESETS, stylePhotoToRiseformCanvas } from "./src/riseform/photo-style.mjs";
import { generatePhraseImageVariants } from "./src/riseform/phrase-image-variants.mjs";
import { renderSolidTypographyPoster } from "./src/riseform/solid-typography-poster.mjs";
import {
  RISEFORM_WORD_VIDEO_PRESETS,
  renderRiseformWordTimelineVideos,
} from "./src/riseform/word-timeline-video.mjs";

const PORT = Number(process.env.PORT) || 3001;
const BASE = "/rnd-word";
const RISEFORM_BASE = "/riseform";

log(`[rnd-word] arrancando (PORT=${PORT})…`);

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function html(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const RISEFORM_ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/**
 * @returns {Promise<{ fileBuffer: Buffer | null; fileMime: string | null; fields: Record<string, string> }>}
 */
function parseMultipartRiseformPhoto(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: 15 * 1024 * 1024 },
    });
    const fields = /** @type {Record<string, string>} */ ({});
    let fileBuffer = null;
    let fileMime = null;

    bb.on("file", (name, file, info) => {
      if (name !== "photo") {
        file.resume();
        return;
      }
      const chunks = [];
      file.on("data", (d) => chunks.push(d));
      file.on("limit", () => {
        file.resume();
      });
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
        fileMime = info.mimeType || null;
      });
    });

    bb.on("field", (fieldname, val) => {
      fields[fieldname] = val;
    });

    bb.on("finish", () => {
      resolve({ fileBuffer, fileMime, fields });
    });
    bb.on("error", reject);
    req.pipe(bb);
  });
}

function openApiDocument(origin) {
  return {
    openapi: "3.0.3",
    info: {
      title: "rnd-word",
      version: "0.1.0",
      description: "Input -> seed_inputs -> Gemini -> contents",
    },
    servers: [{ url: origin }],
    paths: {
      [`${BASE}/categories`]: {
        get: {
          tags: ["catalog"],
          summary: "List categories",
          responses: { "200": { description: "OK" } },
        },
      },
      [`${BASE}/create-content`]: {
        post: {
          tags: ["content"],
          summary: "Create content via Gemini",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["word", "category", "context"],
                  properties: {
                    word: { type: "string", example: "ROI" },
                    category: {
                      type: "string",
                      enum: categories.map((c) => c.id),
                      example: "money",
                    },
                    context: { type: "string", example: "finance concept about investments" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Created" },
            "422": { description: "Validation error" },
            "502": { description: "Gemini error" },
          },
        },
      },
    },
  };
}

const categoryOptionsHtml = categories
  .map((c) => `<option value="${c.id}">${c.name}</option>`)
  .join("\n");

const swaggerUiHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>rnd-word docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" crossorigin />
  <style>body { margin: 0; } #swagger-ui { max-width: 100%; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.addEventListener("load", function () {
      window.ui = SwaggerUIBundle({
        url: window.location.origin + "${BASE}/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        tryItOutEnabled: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "StandaloneLayout",
      });
    });
  </script>
</body>
</html>`;

const testPageHtml = getPlaygroundHtml(BASE, RISEFORM_BASE, categoryOptionsHtml);

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  let pathname;
  try {
    pathname = new URL(req.url || "/", `http://${host}`).pathname;
  } catch {
    json(res, 400, { error: "URL invalida" });
    return;
  }
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);

  if (pathname.startsWith(RISEFORM_BASE)) {
    const rRoute = pathname.slice(RISEFORM_BASE.length) || "/";
    if (rRoute === "/" && req.method === "GET") {
      const origin = new URL(`http://${host}`).origin;
      json(res, 200, {
        service: "riseform",
        links: {
          style_photo: `${origin}${RISEFORM_BASE}/style-photo`,
          generate_phrase_images: `${origin}${RISEFORM_BASE}/generate-phrase-images`,
          typography_poster: `${origin}${RISEFORM_BASE}/typography-poster`,
          word_videos: `${origin}${RISEFORM_BASE}/word-videos`,
        },
        video_presets: RISEFORM_WORD_VIDEO_PRESETS,
      });
      return;
    }
    if (rRoute === "/style-photo" && req.method === "POST") {
      let parsed;
      try {
        parsed = await parseMultipartRiseformPhoto(req);
      } catch (error) {
        json(res, 400, {
          ok: false,
          error: "No se pudo leer multipart",
          detail: String(error.message || error),
        });
        return;
      }
      const { fileBuffer, fileMime, fields } = parsed;
      if (!fileBuffer || fileBuffer.length === 0) {
        json(res, 422, { ok: false, error: "Falta el archivo photo" });
        return;
      }
      if (!fileMime || !RISEFORM_ALLOWED_MIMES.has(fileMime)) {
        json(res, 415, {
          ok: false,
          error: "Formato de imagen no soportado",
          mime: fileMime,
          allowed: [...RISEFORM_ALLOWED_MIMES],
        });
        return;
      }
      const preset = fields.preset === "cover" ? "cover" : "profile";
      const bg = typeof fields.bg === "string" && fields.bg.trim() ? fields.bg.trim() : "#000000";
      const style = fields.style === "pad" ? "pad" : "chrome";
      const refontOn =
        fields.refont === "1" ||
        fields.refont === "true" ||
        fields.refont === "on" ||
        fields.refont === "yes";
      const styleOpts = { preset, background: bg, style, refont: refontOn };
      if (fields.tolerance !== undefined && String(fields.tolerance).trim() !== "") {
        const t = Number(fields.tolerance);
        if (Number.isFinite(t) && t >= 0 && t <= 120) {
          styleOpts.tolerance = t;
        }
      }
      try {
        const { png, retypeBlocks } = await stylePhotoToRiseformCanvas(fileBuffer, styleOpts);
        const dim = RISEFORM_STYLE_PRESETS[preset];
        log(
          "[riseform/style-photo] OK |",
          `${style} ${preset} refont=${refontOn} retype=${retypeBlocks} ${dim.width}x${dim.height} in=${fileBuffer.length} out=${png.length}`,
        );
        json(res, 200, {
          ok: true,
          riseform: {
            preset,
            style,
            refont: refontOn,
            retype_blocks: retypeBlocks,
            tolerance: styleOpts.tolerance ?? (style === "chrome" ? 48 : null),
            mime: "image/png",
            width: dim.width,
            height: dim.height,
            image_base64: png.toString("base64"),
          },
        });
      } catch (error) {
        logErr("[riseform/style-photo]", String(error.message || error));
        json(res, 502, {
          ok: false,
          error: "style-photo failed",
          detail: String(error.message || error),
        });
      }
      return;
    }
    if (rRoute === "/generate-phrase-images" && req.method === "POST") {
      let raw;
      try {
        raw = await readBody(req);
      } catch (error) {
        json(res, 400, { ok: false, error: "No se pudo leer el cuerpo" });
        return;
      }
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        json(res, 400, { ok: false, error: "JSON inválido" });
        return;
      }
      const phrase = typeof body.phrase === "string" ? body.phrase.trim() : "";
      if (!phrase) {
        json(res, 422, { ok: false, error: "Falta phrase (texto no vacío)" });
        return;
      }
      const maxRaw = body.max_images ?? body.maxImages;
      let maxImages = 18;
      if (maxRaw !== undefined && String(maxRaw).trim() !== "") {
        const m = Number(maxRaw);
        if (Number.isFinite(m) && m >= 1 && m <= 40) {
          maxImages = Math.floor(m);
        }
      }
      try {
        const result = await generatePhraseImageVariants(phrase, { maxImages });
        log(
          "[riseform/generate-phrase-images] OK |",
          `${result.bucket} words=${result.word_count} images=${result.images.length}`,
        );
        json(res, 200, {
          ok: true,
          riseform: {
            mode: "phrase_variants",
            bucket: result.bucket,
            word_count: result.word_count,
            phrase: result.phrase,
            canvas: RISEFORM_STYLE_PRESETS.profile,
            font: "Playfair Display",
            images: result.images,
          },
        });
      } catch (error) {
        logErr("[riseform/generate-phrase-images]", String(error.message || error));
        json(res, 502, {
          ok: false,
          error: "generate-phrase-images failed",
          detail: String(error.message || error),
        });
      }
      return;
    }
    if (rRoute === "/typography-poster" && req.method === "POST") {
      let raw;
      try {
        raw = await readBody(req);
      } catch (error) {
        json(res, 400, { ok: false, error: "No se pudo leer el cuerpo" });
        return;
      }
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        json(res, 400, { ok: false, error: "JSON inválido" });
        return;
      }
      const txt = typeof body.text === "string" ? body.text.trim() : "";
      if (!txt) {
        json(res, 422, { ok: false, error: "Falta text (cadena no vacía)" });
        return;
      }
      const w = Number(body.width ?? body.w ?? 512);
      const h = Number(body.height ?? body.h ?? 512);
      const width = Number.isFinite(w) && w >= 32 && w <= 4096 ? Math.round(w) : 512;
      const height = Number.isFinite(h) && h >= 32 && h <= 4096 ? Math.round(h) : 512;
      const paddingRatio =
        typeof body.padding_ratio === "number"
          ? body.padding_ratio
          : typeof body.paddingRatio === "number"
            ? body.paddingRatio
            : undefined;
      try {
        const png = await renderSolidTypographyPoster({
          text: txt,
          width,
          height,
          paddingRatio,
        });
        log("[riseform/typography-poster] OK |", `${width}x${height} out=${png.length}`);
        json(res, 200, {
          ok: true,
          riseform: {
            mode: "typography_poster",
            background: "#000000",
            text_style: "playfair_chrome_liquid",
            mime: "image/png",
            width,
            height,
            image_base64: png.toString("base64"),
          },
        });
      } catch (error) {
        logErr("[riseform/typography-poster]", String(error.message || error));
        json(res, 502, {
          ok: false,
          error: "typography-poster failed",
          detail: String(error.message || error),
        });
      }
      return;
    }
    if (rRoute === "/word-videos" && req.method === "POST") {
      let raw;
      try {
        raw = await readBody(req);
      } catch (error) {
        json(res, 400, { ok: false, error: "No se pudo leer el cuerpo" });
        return;
      }
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        json(res, 400, { ok: false, error: "JSON inválido" });
        return;
      }
      const txt = typeof body.text === "string" ? body.text.trim() : "";
      if (!txt) {
        json(res, 422, { ok: false, error: "Falta text (cadena no vacía)" });
        return;
      }
      const video_mode =
        body.video_mode === "staged" || body.video_mode === "groups" ? body.video_mode : "frames";
      const w = Number(body.width ?? body.w ?? 1080);
      const h = Number(body.height ?? body.h ?? 1920);
      const width = Number.isFinite(w) && w >= 64 && w <= 1920 ? Math.round(w) : 1080;
      const height = Number.isFinite(h) && h >= 64 && h <= 1920 ? Math.round(h) : 1920;
      let presets;
      if (Array.isArray(body.presets)) {
        presets = body.presets.filter((p) => typeof p === "string" && p in RISEFORM_WORD_VIDEO_PRESETS);
      }
      const groups = Array.isArray(body.groups) ? body.groups : undefined;
      try {
        const result = await renderRiseformWordTimelineVideos({
          text: txt,
          video_mode,
          width,
          height,
          presets: presets && presets.length ? presets : undefined,
          groups,
        });
        log(
          "[riseform/word-videos] OK |",
          `${result.video_mode} segments=${result.segments.length} videos=${result.videos.length} ${width}x${height}`,
        );
        json(res, 200, {
          ok: true,
          riseform: {
            mode: "word_timeline_videos",
            ...result,
            preset_catalog: RISEFORM_WORD_VIDEO_PRESETS,
          },
        });
      } catch (error) {
        const msg = String(error.message || error);
        const code = msg.includes("ffmpeg") ? 503 : 502;
        logErr("[riseform/word-videos]", msg);
        json(res, code, {
          ok: false,
          error: "word-videos failed",
          detail: msg,
        });
      }
      return;
    }
    json(res, 404, {
      error: "Not found",
      path: pathname,
      hint: `GET ${RISEFORM_BASE}/ | POST ${RISEFORM_BASE}/style-photo | POST ${RISEFORM_BASE}/generate-phrase-images | POST ${RISEFORM_BASE}/typography-poster | POST ${RISEFORM_BASE}/word-videos`,
    });
    return;
  }

  if (!pathname.startsWith(BASE)) {
    json(res, 404, {
      error: "Not found",
      hint: `Usa ${RISEFORM_BASE} (Riseform) o ${BASE} (rnd-word)`,
    });
    return;
  }

  const route = pathname.slice(BASE.length) || "/";

  if (route === "/" && req.method === "GET") {
    const origin = new URL(`http://${host}`).origin;
    json(res, 200, {
      service: "rnd-word",
      links: {
        docs: `${origin}${BASE}/docs`,
        openapi: `${origin}${BASE}/openapi.json`,
        form: `${origin}${BASE}/create-content`,
        playground: `${origin}${BASE}/create-content`,
        categories: `${origin}${BASE}/categories`,
        riseform: `${origin}${RISEFORM_BASE}/`,
        riseform_style_photo: `${origin}${RISEFORM_BASE}/style-photo`,
      },
    });
    return;
  }

  if (route === "/docs" && req.method === "GET") {
    html(res, 200, swaggerUiHtml);
    return;
  }

  if (route === "/openapi.json" && req.method === "GET") {
    const origin = new URL(`http://${host}`).origin;
    json(res, 200, openApiDocument(origin));
    return;
  }

  if (route === "/categories" && req.method === "GET") {
    json(res, 200, { categories });
    return;
  }

  if (route === "/seed-inputs" && req.method === "GET") {
    json(res, 200, { seed_inputs: seedInputs });
    return;
  }

  if (route === "/contents" && req.method === "GET") {
    json(res, 200, { contents });
    return;
  }

  if (route === "/create-content" && req.method === "GET") {
    html(res, 200, testPageHtml);
    return;
  }

  if (route === "/create-content" && req.method === "POST") {
    let raw;
    try {
      raw = await readBody(req);
    } catch (error) {
      json(res, 400, { error: "No se pudo leer el body", detail: String(error) });
      return;
    }

    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      json(res, 400, { error: "Body debe ser JSON valido" });
      return;
    }

    const { word, category, context } = payload;
    const missing = [];
    if (!word) missing.push("word");
    if (!category) missing.push("category");
    if (!context) missing.push("context");
    if (missing.length) {
      json(res, 422, { error: "Faltan campos obligatorios", missing });
      return;
    }

    if (!categoryIds.has(category)) {
      json(res, 422, {
        error: "category invalida",
        allowed: Array.from(categoryIds),
      });
      return;
    }

    const w = String(word).trim();
    const ctx = String(context).trim();
    const ctxPreview = ctx.length > 160 ? `${ctx.slice(0, 160)}…` : ctx;
    log(
      `[rnd-word/create-content] petición recibida | word="${w}" | category=${category} | context (${ctx.length} chars)=${JSON.stringify(ctxPreview)}`,
    );

    try {
      const result = await createContentFromInput({
        word: w,
        context: ctx,
        categoryId: String(category),
        geminiApiKey: process.env.GEMINI_API_KEY,
      });

      log(
        "[rnd-word/create-content] pipeline OK |",
        JSON.stringify({
          word: result.content.word,
          category_id: result.content.category_id,
          model: result.model,
          content_id: result.content.id,
        }),
      );

      json(res, 200, {
        ok: true,
        category: categories.find((c) => c.id === result.content.category_id),
        seed_input: result.seed_input,
        content: result.content,
        model: result.model,
        images: result.images,
      });
    } catch (error) {
      json(res, 502, {
        ok: false,
        error: "create-content failed",
        detail: String(error.message || error),
      });
    }
    return;
  }

  json(res, 404, {
    error: "Not found",
    path: pathname,
    hint: `GET ${BASE}/docs | GET ${BASE}/create-content`,
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logErr(
      `Puerto ${PORT} ya esta en uso (EADDRINUSE).\n` +
        `  - Cierra el otro servidor, o\n` +
        `  - PowerShell: $env:PORT=3002; npm start`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const origin = `http://localhost:${PORT}`;
  log(`Servidor arriba | ${origin}${BASE}/docs`);
  log(`Panel pruebas | ${origin}${BASE}/create-content`);
  log(`Riseform API | ${origin}${RISEFORM_BASE}/style-photo`);
});
