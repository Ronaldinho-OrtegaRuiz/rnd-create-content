import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { riseformGradientBoxes } from "./chrome-raster.mjs";
import { accentGradientDefs, chromePathNoBorder } from "./riseform-chrome-svg.mjs";
import {
  buildPlayfairWordPathD,
  buildPlayfairPathLeft,
  measureTextWidth,
} from "./playfair-display-font.mjs";

export const PHRASE_CANVAS = { width: 512, height: 512 };

/** @param {number} wordCount */
export function classifyPhraseLength(wordCount) {
  if (wordCount <= 6) return "short";
  if (wordCount <= 10) return "medium";
  if (wordCount <= 15) return "long";
  return "extra_long";
}

/** @param {string} phrase */
export function tokenizePhrase(phrase) {
  return phrase.trim().split(/\s+/).filter(Boolean);
}

function nid() {
  return `rf_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
}

function mutedPath(pathD) {
  const d = pathD.replace(/&/g, "&amp;");
  return `<path d="${d}" fill="#9ca3af" fill-opacity="0.92" stroke="none"/>`;
}

function wrapSvg(W, H, defsAndFilters, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="100%" height="100%" fill="#000000"/>
${defsAndFilters}
${body}
</svg>`;
}

const GLOW_FILTER = `
<filter id="rfGlow" x="-35%" y="-35%" width="170%" height="170%">
  <feGaussianBlur stdDeviation="1.4" result="b"/>
  <feMerge>
    <feMergeNode in="b"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>`;

const GLOW_STRONG = `
<filter id="rfGlowStrong" x="-40%" y="-40%" width="180%" height="180%">
  <feGaussianBlur stdDeviation="2.2" result="b"/>
  <feMerge>
    <feMergeNode in="b"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>`;

function fitFont(text, maxW, startFs, minFs = 14) {
  let fs = Math.min(startFs, 120);
  while (fs > minFs && measureTextWidth(text, fs) > maxW) fs -= 1;
  return fs;
}

/** Parte palabras en líneas para ancho máximo (fs fijo). */
function wrapLines(words, maxW, fs) {
  /** @type {string[]} */
  const lines = [];
  let cur = [];
  for (const w of words) {
    const trial = cur.length ? `${cur.join(" ")} ${w}` : w;
    if (measureTextWidth(trial, fs) <= maxW) cur.push(w);
    else {
      if (cur.length) lines.push(cur.join(" "));
      cur = [w];
    }
  }
  if (cur.length) lines.push(cur.join(" "));
  return lines.length ? lines : [words.join(" ")];
}

/**
 * @param {{ id: string; style_key: string; variant: string; label: string; svg: string }[]} specs
 */
async function specsToPngs(specs) {
  const out = [];
  for (const s of specs) {
    const png = await sharp(Buffer.from(s.svg, "utf8")).png().toBuffer();
    out.push({
      id: s.id,
      style_key: s.style_key,
      variant: s.variant,
      label: s.label,
      mime: "image/png",
      width: PHRASE_CANVAS.width,
      height: PHRASE_CANVAS.height,
      image_base64: png.toString("base64"),
    });
  }
  return out;
}

/** --- SHORT (≤6 palabras) --- */

/** @param {string[]} words */
function buildShortVariants(words) {
  const W = PHRASE_CANVAS.width;
  const H = PHRASE_CANVAS.height;
  const boxes = riseformGradientBoxes(W, H);
  const n = words.length;
  const phrase = words.join(" ");
  /** @type {{ id: string; style_key: string; variant: string; label: string; svg: string }[]} */
  const specs = [];

  const half = Math.ceil(n / 2);
  const line1 = words.slice(0, half).join(" ");
  const line2 = words.slice(half).join(" ");
  const fsBig = fitFont(line1, W - 48, n <= 2 ? 96 : 76, 36);
  const fsSmall = Math.max(18, Math.round(fsBig * 0.32));

  const addBigCenter = (variant, label, yOff, glow) => {
    const idp = nid();
    const cy1 = H / 2 - 28 + yOff;
    const cy2 = H / 2 + 32 + yOff;
    const d1 = buildPlayfairWordPathD(line1, W / 2, cy1, fsBig);
    const d2 = line2 ? buildPlayfairWordPathD(line2, W / 2, cy2, fsSmall) : "";
    const defs = accentGradientDefs(idp, boxes.chrome, boxes.liquid) + (glow ? GLOW_FILTER : "");
    const chrome1 = chromePathNoBorder(d1, idp);
    const rest = d2 ? mutedPath(d2) : "";
    const inner = glow
      ? `<g filter="url(#rfGlow)">${chrome1}</g>${rest ? `<g>${rest}</g>` : ""}`
      : `${chrome1}${rest}`;
    specs.push({
      id: `short.big_center.${variant}`,
      style_key: "big_center",
      variant,
      label,
      svg: wrapSvg(W, H, defs, inner),
    });
  };

  addBigCenter("center", "BIG CENTER · centrado", 0, false);
  addBigCenter("up", "BIG CENTER · arriba", -52, false);
  addBigCenter("glow", "BIG CENTER · glow", 0, true);

  const idStack = nid();
  const defsStack = accentGradientDefs(idStack, boxes.chrome, boxes.liquid);
  let y = H * 0.18;
  const startFs = Math.min(68, Math.floor(380 / Math.max(1, n)));
  let stackBody = "";
  for (let i = 0; i < n; i++) {
    const fs = Math.max(22, startFs - i * 5);
    const d = buildPlayfairWordPathD(words[i], W / 2, y + fs * 0.35, fs);
    stackBody += chromePathNoBorder(d, idStack);
    y += fs * 0.92;
  }
  specs.push({
    id: "short.stacked_punch.desc",
    style_key: "stacked_punch",
    variant: "desc",
    label: "STACKED PUNCH · tamaño decreciente",
    svg: wrapSvg(W, H, defsStack, stackBody),
  });

  const idStack2 = nid();
  const defs2 = accentGradientDefs(idStack2, boxes.chrome, boxes.liquid);
  const baseSmall = 26;
  let innerAsc = "";
  let y2 = H * 0.2;
  for (let i = 0; i < n; i++) {
    const fs = Math.min(78, baseSmall + i * 9);
    const d = buildPlayfairWordPathD(words[i], W / 2, y2 + fs * 0.35, fs);
    innerAsc += chromePathNoBorder(d, idStack2);
    y2 += fs * 0.95;
  }
  specs.push({
    id: "short.stacked_punch.asc",
    style_key: "stacked_punch",
    variant: "asc",
    label: "STACKED PUNCH · tamaño creciente",
    svg: wrapSvg(W, H, defs2, innerAsc),
  });

  const idOff = nid();
  const defOff = accentGradientDefs(idOff, boxes.chrome, boxes.liquid);
  const fsOff = fitFont(phrase, W - 80, 28, 16);
  const dOff = buildPlayfairPathLeft(phrase, 36, H - 56, fsOff);
  specs.push({
    id: "short.offset_minimal.bl",
    style_key: "offset_minimal",
    variant: "bottom_left",
    label: "OFFSET MINIMAL · inferior izquierda",
    svg: wrapSvg(W, H, defOff, chromePathNoBorder(dOff, idOff)),
  });

  const idHi = nid();
  const defHi = accentGradientDefs(idHi, boxes.chrome, boxes.liquid);
  const w0 = words[0];
  const tail = words.slice(1).join(" ");
  const fsH = fitFont(w0, W - 40, 104, 40);
  const fsT = Math.max(18, Math.round(fsH * 0.28));
  const dh = buildPlayfairWordPathD(w0, W / 2, H / 2 - 18, fsH);
  const dt = tail ? buildPlayfairWordPathD(tail, W / 2, H / 2 + fsH * 0.42, fsT) : "";
  specs.push({
    id: "short.word_highlight.first",
    style_key: "word_highlight",
    variant: "first",
    label: "WORD HIGHLIGHT · primera palabra",
    svg: wrapSvg(
      W,
      H,
      defHi,
      `${chromePathNoBorder(dh, idHi)}${dt ? mutedPath(dt) : ""}`,
    ),
  });

  const idHi2 = nid();
  const defHi2 = accentGradientDefs(idHi2, boxes.chrome, boxes.liquid);
  const wLast = words[n - 1];
  const head = words.slice(0, -1).join(" ");
  const fsL = fitFont(wLast, W - 40, 104, 40);
  const fsHead = Math.max(18, Math.round(fsL * 0.3));
  const dh2 = head ? buildPlayfairWordPathD(head, W / 2, H / 2 - fsL * 0.38, fsHead) : "";
  const dt2 = buildPlayfairWordPathD(wLast, W / 2, H / 2 + 22, fsL);
  specs.push({
    id: "short.word_highlight.last",
    style_key: "word_highlight",
    variant: "last",
    label: "WORD HIGHLIGHT · última palabra",
    svg: wrapSvg(W, H, defHi2, `${dh2 ? mutedPath(dh2) : ""}${chromePathNoBorder(dt2, idHi2)}`),
  });

  const idGl = nid();
  const defGl = accentGradientDefs(idGl, boxes.chrome, boxes.liquid) + GLOW_FILTER;
  const fsGl = fitFont(phrase, W - 56, 44, 22);
  const dGl = buildPlayfairWordPathD(phrase, W / 2, H / 2, fsGl);
  specs.push({
    id: "short.glow_gradient.center",
    style_key: "glow_gradient",
    variant: "center",
    label: "GLOW GRADIENT · centrado",
    svg: wrapSvg(W, H, defGl, `<g filter="url(#rfGlow)">${chromePathNoBorder(dGl, idGl)}</g>`),
  });

  const idLow = nid();
  const defLow = accentGradientDefs(idLow, boxes.chrome, boxes.liquid);
  const d1b = buildPlayfairWordPathD(line1, W / 2, H / 2 + 42, fsBig * 0.92);
  const d2b = line2 ? buildPlayfairWordPathD(line2, W / 2, H / 2 + 42 + fsBig * 0.55, fsSmall) : "";
  specs.push({
    id: "short.big_center.low",
    style_key: "big_center",
    variant: "low",
    label: "BIG CENTER · bajo",
    svg: wrapSvg(W, H, defLow, `${chromePathNoBorder(d1b, idLow)}${d2b ? mutedPath(d2b) : ""}`),
  });

  const idSh = nid();
  const defSh = accentGradientDefs(idSh, boxes.chrome, boxes.liquid);
  const d1s = buildPlayfairWordPathD(line1, W / 2 + 44, H / 2 - 24, fsBig);
  const d2s = line2 ? buildPlayfairWordPathD(line2, W / 2 + 44, H / 2 + 36, fsSmall) : "";
  specs.push({
    id: "short.big_center.shift_right",
    style_key: "big_center",
    variant: "shift_right",
    label: "BIG CENTER · desplazado",
    svg: wrapSvg(W, H, defSh, `${chromePathNoBorder(d1s, idSh)}${d2s ? mutedPath(d2s) : ""}`),
  });

  const idTr = nid();
  const defTr = accentGradientDefs(idTr, boxes.chrome, boxes.liquid);
  const fsTr = fitFont(phrase, W - 48, 24, 16);
  const wText = measureTextWidth(phrase, fsTr);
  const dTr = buildPlayfairWordPathD(phrase, W - 40 - wText / 2, 56, fsTr);
  specs.push({
    id: "short.offset_minimal.tr",
    style_key: "offset_minimal",
    variant: "top_right",
    label: "OFFSET MINIMAL · arriba derecha",
    svg: wrapSvg(W, H, defTr, chromePathNoBorder(dTr, idTr)),
  });

  const id2c = nid();
  const def2c = accentGradientDefs(id2c, boxes.chrome, boxes.liquid) + GLOW_STRONG;
  const d1c = buildPlayfairWordPathD(line1, W / 2, H / 2 - 30, fsBig);
  const d2c = line2 ? buildPlayfairWordPathD(line2, W / 2, H / 2 + 40, fsSmall) : "";
  specs.push({
    id: "short.glow_gradient.strong",
    style_key: "glow_gradient",
    variant: "strong",
    label: "GLOW GRADIENT · glow fuerte",
    svg: wrapSvg(
      W,
      H,
      def2c,
      `<g filter="url(#rfGlowStrong)">${chromePathNoBorder(d1c, id2c)}${d2c ? mutedPath(d2c) : ""}</g>`,
    ),
  });

  if (n >= 2 && n <= 4) {
    const idB = nid();
    const defB = accentGradientDefs(idB, boxes.chrome, boxes.liquid);
    const f1 = fitFont(line1, W - 40, 58, 28);
    const f2 = line2 ? fitFont(line2, W - 40, 40, 22) : 0;
    const b1 = buildPlayfairWordPathD(line1, W / 2, H / 2 - 22, f1);
    const b2 = line2 ? buildPlayfairWordPathD(line2, W / 2, H / 2 + 32, f2) : "";
    specs.push({
      id: "short.big_center.dual_chrome",
      style_key: "big_center",
      variant: "dual_chrome",
      label: "BIG CENTER · ambas líneas cromo",
      svg: wrapSvg(
        W,
        H,
        defB,
        `${chromePathNoBorder(b1, idB)}${b2 ? chromePathNoBorder(b2, idB) : ""}`,
      ),
    });
  }

  return specs;
}

/** --- MEDIUM (7–10) --- */

function buildMediumVariants(words) {
  const W = PHRASE_CANVAS.width;
  const H = PHRASE_CANVAS.height;
  const boxes = riseformGradientBoxes(W, H);
  const n = words.length;
  const mid = Math.floor(n / 2);
  const block1 = words.slice(0, mid).join(" ");
  const block2 = words.slice(mid).join(" ");
  /** @type {{ id: string; style_key: string; variant: string; label: string; svg: string }[]} */
  const specs = [];

  const idSp = nid();
  const defSp = accentGradientDefs(idSp, boxes.chrome, boxes.liquid);
  const fsB = fitFont(block1, W - 64, 34, 18);
  const dA = buildPlayfairWordPathD(block1, W / 2, H / 2 - 40, fsB);
  const fsB2 = fitFont(block2, W - 64, 34, 18);
  const dB = buildPlayfairWordPathD(block2, W / 2, H / 2 + 36, fsB2);
  specs.push({
    id: "medium.split_message.two_blocks",
    style_key: "split_message",
    variant: "two_blocks",
    label: "SPLIT MESSAGE · dos bloques",
    svg: wrapSvg(W, H, defSp, `${chromePathNoBorder(dA, idSp)}${mutedPath(dB)}`),
  });

  let longest = words[0];
  let longestI = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].length >= longest.length) {
      longest = words[i];
      longestI = i;
    }
  }
  const before = words.slice(0, longestI).join(" ");
  const after = words.slice(longestI + 1).join(" ");
  const idKw = nid();
  const defKw = accentGradientDefs(idKw, boxes.chrome, boxes.liquid);
  const fsK = fitFont(longest, W - 48, 72, 32);
  const fsLine = 22;
  const yBase = H / 2;
  const dk = buildPlayfairWordPathD(longest, W / 2, yBase, fsK);
  const da = before ? buildPlayfairWordPathD(before, W / 2, yBase - fsK * 0.52, fsLine) : "";
  const dz = after ? buildPlayfairWordPathD(after, W / 2, yBase + fsK * 0.55, fsLine) : "";
  specs.push({
    id: "medium.keyword_emphasis.center",
    style_key: "keyword_emphasis",
    variant: "center",
    label: "KEYWORD EMPHASIS · palabra larga",
    svg: wrapSvg(
      W,
      H,
      defKw,
      `${da ? mutedPath(da) : ""}${chromePathNoBorder(dk, idKw)}${dz ? mutedPath(dz) : ""}`,
    ),
  });

  const idCas = nid();
  const defCas = accentGradientDefs(idCas, boxes.chrome, boxes.liquid);
  let yc = H * 0.28;
  let inner = "";
  for (let i = 0; i < n; i++) {
    const fs = fitFont(words[i], W - 100, 38, 20);
    const xShift = (i % 2 === 0 ? -1 : 1) * 22;
    const d = buildPlayfairWordPathD(words[i], W / 2 + xShift, yc + fs * 0.35, fs);
    inner += chromePathNoBorder(d, idCas);
    yc += fs * 0.88;
  }
  specs.push({
    id: "medium.center_cascade.stagger",
    style_key: "center_cascade",
    variant: "stagger",
    label: "CENTER CASCADE · escalera",
    svg: wrapSvg(W, H, defCas, inner),
  });

  const idLeft = nid();
  const defL = accentGradientDefs(idLeft, boxes.chrome, boxes.liquid);
  const maxW = W - 72;
  const fsEd = fitFont(words.join(" "), maxW, 30, 18);
  const lines = wrapLines(words, maxW, fsEd);
  let yl = H * 0.22;
  let bodyL = "";
  for (const ln of lines) {
    const fsLn = fitFont(ln, maxW, fsEd, 16);
    const pl = buildPlayfairPathLeft(ln, 40, yl + fsLn * 0.35, fsLn);
    bodyL += chromePathNoBorder(pl, idLeft);
    yl += fsLn * 1.12;
  }
  specs.push({
    id: "medium.left_clean.editorial",
    style_key: "left_clean",
    variant: "editorial",
    label: "LEFT CLEAN · editorial",
    svg: wrapSvg(W, H, defL, bodyL),
  });

  const idBox = nid();
  const defBox = accentGradientDefs(idBox, boxes.chrome, boxes.liquid);
  const fsBox = fitFont(words.join(" "), W - 120, 28, 18);
  const linesB = wrapLines(words, W - 120, fsBox);
  let yb = H / 2 - ((linesB.length - 1) * 34) / 2;
  let bodyB = `<rect x="28" y="${H / 2 - 110}" width="${W - 56}" height="220" fill="none" stroke="rgba(148,163,184,0.45)" stroke-width="1.5" rx="10"/>`;
  for (const ln of linesB) {
    const d = buildPlayfairWordPathD(ln, W / 2, yb + 18, Math.min(fsBox, 26));
    bodyB += chromePathNoBorder(d, idBox);
    yb += 40;
  }
  specs.push({
    id: "medium.boxed_focus.frame",
    style_key: "boxed_focus",
    variant: "frame",
    label: "BOXED FOCUS · marco",
    svg: wrapSvg(W, H, defBox, bodyB),
  });

  const idSp2 = nid();
  const defSp2 = accentGradientDefs(idSp2, boxes.chrome, boxes.liquid);
  const fsT = fitFont(block1, W - 48, 36, 20);
  const fsT2 = fitFont(block2, W - 48, 36, 20);
  const dT = buildPlayfairWordPathD(block1, W / 2, H * 0.36, fsT);
  const dT2 = buildPlayfairWordPathD(block2, W / 2, H * 0.62, fsT2);
  specs.push({
    id: "medium.split_message.wide",
    style_key: "split_message",
    variant: "wide_gap",
    label: "SPLIT MESSAGE · bloques separados",
    svg: wrapSvg(W, H, defSp2, `${chromePathNoBorder(dT, idSp2)}${mutedPath(dT2)}`),
  });

  const idKw2 = nid();
  const defKw2 = accentGradientDefs(idKw2, boxes.chrome, boxes.liquid);
  const phrase = words.join(" ");
  const fsOne = fitFont(phrase, W - 40, 42, 22);
  const dOne = buildPlayfairWordPathD(phrase, W / 2, H / 2, fsOne);
  specs.push({
    id: "medium.paragraph_single.dense",
    style_key: "paragraph_minimal",
    variant: "dense",
    label: "PÁRRAFO · una línea compacta",
    svg: wrapSvg(W, H, defKw2, chromePathNoBorder(dOne, idKw2)),
  });

  return specs;
}

/** --- LONG (11–15) --- */

function buildLongVariants(words) {
  const W = PHRASE_CANVAS.width;
  const H = PHRASE_CANVAS.height;
  const boxes = riseformGradientBoxes(W, H);
  const specs = [];
  const maxW = W - 80;
  const fs0 = 24;

  const idP = nid();
  const defP = accentGradientDefs(idP, boxes.chrome, boxes.liquid);
  const lines = wrapLines(words, maxW, fs0);
  let y = H * 0.16;
  let body = "";
  for (const ln of lines) {
    const fs = fitFont(ln, maxW, fs0, 17);
    const d = buildPlayfairWordPathD(ln, W / 2, y + fs * 0.35, fs);
    body += chromePathNoBorder(d, idP);
    y += fs * 1.35;
  }
  specs.push({
    id: "long.paragraph_minimal.spaced",
    style_key: "paragraph_minimal",
    variant: "spaced",
    label: "PARAGRAPH MINIMAL · interlineado",
    svg: wrapSvg(W, H, defP, body),
  });

  const idQ = nid();
  const defQ = accentGradientDefs(idQ, boxes.chrome, boxes.liquid);
  const quoteFs = 120;
  const qPath = buildPlayfairWordPathD("“", W * 0.12, H * 0.28, quoteFs);
  const phrase = words.join(" ");
  const bodyFs = fitFont(phrase, maxW, 26, 17);
  const qLines = wrapLines(words, maxW, bodyFs);
  let yq = H * 0.38;
  let qb = `${mutedPath(qPath)}`;
  for (const ln of qLines) {
    const fs = fitFont(ln, maxW, bodyFs, 17);
    const d = buildPlayfairWordPathD(ln, W / 2, yq + fs * 0.35, fs);
    qb += chromePathNoBorder(d, idQ);
    yq += fs * 1.28;
  }
  const sub = buildPlayfairWordPathD("—", W / 2, H - 44, 18);
  qb += mutedPath(sub);
  specs.push({
    id: "long.quote_style.quotes",
    style_key: "quote_style",
    variant: "quotes",
    label: "QUOTE STYLE · comillas",
    svg: wrapSvg(W, H, defQ, qb),
  });

  const idFd = nid();
  const defFd = accentGradientDefs(idFd, boxes.chrome, boxes.liquid);
  const linesF = wrapLines(words, maxW, 22);
  let yf = H * 0.2;
  let fb = "";
  linesF.forEach((ln, i) => {
    const fs = fitFont(ln, maxW, 24, 17);
    const op = 0.45 + (i / Math.max(1, linesF.length - 1)) * 0.55;
    const d = buildPlayfairWordPathD(ln, W / 2, yf + fs * 0.35, fs);
    fb += `<g opacity="${op.toFixed(2)}">${chromePathNoBorder(d, idFd)}</g>`;
    yf += fs * 1.25;
  });
  specs.push({
    id: "long.fade_lines.opacity",
    style_key: "fade_lines",
    variant: "opacity",
    label: "FADE LINES · opacidad por línea",
    svg: wrapSvg(W, H, defFd, fb),
  });

  const idCol = nid();
  const defCol = accentGradientDefs(idCol, boxes.chrome, boxes.liquid);
  const colW = 300;
  const linesC = wrapLines(words, colW, 23);
  let yc = H * 0.18;
  let cb = "";
  for (const ln of linesC) {
    const fs = fitFont(ln, colW, 24, 17);
    const d = buildPlayfairWordPathD(ln, W / 2, yc + fs * 0.35, fs);
    cb += chromePathNoBorder(d, idCol);
    yc += fs * 1.3;
  }
  specs.push({
    id: "long.center_column.narrow",
    style_key: "center_column",
    variant: "narrow",
    label: "CENTER COLUMN · columna",
    svg: wrapSvg(W, H, defCol, cb),
  });

  const hi = Math.floor(words.length / 2);
  const idHi = nid();
  const defHi = accentGradientDefs(idHi, boxes.chrome, boxes.liquid);
  const lineHi = words.slice(0, hi).join(" ");
  const lineLo = words.slice(hi).join(" ");
  const fsHi = fitFont(lineHi, maxW, 30, 20);
  const fsLo = fitFont(lineLo, maxW, 22, 17);
  const dHi = buildPlayfairWordPathD(lineHi, W / 2, H * 0.42, fsHi);
  const dLo = buildPlayfairWordPathD(lineLo, W / 2, H * 0.58, fsLo);
  specs.push({
    id: "long.highlight_line.split",
    style_key: "highlight_line",
    variant: "split",
    label: "HIGHLIGHT LINE · mitad superior fuerte",
    svg: wrapSvg(W, H, defHi, `${chromePathNoBorder(dHi, idHi)}${mutedPath(dLo)}`),
  });

  return specs;
}

/** --- EXTRA LONG (16+) --- */

function splitIntoChunks(words, parts) {
  const n = words.length;
  const chunkSize = Math.ceil(n / parts);
  /** @type {string[][]} */
  const chunks = [];
  for (let i = 0; i < n; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize));
  }
  return chunks;
}

function buildExtraLongVariants(words) {
  const W = PHRASE_CANVAS.width;
  const H = PHRASE_CANVAS.height;
  const boxes = riseformGradientBoxes(W, H);
  const specs = [];
  const maxW = W - 64;
  const n = words.length;

  const chunks3 = splitIntoChunks(words, 3);
  const idM = nid();
  const defM = accentGradientDefs(idM, boxes.chrome, boxes.liquid);
  let ym = H * 0.14;
  let mb = "";
  for (const ch of chunks3) {
    const ln = ch.join(" ");
    const fs = fitFont(ln, maxW, 22, 14);
    const d = buildPlayfairWordPathD(ln, W / 2, ym + fs * 0.35, fs);
    mb += chromePathNoBorder(d, idM);
    ym += fs * 1.45 + 18;
  }
  specs.push({
    id: "extra.multi_block.three",
    style_key: "multi_block",
    variant: "three",
    label: "MULTI BLOCK · tres párrafos",
    svg: wrapSvg(W, H, defM, mb),
  });

  const titleN = Math.min(8, Math.ceil(n * 0.35));
  const title = words.slice(0, titleN).join(" ");
  const body = words.slice(titleN).join(" ");
  const idTb = nid();
  const defTb = accentGradientDefs(idTb, boxes.chrome, boxes.liquid);
  const fsTit = fitFont(title, maxW, 32, 20);
  const fsBd = fitFont(body, maxW, 20, 14);
  const dTit = buildPlayfairWordPathD(title, W / 2, H * 0.32, fsTit);
  const linesB = wrapLines(words.slice(titleN), maxW, fsBd);
  let ytb = H * 0.46;
  let tb = chromePathNoBorder(dTit, idTb);
  for (const ln of linesB) {
    const fs = fitFont(ln, maxW, fsBd, 14);
    const d = buildPlayfairWordPathD(ln, W / 2, ytb + fs * 0.35, fs);
    tb += mutedPath(d);
    ytb += fs * 1.22;
  }
  specs.push({
    id: "extra.title_body.stack",
    style_key: "title_body",
    variant: "stack",
    label: "TITLE + BODY",
    svg: wrapSvg(W, H, defTb, tb),
  });

  const parts = splitIntoChunks(words, 3);
  const idTh = nid();
  const defTh = accentGradientDefs(idTh, boxes.chrome, boxes.liquid);
  let yth = H * 0.18;
  let thb = "";
  parts.forEach((ch, i) => {
    const label = `${i + 1}/${parts.length}`;
    const fsLab = 16;
    const dl = buildPlayfairWordPathD(label, W / 2, yth, fsLab);
    thb += mutedPath(dl);
    yth += 22;
    const txt = ch.join(" ");
    const fs = fitFont(txt, maxW, 21, 14);
    const d = buildPlayfairWordPathD(txt, W / 2, yth + fs * 0.35, fs);
    thb += chromePathNoBorder(d, idTh);
    yth += fs * 1.35 + 24;
  });
  specs.push({
    id: "extra.thread_style.parts",
    style_key: "thread_style",
    variant: "numbered",
    label: "THREAD STYLE · partes",
    svg: wrapSvg(W, H, defTh, thb),
  });

  const idFade = nid();
  const defFade = accentGradientDefs(idFade, boxes.chrome, boxes.liquid);
  const fadeGrad = `
<defs>
  <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="white" stop-opacity="1"/>
    <stop offset="55%" stop-color="white" stop-opacity="1"/>
    <stop offset="100%" stop-color="white" stop-opacity="0"/>
  </linearGradient>
  <mask id="fadeMask"><rect width="${W}" height="${H}" fill="url(#fadeBottom)"/></mask>
</defs>`;
  const phrase = words.join(" ");
  const fsF = fitFont(phrase, maxW, 21, 14);
  const linesF = wrapLines(words, maxW, fsF);
  let yf = H * 0.16;
  let fg = "";
  for (const ln of linesF) {
    const fs = fitFont(ln, maxW, fsF, 14);
    const d = buildPlayfairWordPathD(ln, W / 2, yf + fs * 0.35, fs);
    fg += chromePathNoBorder(d, idFade);
    yf += fs * 1.15;
  }
  specs.push({
    id: "extra.fade_bottom.mask",
    style_key: "fade_bottom",
    variant: "mask",
    label: "FADE BOTTOM · máscara inferior",
    svg: wrapSvg(W, H, defFade + fadeGrad, `<g mask="url(#fadeMask)">${fg}</g>`),
  });

  const idSoft = nid();
  const defSoft = accentGradientDefs(idSoft, boxes.chrome, boxes.liquid);
  const fsS = Math.min(20, fitFont(words.join(" "), maxW, 20, 14));
  const linesS = wrapLines(words, maxW, fsS);
  let ys = H * 0.18;
  let sb = "";
  for (const ln of linesS) {
    const fs = fitFont(ln, maxW, fsS, 14);
    const d = buildPlayfairWordPathD(ln, W / 2, ys + fs * 0.35, fs);
    sb += `<g opacity="0.88">${chromePathNoBorder(d, idSoft)}</g>`;
    ys += fs * 1.25;
  }
  specs.push({
    id: "extra.center_soft.soft",
    style_key: "center_soft",
    variant: "soft",
    label: "CENTER SOFT · ligero",
    svg: wrapSvg(W, H, defSoft, sb),
  });

  return specs;
}

/**
 * @param {string} phrase
 * @param {{ maxImages?: number }} [options]
 */
export async function generatePhraseImageVariants(phrase, options = {}) {
  const maxImages = Math.min(60, Math.max(1, options.maxImages ?? 18));
  const words = tokenizePhrase(phrase);
  if (words.length === 0) {
    throw new Error("La frase no tiene palabras.");
  }
  const bucket = classifyPhraseLength(words.length);
  let specs = [];
  switch (bucket) {
    case "short":
      specs = buildShortVariants(words);
      break;
    case "medium":
      specs = buildMediumVariants(words);
      break;
    case "long":
      specs = buildLongVariants(words);
      break;
    default:
      specs = buildExtraLongVariants(words);
  }
  specs = specs.slice(0, maxImages);
  const images = await specsToPngs(specs);
  return {
    bucket,
    word_count: words.length,
    phrase,
    images,
  };
}
