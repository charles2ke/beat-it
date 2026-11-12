#!/usr/bin/env node
// Regenerates the PNG icons and the social-sharing card in site/assets/ from HTML, using the same
// colours, ribbon mark and Inter font as the site. Run after changing the brand: `npm run images`.
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const ASSETS = path.resolve(__dirname, "..", "site", "assets");
const font = fs.readFileSync(path.join(ASSETS, "fonts", "inter-latin-opsz-normal.woff2")).toString("base64");
const RIBBON = "M10 26 18.2 13.6c1.1-1.6 1.6-3 1.6-4.3a3.8 3.8 0 0 0-7.6 0c0 1.3.5 2.7 1.6 4.3L22 26";
const GRADIENT = '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2e7e"/><stop offset=".55" stop-color="#c2185b"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>';

// radius: corner radius in viewBox units (0 = full bleed); scale: ribbon size, smaller for maskable safe zone.
const mark = (size, radius, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  <defs>${GRADIENT}</defs>
  <rect width="32" height="32" rx="${radius}" fill="url(#g)"/>
  <g transform="translate(16 16) scale(${scale}) translate(-16 -15.75)">
    <path d="${RIBBON}" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const page = (body, css = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; }
body { font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
svg { display: block; }
${css}
</style></head><body>${body}</body></html>`;

const ogCard = page(`
<div class="card">
  <div class="glow a"></div><div class="glow b"></div><div class="glow c"></div><div class="dots"></div>
  <div class="brand">${mark(76, 9, 1)}<span>Beat It</span></div>
  <h1>Cancer information from trusted sources, <span class="grad">updated every week.</span></h1>
  <ul>
    <li>22 cancer types</li><li>New FDA approvals</li><li>Recruiting trials</li><li>Latest research</li>
  </ul>
  <p class="foot"><b>NCI · FDA · WHO · PubMed · ClinicalTrials.gov</b><span>charles2ke.github.io/beat-it</span></p>
</div>`, `
.card { position: relative; overflow: hidden; width: 1200px; height: 630px; padding: 64px 72px; color: #fff;
  background: radial-gradient(60% 90% at 0% 0%, rgb(255 64 129 / .42), transparent 62%),
    radial-gradient(55% 80% at 100% 0%, rgb(124 58 237 / .55), transparent 60%),
    radial-gradient(60% 70% at 55% 125%, rgb(249 115 22 / .3), transparent 60%),
    linear-gradient(160deg, #1b0620 0%, #470c32 46%, #27105a 100%); }
.glow { position: absolute; border-radius: 50%; filter: blur(80px); opacity: .5; }
.glow.a { width: 520px; height: 520px; background: #ff2e7e; top: -260px; left: -160px; }
.glow.b { width: 480px; height: 480px; background: #8b5cf6; top: -140px; right: -180px; }
.glow.c { width: 420px; height: 420px; background: #fb923c; bottom: -300px; left: 45%; opacity: .32; }
.dots { position: absolute; inset: 0; background-image: radial-gradient(rgb(255 255 255 / .14) 1px, transparent 1.4px); background-size: 26px 26px;
  -webkit-mask-image: linear-gradient(180deg, #000, transparent 85%); }
.card > :not(.glow):not(.dots) { position: relative; }
.brand { display: flex; align-items: center; gap: 20px; font-size: 44px; font-weight: 800; letter-spacing: -.03em; }
.brand svg { border-radius: 20px; box-shadow: 0 18px 40px -12px rgb(255 46 126 / .7); }
h1 { margin: 46px 0 0; max-width: 1000px; font-size: 68px; line-height: 1.04; letter-spacing: -.045em; font-weight: 800; }
.grad { background: linear-gradient(92deg, #ffd6e6 0%, #ff86b4 38%, #c4b5fd 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
ul { display: flex; gap: 14px; margin: 40px 0 0; padding: 0; list-style: none; }
li { padding: 11px 22px; border-radius: 999px; font-size: 24px; font-weight: 650; background: rgb(255 255 255 / .1); border: 1.5px solid rgb(255 255 255 / .22); }
.foot { position: absolute !important; left: 72px; right: 72px; bottom: 50px; margin: 0; display: flex; justify-content: space-between;
  font-size: 22px; color: rgb(255 255 255 / .78); }
.foot b { font-weight: 650; letter-spacing: .02em; }
`);

async function shoot(browser, html, file, width, height, omitBackground) {
  const jpeg = file.endsWith(".jpg");
  const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await tab.setContent(html, { waitUntil: "load" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: path.join(ASSETS, file), omitBackground, clip: { x: 0, y: 0, width, height }, ...(jpeg ? { type: "jpeg", quality: 90 } : {}) });
  await tab.close();
  console.log(`wrote site/assets/${file} (${width}×${height})`);
}

(async () => {
  const browser = await chromium.launch();
  try {
    await shoot(browser, page(mark(192, 7, 1)), "icon-192.png", 192, 192, true);
    await shoot(browser, page(mark(512, 7, 1)), "icon-512.png", 512, 512, true);
    await shoot(browser, page(mark(512, 0, 0.72)), "icon-maskable-512.png", 512, 512, false);
    await shoot(browser, page(mark(180, 0, 0.82)), "apple-touch-icon.png", 180, 180, false);
    await shoot(browser, ogCard, "og-image.jpg", 1200, 630, false);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
