import opentype from "opentype.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const playfairPath = join(
  repoRoot,
  "fonts",
  "Playfair_Display",
  "PlayfairDisplay-VariableFont_wght.ttf",
);

/** Misma fuente que `riseformProfileOverlay` / `riseformCoverOverlay` en content-cards.mjs. */
export const playfairDisplayFont = await opentype.load(playfairPath);

/**
 * @param {string} text
 * @param {number} cx
 * @param {number} cy
 * @param {number} fontSize
 */
export function buildPlayfairWordPathD(text, cx, cy, fontSize) {
  const path = playfairDisplayFont.getPath(text, 0, 0, fontSize, { kerning: true });
  const box = path.getBoundingBox();
  const tx = cx - (box.x1 + box.x2) / 2;
  const ty = cy - (box.y1 + box.y2) / 2;
  path.commands.forEach((command) => {
    if (typeof command.x === "number") command.x += tx;
    if (typeof command.y === "number") command.y += ty;
    if (typeof command.x1 === "number") command.x1 += tx;
    if (typeof command.y1 === "number") command.y1 += ty;
    if (typeof command.x2 === "number") command.x2 += tx;
    if (typeof command.y2 === "number") command.y2 += ty;
  });
  return path.toPathData(2);
}

/** Ancho aproximado del trazo (útil para encajar líneas). */
export function measureTextWidth(text, fontSize) {
  const path = playfairDisplayFont.getPath(text, 0, 0, fontSize, { kerning: true });
  const box = path.getBoundingBox();
  return box.x2 - box.x1;
}

/** Borde izquierdo del bounding box en `leftX`. */
export function buildPlayfairPathLeft(text, leftX, centerY, fontSize) {
  const path = playfairDisplayFont.getPath(text, 0, 0, fontSize, { kerning: true });
  const box = path.getBoundingBox();
  const tx = leftX - box.x1;
  const ty = centerY - (box.y1 + box.y2) / 2;
  path.commands.forEach((command) => {
    if (typeof command.x === "number") command.x += tx;
    if (typeof command.y === "number") command.y += ty;
    if (typeof command.x1 === "number") command.x1 += tx;
    if (typeof command.y1 === "number") command.y1 += ty;
    if (typeof command.x2 === "number") command.x2 += tx;
    if (typeof command.y2 === "number") command.y2 += ty;
  });
  return path.toPathData(2);
}
