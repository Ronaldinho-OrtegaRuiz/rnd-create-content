/** Gradientes ACCENT_CHROME + LIQUID (perfil/portada Riseform estáticos). */

export const ACCENT_CHROME_STOPS_SVG = `
    <stop offset="0%" stop-color="#000000"/>
    <stop offset="12%" stop-color="#0d2214"/>
    <stop offset="25%" stop-color="#1c4f34"/>
    <stop offset="40%" stop-color="#14567c"/>
    <stop offset="55%" stop-color="#334f96"/>
    <stop offset="70%" stop-color="#6a3d8a"/>
    <stop offset="84%" stop-color="#8b4e20"/>
    <stop offset="100%" stop-color="#000000"/>
`;

export const LIQUID_STOPS_SVG = `
    <stop offset="0%" stop-color="#39ff14" stop-opacity="0"/>
    <stop offset="38%" stop-color="#39ff14" stop-opacity="0"/>
    <stop offset="45%" stop-color="#7dd3fc" stop-opacity="0.52"/>
    <stop offset="49%" stop-color="#c4b5fd" stop-opacity="0.48"/>
    <stop offset="53%" stop-color="#fdba74" stop-opacity="0.42"/>
    <stop offset="57%" stop-color="#fca5a5" stop-opacity="0.38"/>
    <stop offset="64%" stop-color="#ef4444" stop-opacity="0"/>
    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
`;

/**
 * @param {string} idPrefix
 * @param {{ x1: number; y1: number; x2: number; y2: number }} chrome
 * @param {{ x1: number; y1: number; x2: number; y2: number }} liquid
 */
export function accentGradientDefs(idPrefix, chrome, liquid) {
  return `
<defs>
  <linearGradient id="${idPrefix}Chrome" gradientUnits="userSpaceOnUse" x1="${chrome.x1}" y1="${chrome.y1}" x2="${chrome.x2}" y2="${chrome.y2}">
    ${ACCENT_CHROME_STOPS_SVG}
  </linearGradient>
  <linearGradient id="${idPrefix}Liquid" gradientUnits="userSpaceOnUse" x1="${liquid.x1}" y1="${liquid.y1}" x2="${liquid.x2}" y2="${liquid.y2}">
    ${LIQUID_STOPS_SVG}
  </linearGradient>
</defs>`;
}

/** Dos capas de relleno Chrome + Liquid (como `chromePathNoBorder` en content-cards). */
export function chromePathNoBorder(pathD, idPrefix) {
  const dAttr = pathD.replace(/&/g, "&amp;");
  const base = `d="${dAttr}" fill-rule="evenodd"`;
  return `
<path ${base} fill="url(#${idPrefix}Chrome)" stroke="none"/>
<path ${base} fill="url(#${idPrefix}Liquid)" stroke="none"/>
`.trim();
}
