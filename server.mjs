import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import http from "node:http";
import { URL } from "node:url";

const __root = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__root, ".env") });
import { categories, categoryIds } from "./src/domain/categories.mjs";
import { seedInputs } from "./src/domain/seed-inputs.mjs";
import { contents } from "./src/domain/contents.mjs";
import { log, logErr } from "./src/log.mjs";
import { createContentFromInput } from "./src/services/content-generator.mjs";

const PORT = Number(process.env.PORT) || 3001;
const BASE = "/rnd-word";

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

const testPageHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>rnd-word create-content</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 560px; margin: 2rem auto; padding: 0 1rem; }
    label { display: block; margin-top: 1rem; font-weight: 600; }
    input, select, textarea { width: 100%; box-sizing: border-box; margin-top: 0.35rem; padding: 0.5rem; }
    textarea { min-height: 88px; }
    button { margin-top: 1.25rem; padding: 0.6rem 1.2rem; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: wait; }
    pre { background: #111; color: #e2e8f0; padding: 1rem; overflow: auto; border-radius: 8px; margin-top: 1.5rem; }
    .hint { color: #64748b; font-size: 0.9rem; margin-top: 0.5rem; }
    .preview { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0; }
    .preview h2 { font-size: 1rem; margin: 0 0 0.75rem; }
    .preview-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
    @media (min-width: 880px) {
      .preview-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
    }
    .preview figure { margin: 0; }
    .preview figcaption { font-size: 0.75rem; color: #64748b; margin-bottom: 0.35rem; }
    .preview img { width: 100%; max-width: 360px; height: auto; border-radius: 10px; border: 1px solid #cbd5e1; display: block; margin: 0 auto; }
  </style>
</head>
<body>
  <h1>${BASE}/create-content</h1>
  <p class="hint">Modelo: gemini-2.5-flash-lite. Debes tener GEMINI_API_KEY en el entorno.</p>
  <form id="f" method="post" action="#">
    <label>word <input name="word" value="ROI" required /></label>
    <label>category
      <select name="category" required>
        ${categoryOptionsHtml}
      </select>
    </label>
    <label>context <textarea name="context" required>finance concept about investments</textarea></label>
    <button type="submit" id="btn-send">Enviar</button>
  </form>
  <pre id="out">Respuesta aquí...</pre>
  <section class="preview" id="preview" hidden></section>
  <script>
    const f = document.getElementById("f");
    const out = document.getElementById("out");
    const preview = document.getElementById("preview");
    const btn = document.getElementById("btn-send");

    function forPreDisplay(data) {
      if (data == null || typeof data !== "object") return data;
      const o = JSON.parse(JSON.stringify(data));
      if (o.images && typeof o.images === "object") {
        const im = o.images;
        ["hook_base64", "short_definition_base64", "extra_value_base64"].forEach(function (k) {
          if (typeof im[k] === "string") {
            im[k] = "[base64 " + im[k].length + " chars, ver imagenes abajo]";
          }
        });
      }
      return o;
    }

    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      preview.hidden = true;
      preview.innerHTML = "";
      out.textContent = "Enviando...";
      btn.disabled = true;

      const fd = new FormData(f);
      const body = {
        word: fd.get("word"),
        category: fd.get("category"),
        context: fd.get("context"),
      };

      try {
        const r = await fetch("${BASE}/create-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const text = await r.text();
        var data = null;
        try {
          data = JSON.parse(text);
        } catch (pe) {
          out.textContent =
            "HTTP " + r.status + " (JSON invalido en respuesta)\\n\\n" + text.slice(0, 8000);
          return;
        }

        out.textContent =
          "HTTP " + r.status + "\\n\\n" + JSON.stringify(forPreDisplay(data), null, 2);

        if (data.ok && data.images && data.images.mime) {
          var m = data.images.mime;
          var h = data.images.hook_base64;
          var s = data.images.short_definition_base64;
          var x = data.images.extra_value_base64;
          preview.innerHTML =
            '<h2>Tarjetas (hook / short / extra)</h2>' +
            '<div class="preview-grid">' +
            '<figure><figcaption>Hook</figcaption><img alt="Hook" src="data:' + m + ";base64," + h + '"></figure>' +
            '<figure><figcaption>Short definition</figcaption><img alt="Short" src="data:' + m + ";base64," + s + '"></figure>' +
            '<figure><figcaption>Extra value</figcaption><img alt="Extra" src="data:' + m + ";base64," + x + '"></figure>' +
            "</div>";
          preview.hidden = false;
        }
      } catch (err) {
        out.textContent = "Error de red o del navegador:\\n\\n" + (err && err.message ? err.message : String(err));
      } finally {
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>`;

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

  if (!pathname.startsWith(BASE)) {
    json(res, 404, { error: "Not found", hint: `Usa rutas bajo ${BASE}` });
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
        categories: `${origin}${BASE}/categories`,
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
    hint: `GET ${BASE}/docs | POST ${BASE}/create-content`,
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
  log(`Formulario   | ${origin}${BASE}/create-content`);
});
