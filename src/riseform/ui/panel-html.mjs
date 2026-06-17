/**
 * Página de prueba del servidor: pestañas rnd-word (Gemini) y Riseform (foto → lienzo).
 * @param {string} rndBase ej. "/rnd-word"
 * @param {string} riseformBase ej. "/riseform" (API Riseform, independiente de rnd-word)
 * @param {string} pruebaVideoBase ej. "/prueba-video" (guion Gemini + MP4 estilo portada, temporal)
 * @param {string} categoryOptionsHtml opciones <option> para categorías
 */
export function getPlaygroundHtml(rndBase, riseformBase, pruebaVideoBase, categoryOptionsHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>rnd-word · Riseform</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.35rem; margin: 0 0 0.35rem; }
    label { display: block; margin-top: 1rem; font-weight: 600; }
    input, select, textarea { width: 100%; box-sizing: border-box; margin-top: 0.35rem; padding: 0.5rem; }
    textarea { min-height: 88px; }
    button { margin-top: 1.25rem; padding: 0.6rem 1.2rem; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: wait; }
    pre { background: #111; color: #e2e8f0; padding: 1rem; overflow: auto; border-radius: 8px; margin-top: 1.5rem; font-size: 0.8rem; }
    .hint { color: #64748b; font-size: 0.9rem; margin-top: 0.5rem; }
    .tabs {
      display: flex;
      gap: 0.5rem;
      margin: 1.25rem 0 0;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 0;
      flex-wrap: wrap;
      position: relative;
      z-index: 50;
      isolation: isolate;
    }
    .tabs .tab {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-bottom: none;
      padding: 0.5rem 1rem;
      border-radius: 8px 8px 0 0;
      cursor: pointer;
      font-size: 0.95rem;
      position: relative;
      z-index: 51;
      -webkit-tap-highlight-color: transparent;
    }
    .tabs .tab.active { background: #fff; font-weight: 600; border-bottom: 1px solid #fff; margin-bottom: -1px; }
    .panel-title { font-size: 1.05rem; margin: 1rem 0 0.5rem; }
    .tab-panel { margin-bottom: 1rem; }
    .preview { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0; }
    .preview h2 { font-size: 1rem; margin: 0 0 0.75rem; }
    .preview-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
    @media (min-width: 880px) {
      .preview-grid:not(.preview-grid--rise) { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
    }
    .preview figure { margin: 0; }
    .preview figcaption { font-size: 0.75rem; color: #64748b; margin-bottom: 0.35rem; }
    .preview img { width: 100%; max-width: 360px; height: auto; border-radius: 10px; border: 1px solid #cbd5e1; display: block; margin: 0 auto; }
    .preview-grid--rise img { max-width: min(720px, 100%); }
    .preview-grid--phrase { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem; max-width: 100%; }
    .preview-grid--phrase img { max-width: 100%; }
    .rise-modes { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
    .rise-modes label { display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 600; margin-top: 0; width: auto; cursor: pointer; }
    .rise-mode-panel[hidden] { display: none !important; }
    .preview-video-wrap { margin-top: 0.5rem; max-width: 100%; }
    .preview-video-wrap video { width: 100%; max-width: 100%; display: block; border-radius: 10px; border: 1px solid #cbd5e1; background: #000; }
    .preview-video-wrap .hint { font-size: 0.8rem; margin-top: 0.35rem; text-align: center; }
    .preview-videos-dual { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; align-items: start; }
    .preview-videos-dual figure { margin: 0; min-width: 0; }
    .preview-videos-quad { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; align-items: start; }
    .preview-videos-quad figure { margin: 0; min-width: 0; }
    .preview-videos-quad .video-vertical video { max-height: min(52vh, 520px); width: auto; max-width: 100%; margin: 0 auto; }
    .preview-section-label { font-size: 0.85rem; font-weight: 700; color: #475569; margin: 1rem 0 0.5rem; grid-column: 1 / -1; }
    @media (max-width: 900px) {
      .preview-videos-dual, .preview-videos-quad { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <h1>rnd-word · Riseform</h1>
  <p class="hint">Pestaña <strong>rnd-word</strong>: Gemini + tarjetas. <strong>Riseform</strong>: imagen, frases, póster, vídeos timeline. <strong>prueba-video</strong>: concepto → guion ES+EN → <strong>4 MP4</strong> (fractal + texto + <strong>lofi procedural</strong>).</p>
  <div class="tabs" role="tablist">
    <button type="button" class="tab active" data-tab="rnd" role="tab" aria-selected="true">rnd-word (Gemini)</button>
    <button type="button" class="tab" data-tab="rise" role="tab" aria-selected="false">Riseform (foto)</button>
    <button type="button" class="tab" data-tab="pv" role="tab" aria-selected="false">prueba-video</button>
  </div>

  <section id="panel-rnd" class="tab-panel" role="tabpanel">
    <h2 class="panel-title">${rndBase}/create-content</h2>
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
  </section>

  <section id="panel-rise" class="tab-panel" hidden role="tabpanel">
    <div class="rise-modes" role="group" aria-label="Modo Riseform">
      <label><input type="radio" name="rise_mode" value="photo" checked /> Refactor imagen</label>
      <label><input type="radio" name="rise_mode" value="phrase" /> Frase → variantes</label>
      <label><input type="radio" name="rise_mode" value="poster" /> Póster tipográfico</label>
      <label><input type="radio" name="rise_mode" value="video" /> Vídeos (timeline)</label>
    </div>

    <div id="rise-mode-photo" class="rise-mode-panel">
      <h2 class="panel-title">${riseformBase}/style-photo</h2>
      <p class="hint">
        Fijo: perfil <strong>512×512</strong>, gradiente Riseform, tolerancia <strong>48</strong>, fondo <strong>negro</strong>. API: <code>POST ${riseformBase}/style-photo</code>.
      </p>
      <form id="form-rise" method="post" enctype="multipart/form-data" action="#">
        <input type="hidden" name="preset" value="profile" />
        <input type="hidden" name="style" value="chrome" />
        <input type="hidden" name="tolerance" value="48" />
        <input type="hidden" name="bg" value="#000000" />
        <label>Imagen <input type="file" name="photo" accept="image/*" required /></label>
        <label style="display:flex;align-items:center;gap:0.5rem;font-weight:600;">
          <input type="checkbox" name="refont" value="1" style="width:auto;margin:0;" />
          Retipografíar texto (OCR) con Playfair + gradiente Riseform
        </label>
        <p class="hint" style="margin-top:0.5rem;">OCR + borrado por cajas; puede afectar dibujos si la caja los toca.</p>
        <button type="submit" id="btn-rise">Generar PNG</button>
      </form>
    </div>

    <div id="rise-mode-phrase" class="rise-mode-panel" hidden>
      <h2 class="panel-title">${riseformBase}/generate-phrase-images</h2>
      <p class="hint">
        Clasifica por número de palabras (short / medium / long / extra_long) y genera <strong>varias PNG 512×512</strong> con <strong>Playfair Display</strong> y el mismo gradiente cromo Riseform. Opcional: <code>max_images</code> (1–40, por defecto 18).
      </p>
      <form id="form-rise-phrase" method="post" action="#">
        <label>Frase <textarea name="phrase" rows="3" placeholder="Discipline beats motivation" required></textarea></label>
        <label>Máx. imágenes <input type="number" name="max_images" min="1" max="40" value="18" /></label>
        <button type="submit" id="btn-rise-phrase">Generar variantes</button>
      </form>
    </div>

    <div id="rise-mode-poster" class="rise-mode-panel" hidden>
      <h2 class="panel-title">${riseformBase}/typography-poster</h2>
      <p class="hint">
        <strong>Fondo negro fijo</strong>. Texto <strong>Playfair</strong> con el mismo gradiente <strong>Chrome + Liquid</strong> que perfil/portada Riseform. Tamaño de letra automático, centrado. (No usa la foto de otros modos.)
      </p>
      <form id="form-rise-poster" method="post" action="#">
        <label>Texto <textarea name="text" rows="4" placeholder="Tu mensaje en varias líneas si hace falta." required></textarea></label>
        <label>Ancho (px) <input type="number" name="width" min="32" max="4096" value="512" /></label>
        <label>Alto (px) <input type="number" name="height" min="32" max="4096" value="512" /></label>
        <button type="submit" id="btn-rise-poster">Generar póster PNG</button>
      </form>
    </div>

    <div id="rise-mode-video" class="rise-mode-panel" hidden>
      <h2 class="panel-title">${riseformBase}/word-videos</h2>
      <p class="hint">
        Mismo look Riseform: <strong>negro + Playfair + Chrome/Liquid</strong>. Por defecto <strong>1080×1920 (9:16)</strong>. En <strong>frames</strong>, el <strong>tamaño de la letra</strong> se calcula como en el perfil <strong>512×512</strong> (misma escala que la foto de perfil). Cada MP4: <strong>1 s de negro</strong> al inicio y al final. Requiere <strong>ffmpeg</strong> (<code>ffmpeg-static</code>).
      </p>
      <form id="form-rise-video" method="post" action="#">
        <label>Texto <textarea name="video_text" rows="3" placeholder="Yesterday you said tomorrow" required></textarea></label>
        <label>Modo vídeo
          <select name="video_mode">
            <option value="frames">Palabra centrada (misma escala de fuente que perfil 512×512, vídeo 9:16)</option>
            <option value="staged">Póster fijo: cada línea pasa de negro al gradiente (varios fotogramas por palabra)</option>
            <option value="groups">Bloques (comas en el texto, o líneas de “Grupos” abajo)</option>
          </select>
        </label>
        <label>Grupos (solo modo bloques; una frase por línea; opcional si ya usas comas en el texto)
          <textarea name="video_groups" rows="2" placeholder="Una linea por grupo si quieres forzar bloques"></textarea>
        </label>
        <label>Ancho (px) <input type="number" name="video_w" min="64" max="1920" value="1080" /></label>
        <label>Alto (px) <input type="number" name="video_h" min="64" max="1920" value="1920" /></label>
        <fieldset style="border:1px solid #cbd5e1;border-radius:8px;padding:0.75rem;margin-top:1rem;">
          <legend style="font-weight:600">Presets a generar</legend>
          <label style="margin-top:0.5rem;"><input type="checkbox" name="preset_smooth" value="1" checked /> smooth (fade 1.0)</label>
          <label><input type="checkbox" name="preset_fast" value="1" checked /> fast (cut 0.6)</label>
          <label><input type="checkbox" name="preset_flow" value="1" checked /> flow (slide 0.9)</label>
          <label><input type="checkbox" name="preset_impact" value="1" checked /> impact (zoom 0.8)</label>
          <label><input type="checkbox" name="preset_calm" value="1" checked /> calm (fade 1.4)</label>
        </fieldset>
        <button type="submit" id="btn-rise-video">Generar vídeos MP4</button>
      </form>
    </div>
  </section>

  <section id="panel-pv" class="tab-panel" hidden role="tabpanel">
    <h2 class="panel-title">${pruebaVideoBase}/generate</h2>
    <p class="hint">
      <code>POST ${pruebaVideoBase}/generate</code> con <code>concept</code>. Largo <strong>16:9</strong> + short <strong>9:16</strong> (ES+EN). Intro marca + fractales + outro + <strong>audio lofi</strong> (según concepto). Puede tardar <strong>mucho</strong>; no cierres la pestaña.
    </p>
    <form id="form-prueba-video" method="post" action="#">
      <label>Concepto <textarea name="concept" rows="4" placeholder="Ej.: La resiliencia después de un fracaso" required></textarea></label>
      <label style="display:flex;align-items:center;gap:0.5rem;font-weight:600;">
        <input type="checkbox" name="preview" value="1" checked style="width:auto;margin:0;" />
        Largo al mínimo 2:45 (marcado). Desmarca para objetivo ~5:00
      </label>
      <label style="display:flex;align-items:center;gap:0.5rem;font-weight:600;">
        <input type="checkbox" name="include_video" value="1" checked style="width:auto;margin:0;" />
        Generar MP4 (desmarcar = solo guion JSON)
      </label>
      <button type="submit" id="btn-prueba-video">Generar guion + 4 vídeos (fractal + lofi)</button>
    </form>
  </section>

  <pre id="out">Respuesta aquí...</pre>
  <section class="preview" id="preview" hidden></section>

  <script>
    const RND_BASE = "${rndBase}";
    const RISEFORM_API = "${riseformBase}";
    const PRUEBA_VIDEO_API = "${pruebaVideoBase}";
    const f = document.getElementById("f");
    const formRise = document.getElementById("form-rise");
    const formRisePhrase = document.getElementById("form-rise-phrase");
    const formRisePoster = document.getElementById("form-rise-poster");
    const formRiseVideo = document.getElementById("form-rise-video");
    const out = document.getElementById("out");
    const preview = document.getElementById("preview");
    const btn = document.getElementById("btn-send");
    const btnRise = document.getElementById("btn-rise");
    const btnRisePhrase = document.getElementById("btn-rise-phrase");
    const btnRisePoster = document.getElementById("btn-rise-poster");
    const btnRiseVideo = document.getElementById("btn-rise-video");
    const formPruebaVideo = document.getElementById("form-prueba-video");
    const btnPruebaVideo = document.getElementById("btn-prueba-video");
    const panelPhoto = document.getElementById("rise-mode-photo");
    const panelPhrase = document.getElementById("rise-mode-phrase");
    const panelPoster = document.getElementById("rise-mode-poster");
    const panelVideo = document.getElementById("rise-mode-video");
    var previewBlobUrls = [];

    function revokePreviewBlobUrls() {
      previewBlobUrls.forEach(function (u) {
        try { URL.revokeObjectURL(u); } catch (e) {}
      });
      previewBlobUrls = [];
    }

    function mp4BlobUrlFromBase64(b64, mime) {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var blob = new Blob([bytes], { type: mime || "video/mp4" });
      var url = URL.createObjectURL(blob);
      previewBlobUrls.push(url);
      return url;
    }

    function syncVideoCanvasDefaults() {
      if (!formRiseVideo) return;
      var wEl = formRiseVideo.querySelector('[name="video_w"]');
      var hEl = formRiseVideo.querySelector('[name="video_h"]');
      if (!wEl || !hEl) return;
      wEl.value = "1080";
      hEl.value = "1920";
    }

    function syncRiseModePanels() {
      var sel = document.querySelector('input[name="rise_mode"]:checked');
      var v = sel ? sel.getAttribute("value") : "photo";
      if (!panelPhoto || !panelPhrase || !panelPoster || !panelVideo) return;
      panelPhoto.hidden = v !== "photo";
      panelPhrase.hidden = v !== "phrase";
      panelPoster.hidden = v !== "poster";
      panelVideo.hidden = v !== "video";
      if (v === "video") syncVideoCanvasDefaults();
    }

    if (formRiseVideo) {
      var vmSel = formRiseVideo.querySelector('[name="video_mode"]');
      if (vmSel) vmSel.addEventListener("change", syncVideoCanvasDefaults);
    }

    document.querySelectorAll('input[name="rise_mode"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        syncRiseModePanels();
        out.textContent = "Respuesta aquí...";
        preview.hidden = true;
        preview.innerHTML = "";
      });
    });

    document.querySelectorAll(".tab").forEach(function (btnTab) {
      btnTab.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          var tab = btnTab.getAttribute("data-tab");
          document.querySelectorAll(".tab").forEach(function (b) {
            b.classList.toggle("active", b === btnTab);
            b.setAttribute("aria-selected", b === btnTab ? "true" : "false");
          });
          var panelRnd = document.getElementById("panel-rnd");
          var panelRise = document.getElementById("panel-rise");
          var panelPv = document.getElementById("panel-pv");
          if (panelRnd) panelRnd.hidden = tab !== "rnd";
          if (panelRise) panelRise.hidden = tab !== "rise";
          if (panelPv) panelPv.hidden = tab !== "pv";
          if (tab === "rise") {
            var photoRadio = document.querySelector('input[name="rise_mode"][value="photo"]');
            if (photoRadio) photoRadio.checked = true;
            syncRiseModePanels();
          }
          out.textContent = "Respuesta aquí...";
          preview.hidden = true;
          preview.innerHTML = "";
        },
        false,
      );
    });

    function forPreDisplay(data) {
      if (data == null || typeof data !== "object") return data;
      var o = JSON.parse(JSON.stringify(data));
      if (o.images && typeof o.images === "object") {
        var im = o.images;
        ["hook_base64", "short_definition_base64", "extra_value_base64", "video_base64"].forEach(function (k) {
          if (typeof im[k] === "string" && im[k]) {
            im[k] = "[base64 " + im[k].length + " chars, ver previsualizacion abajo]";
          }
        });
      }
      if (o.riseform && typeof o.riseform.image_base64 === "string" && o.riseform.image_base64) {
        o.riseform = JSON.parse(JSON.stringify(o.riseform));
        o.riseform.image_base64 = "[base64 " + o.riseform.image_base64.length + " chars, ver imagen abajo]";
      }
      if (o.riseform && Array.isArray(o.riseform.images)) {
        o.riseform = JSON.parse(JSON.stringify(o.riseform));
        o.riseform.images = o.riseform.images.map(function (im) {
          var c = Object.assign({}, im);
          if (typeof c.image_base64 === "string" && c.image_base64) {
            c.image_base64 = "[base64 " + c.image_base64.length + " chars]";
          }
          return c;
        });
      }
      if (o.riseform && Array.isArray(o.riseform.videos)) {
        o.riseform = JSON.parse(JSON.stringify(o.riseform));
        o.riseform.videos = o.riseform.videos.map(function (v) {
          var c = Object.assign({}, v);
          if (typeof c.video_base64 === "string" && c.video_base64) {
            c.video_base64 = "[base64 " + c.video_base64.length + " chars]";
          }
          return c;
        });
      }
      if (o.prueba_video && o.prueba_video.videos && typeof o.prueba_video.videos === "object") {
        o.prueba_video = JSON.parse(JSON.stringify(o.prueba_video));
        function maskVid(v) {
          if (v && typeof v.video_base64 === "string" && v.video_base64) {
            v.video_base64 = "[base64 " + v.video_base64.length + " chars]";
          }
        }
        var vids = o.prueba_video.videos;
        if (vids.long) ["es", "en"].forEach(function (lang) { maskVid(vids.long[lang]); });
        if (vids.short) ["es", "en"].forEach(function (lang) { maskVid(vids.short[lang]); });
        ["es", "en"].forEach(function (lang) { maskVid(vids[lang]); });
      }
      return o;
    }

    if (f) f.addEventListener("submit", async function (e) {
      e.preventDefault();
      preview.hidden = true;
      preview.innerHTML = "";
      out.textContent = "Enviando...";
      if (btn) btn.disabled = true;

      var fd = new FormData(f);
      var body = {
        word: fd.get("word"),
        category: fd.get("category"),
        context: fd.get("context"),
      };

      try {
        var r = await fetch(RND_BASE + "/create-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        var text = await r.text();
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
          var vid = data.images.video_base64;
          var vm = data.images.video_mime || "video/mp4";
          var videoSection = "";
          if (data.images.video_available && typeof vid === "string" && vid) {
            videoSection =
              '<h2>Vídeo (hook → short definition → extra value, 2s + 3s + 3s)</h2>' +
              '<div class="preview-video-wrap">' +
              '<video controls playsinline preload="metadata" src="data:' +
              vm +
              ";base64," +
              vid +
              '"></video>' +
              '<p class="hint">Mismas tres imágenes que arriba, en secuencia (2s + 3s + 3s, transición suave).</p>' +
              "</div>";
          } else {
            videoSection =
              '<p class="hint" style="margin-top:1rem">Vídeo no generado (revisa el log del servidor). Las tres PNG siguen disponibles arriba.</p>';
          }
          preview.innerHTML =
            '<h2>Tarjetas PNG (Gemini + categoría)</h2>' +
            '<div class="preview-grid">' +
            '<figure><figcaption>Hook</figcaption><img alt="Hook" src="data:' + m + ";base64," + h + '"></figure>' +
            '<figure><figcaption>Short definition</figcaption><img alt="Short" src="data:' + m + ";base64," + s + '"></figure>' +
            '<figure><figcaption>Extra value</figcaption><img alt="Extra" src="data:' + m + ";base64," + x + '"></figure>' +
            "</div>" +
            videoSection;
          preview.hidden = false;
        }
      } catch (err) {
        out.textContent = "Error de red o del navegador:\\n\\n" + (err && err.message ? err.message : String(err));
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    if (formRise) formRise.addEventListener("submit", async function (e) {
      e.preventDefault();
      preview.hidden = true;
      preview.innerHTML = "";
      out.textContent = "Subiendo...";
      btnRise.disabled = true;
      try {
        var fd = new FormData(formRise);
        var r = await fetch(RISEFORM_API + "/style-photo", {
          method: "POST",
          body: fd,
        });
        var text = await r.text();
        var data = null;
        try {
          data = JSON.parse(text);
        } catch (pe) {
          out.textContent = "HTTP " + r.status + "\\n\\n" + text.slice(0, 8000);
          return;
        }
        out.textContent = "HTTP " + r.status + "\\n\\n" + JSON.stringify(forPreDisplay(data), null, 2);
        if (data.ok && data.riseform && data.riseform.image_base64) {
          var rf = data.riseform;
          preview.innerHTML =
            '<h2>Imagen Riseform</h2>' +
            '<div class="preview-grid preview-grid--rise">' +
            '<figure><figcaption>' +
            (rf.style || "pad") +
            " · " +
            rf.preset +
            " · " +
            rf.width +
            "×" +
            rf.height +
            '</figcaption><img alt="Riseform" src="data:' +
            rf.mime +
            ";base64," +
            rf.image_base64 +
            '" /></figure></div>';
          preview.hidden = false;
        }
      } catch (err) {
        out.textContent = "Error: " + (err && err.message ? err.message : String(err));
      } finally {
        if (btnRise) btnRise.disabled = false;
      }
    });

    if (formRisePhrase) formRisePhrase.addEventListener("submit", async function (e) {
      e.preventDefault();
      preview.hidden = true;
      preview.innerHTML = "";
      out.textContent = "Generando variantes...";
      btnRisePhrase.disabled = true;
      try {
        var fd = new FormData(formRisePhrase);
        var phrase = (fd.get("phrase") || "").trim();
        var maxRaw = fd.get("max_images");
        var body = { phrase: phrase };
        if (maxRaw !== null && String(maxRaw).trim() !== "") {
          var mi = parseInt(String(maxRaw), 10);
          if (!isNaN(mi) && mi >= 1 && mi <= 40) body.max_images = mi;
        }
        var r = await fetch(RISEFORM_API + "/generate-phrase-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        var text = await r.text();
        var data = null;
        try {
          data = JSON.parse(text);
        } catch (pe) {
          out.textContent = "HTTP " + r.status + "\\n\\n" + text.slice(0, 8000);
          return;
        }
        out.textContent = "HTTP " + r.status + "\\n\\n" + JSON.stringify(forPreDisplay(data), null, 2);
        if (data.ok && data.riseform && Array.isArray(data.riseform.images) && data.riseform.images.length) {
          var rf = data.riseform;
          var parts = rf.images
            .map(function (im) {
              return (
                '<figure><figcaption>' +
                (im.label || im.id || "") +
                '</figcaption><img alt="" src="data:' +
                im.mime +
                ";base64," +
                im.image_base64 +
                '" /></figure>'
              );
            })
            .join("");
          preview.innerHTML =
            '<h2>Variantes (' +
            rf.bucket +
            " · " +
            rf.word_count +
            ' palabras)</h2><div class="preview-grid preview-grid--phrase">' +
            parts +
            "</div>";
          preview.hidden = false;
        }
      } catch (err) {
        out.textContent = "Error: " + (err && err.message ? err.message : String(err));
      } finally {
        if (btnRisePhrase) btnRisePhrase.disabled = false;
      }
    });

    if (formRisePoster) formRisePoster.addEventListener("submit", async function (e) {
      e.preventDefault();
      preview.hidden = true;
      preview.innerHTML = "";
      out.textContent = "Generando póster...";
      if (btnRisePoster) btnRisePoster.disabled = true;
      try {
        var fd = new FormData(formRisePoster);
        var posterText = (fd.get("text") || "").trim();
        var pw = parseInt(String(fd.get("width") || "512"), 10);
        var ph = parseInt(String(fd.get("height") || "512"), 10);
        var payload = { text: posterText, width: pw, height: ph };
        var rp = await fetch(RISEFORM_API + "/typography-poster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        var rawJson = await rp.text();
        var dataP = null;
        try {
          dataP = JSON.parse(rawJson);
        } catch (pe) {
          out.textContent = "HTTP " + rp.status + "\\n\\n" + rawJson.slice(0, 8000);
          return;
        }
        out.textContent = "HTTP " + rp.status + "\\n\\n" + JSON.stringify(forPreDisplay(dataP), null, 2);
        if (dataP.ok && dataP.riseform && dataP.riseform.image_base64) {
          var rpForm = dataP.riseform;
          preview.innerHTML =
            '<h2>Póster tipográfico</h2>' +
            '<div class="preview-grid preview-grid--rise">' +
            '<figure><figcaption>' +
            rpForm.width +
            "×" +
            rpForm.height +
            ' · typography_poster</figcaption><img alt="Póster" src="data:' +
            rpForm.mime +
            ";base64," +
            rpForm.image_base64 +
            '" /></figure></div>';
          preview.hidden = false;
        }
      } catch (err) {
        out.textContent = "Error: " + (err && err.message ? err.message : String(err));
      } finally {
        if (btnRisePoster) btnRisePoster.disabled = false;
      }
    });

    if (formRiseVideo) formRiseVideo.addEventListener("submit", async function (e) {
      e.preventDefault();
      preview.hidden = true;
      preview.innerHTML = "";
      out.textContent = "Generando vídeos (puede tardar)...";
      if (btnRiseVideo) btnRiseVideo.disabled = true;
      try {
        var fdv = new FormData(formRiseVideo);
        var vtext = (fdv.get("video_text") || "").trim();
        var vm = (fdv.get("video_mode") || "frames").trim();
        var vw = parseInt(String(fdv.get("video_w") || "1080"), 10);
        var vh = parseInt(String(fdv.get("video_h") || "1920"), 10);
        var presetKeys = [];
        if (fdv.get("preset_smooth")) presetKeys.push("smooth");
        if (fdv.get("preset_fast")) presetKeys.push("fast");
        if (fdv.get("preset_flow")) presetKeys.push("flow");
        if (fdv.get("preset_impact")) presetKeys.push("impact");
        if (fdv.get("preset_calm")) presetKeys.push("calm");
        if (presetKeys.length === 0) presetKeys = ["smooth"];
        var groupsRaw = (fdv.get("video_groups") || "").trim();
        var groupsLines = groupsRaw
          ? groupsRaw.split(/\\r?\\n/).map(function (s) { return s.trim(); }).filter(Boolean)
          : [];
        var bodyV = {
          text: vtext,
          video_mode: vm === "staged" || vm === "groups" ? vm : "frames",
          width: vw,
          height: vh,
          presets: presetKeys,
        };
        if (vm === "groups" && groupsLines.length) bodyV.groups = groupsLines;
        var rv = await fetch(RISEFORM_API + "/word-videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyV),
        });
        var rawV = await rv.text();
        var dataV = null;
        try {
          dataV = JSON.parse(rawV);
        } catch (pe2) {
          out.textContent = "HTTP " + rv.status + "\\n\\n" + rawV.slice(0, 8000);
          return;
        }
        out.textContent = "HTTP " + rv.status + "\\n\\n" + JSON.stringify(forPreDisplay(dataV), null, 2);
        if (dataV.ok && dataV.riseform && Array.isArray(dataV.riseform.videos) && dataV.riseform.videos.length) {
          var rfV = dataV.riseform;
          var vidParts = rfV.videos
            .map(function (item) {
              return (
                '<figure><figcaption>' +
                item.preset +
                " · " +
                (item.transition || "") +
                " · speed " +
                String(item.speed) +
                '</figcaption><div class="preview-video-wrap"><video controls playsinline preload="metadata" src="data:' +
                (item.mime || "video/mp4") +
                ";base64," +
                item.video_base64 +
                '"></video></div></figure>'
              );
            })
            .join("");
          preview.innerHTML =
            '<h2>Vídeos timeline (' +
            (rfV.video_mode || "") +
            " · " +
            rfV.segments.length +
            ' segmentos)</h2><div class="preview-grid preview-grid--rise">' +
            vidParts +
            "</div>";
          preview.hidden = false;
        }
      } catch (errV) {
        out.textContent = "Error: " + (errV && errV.message ? errV.message : String(errV));
      } finally {
        if (btnRiseVideo) btnRiseVideo.disabled = false;
      }
    });

    if (formPruebaVideo) formPruebaVideo.addEventListener("submit", async function (e) {
      e.preventDefault();
      revokePreviewBlobUrls();
      preview.hidden = true;
      preview.innerHTML = "";
      var pvStarted = Date.now();
      var pvTimer = setInterval(function () {
        var sec = Math.floor((Date.now() - pvStarted) / 1000);
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        out.textContent =
          "Gemini (guion ES+EN) + fractales + lofi + intro/outro marca… " +
          (m > 0 ? m + " min " : "") +
          s +
          " s (no cierres la pestaña)";
      }, 1000);
      out.textContent = "Gemini (guion ES+EN) + intro/outro + 4 vídeos… 0 s";
      if (btnPruebaVideo) btnPruebaVideo.disabled = true;
      try {
        var fdp = new FormData(formPruebaVideo);
        var bodyP = {
          concept: String(fdp.get("concept") || "").trim(),
          preview: !!fdp.get("preview"),
          include_video: !!fdp.get("include_video"),
        };
        var rp = await fetch(PRUEBA_VIDEO_API + "/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyP),
        });
        var rawP = await rp.text();
        var dataP = null;
        try {
          dataP = JSON.parse(rawP);
        } catch (pe3) {
          out.textContent = "HTTP " + rp.status + "\\n\\n" + rawP.slice(0, 8000);
          return;
        }
        out.textContent = "HTTP " + rp.status + "\\n\\n" + JSON.stringify(forPreDisplay(dataP), null, 2);
        if (dataP.ok && dataP.prueba_video && dataP.prueba_video.videos) {
          var pv = dataP.prueba_video;
          var vids = pv.videos;
          function videoBlock(bucket, lang, label, vertical) {
            var v = bucket && bucket[lang] ? bucket[lang] : null;
            if (!v || !v.video_base64) {
              return (
                '<figure class="' +
                (vertical ? "video-vertical" : "") +
                '"><figcaption><strong>' +
                label +
                '</strong></figcaption><p class="hint">Sin vídeo.</p></figure>'
              );
            }
            var scr = pv.script && pv.script[lang] ? pv.script[lang] : null;
            var title =
              vertical && scr && scr.short_title
                ? scr.short_title
                : scr && scr.title
                  ? scr.title
                  : lang;
            var src = mp4BlobUrlFromBase64(v.video_base64, v.mime || "video/mp4");
            return (
              '<figure class="' +
              (vertical ? "video-vertical" : "") +
              '"><figcaption><strong>' +
              label +
              "</strong> · " +
              title +
              " · " +
              (v.duration_sec || "?") +
              " s · " +
              v.width +
              "×" +
              v.height +
              '</figcaption><div class="preview-video-wrap"><video controls playsinline preload="metadata" src="' +
              src +
              '"></video></div></figure>'
            );
          }
          var longBucket = vids.long || vids;
          var shortBucket = vids.short || null;
          preview.innerHTML =
            "<h2>prueba-video · 4 vídeos (fractal + lofi)</h2>" +
            '<div class="preview-videos-quad">' +
            '<p class="preview-section-label">Largo (16:9 · 1920×1080)</p>' +
            videoBlock(longBucket, "es", "ES largo", false) +
            videoBlock(longBucket, "en", "EN largo", false) +
            '<p class="preview-section-label">Short vertical (Reels / TikTok, ~30 s, 26–34 s)</p>' +
            (shortBucket
              ? videoBlock(shortBucket, "es", "ES short", true) + videoBlock(shortBucket, "en", "EN short", true)
              : '<p class="hint">Sin shorts en la respuesta (actualiza el servidor).</p>') +
            "</div>" +
            '<p class="hint">Guion en JSON: script.es.slides / short_slides · transición ' +
            (longBucket.es && longBucket.es.transition_fade_sec
              ? longBucket.es.transition_fade_sec + " s dissolve"
              : "dissolve") +
            "</p>";
          preview.hidden = false;
        }
      } catch (errP) {
        out.textContent = "Error: " + (errP && errP.message ? errP.message : String(errP));
      } finally {
        clearInterval(pvTimer);
        if (btnPruebaVideo) btnPruebaVideo.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
