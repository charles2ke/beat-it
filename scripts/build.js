#!/usr/bin/env node
// Builds the deployable site into _site/: copies site/, points <base> and absolute URLs at the deploy
// location, prerenders every page to static HTML with headless Chromium (so search engines and no-JS
// visitors get real content), and writes 404.html, sitemap.xml, robots.txt and Atom feeds of new FDA
// approvals (feed.xml for the whole site, type/<id>/feed.xml per cancer type).
//
//   SITE_URL=https://example.org/path/ node scripts/build.js
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "site");
const OUT = path.resolve(ROOT, process.env.OUT_DIR || "_site");
const shellSource = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
const DEFAULT_URL = /<meta name="site-url" content="([^"]+)">/.exec(shellSource)[1];
const SITE_URL = (process.env.SITE_URL || DEFAULT_URL).replace(/\/*$/, "/");
const BASE_PATH = new URL(SITE_URL).pathname;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".xml": "application/xml",
  ".txt": "text/plain", ".webmanifest": "application/manifest+json",
};

const withSiteUrl = (text) => text.split(DEFAULT_URL).join(SITE_URL);

function copySite() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(SRC, OUT, { recursive: true });
  for (const file of ["opensearch.xml"]) {
    const p = path.join(OUT, file);
    if (fs.existsSync(p)) fs.writeFileSync(p, withSiteUrl(fs.readFileSync(p, "utf8")));
  }
  const shell = withSiteUrl(shellSource).replace('<base href="/">', `<base href="${BASE_PATH}">`);
  if (!shell.includes(`<base href="${BASE_PATH}">`)) throw new Error("index.html must contain <base href=\"/\">");
  fs.writeFileSync(path.join(OUT, "index.html"), shell);
  return shell;
}

// Serves _site under BASE_PATH. Page routes always get the pristine shell, never prerendered output.
function startServer(shell) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = decodeURIComponent(url.pathname);
    if (!p.startsWith(BASE_PATH)) { res.writeHead(404); res.end(); return; }
    const rel = p.slice(BASE_PATH.length);
    if (!path.extname(rel)) { res.writeHead(200, { "content-type": MIME[".html"] }); res.end(shell); return; }
    const file = path.join(OUT, rel);
    if (!file.startsWith(OUT + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function prerender(browser, origin, route) {
  const page = await browser.newPage({ colorScheme: "light", reducedMotion: "reduce" });
  const problems = [];
  page.on("pageerror", (err) => problems.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") problems.push(msg.text()); });
  page.on("requestfailed", (req) => problems.push("request failed: " + req.url()));
  try {
    await page.goto(origin + BASE_PATH + route, { waitUntil: "load" });
    await page.waitForSelector("html[data-ready], html[data-error]", { state: "attached", timeout: 30000 });
    if (await page.$("html[data-error]")) throw new Error(await page.textContent("#status"));
    const html = await page.evaluate(() => {
      const d = document.documentElement;
      d.removeAttribute("data-ready");
      d.removeAttribute("data-pending");
      d.removeAttribute("data-js"); // set again by theme.js when the visitor has JavaScript
      document.getElementById("view").classList.remove("animate");
      document.getElementById("topbar").classList.remove("scrolled");
      const status = document.getElementById("status");
      status.textContent = "";
      status.className = "status sr-only";
      const list = document.getElementById("suggestions");
      list.hidden = true;
      list.replaceChildren();
      document.getElementById("q").setAttribute("aria-expanded", "false");
      return "<!doctype html>\n" + d.outerHTML + "\n";
    });
    if (problems.length) throw new Error(problems.join("\n"));
    return html;
  } catch (err) {
    throw new Error(`prerendering /${route} failed: ${err.message}`);
  } finally {
    await page.close();
  }
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// ---------------------------------------------------------------- Atom feeds of new FDA approvals
const FEED_MAX = 50;
const xml = (s) => String(s == null ? "" : s)
  .replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "") // not allowed in XML 1.0
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const atomDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d + "T00:00:00Z" : "");

// Like app.js: an approval listed for several cancer types is a single entry. Newest first.
function mergedApprovals(cancers) {
  const merged = new Map();
  for (const c of cancers) {
    for (const a of c.approvals || []) {
      const key = a.url || a.date + " " + String(a.drug).toLowerCase();
      if (merged.has(key)) merged.get(key).types.push(c.id);
      else merged.set(key, Object.assign({ types: [c.id] }, a));
    }
  }
  return [...merged.values()].filter((a) => atomDate(a.date)).sort((a, b) => b.date.localeCompare(a.date));
}

function atomFeed({ rel, title, subtitle, page, approvals, names, fallbackDate }) {
  const items = approvals.slice(0, FEED_MAX);
  const entries = items.map((a) => [
    "  <entry>",
    `    <id>${xml(a.url || `${page}#${a.date}-${String(a.drug).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)}</id>`,
    `    <title>${xml(`${a.drug} – ${a.types.map((id) => names[id]).join(", ")}`)}</title>`,
    `    <link rel="alternate" type="text/html" href="${xml(a.url || page)}"/>`,
    `    <published>${atomDate(a.date)}</published>`,
    `    <updated>${atomDate(a.date)}</updated>`,
    `    <summary>${xml(a.text)}</summary>`,
    ...a.types.map((id) => `    <category term="${xml(id)}" label="${xml(names[id])}"/>`),
    "  </entry>",
  ].join("\n"));
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">',
    `  <id>${xml(SITE_URL + rel)}</id>`,
    `  <title>${xml(title)}</title>`,
    `  <subtitle>${xml(subtitle)}</subtitle>`,
    `  <link rel="self" type="application/atom+xml" href="${xml(SITE_URL + rel)}"/>`,
    `  <link rel="alternate" type="text/html" href="${xml(page)}"/>`,
    // The newest approval date, so an unchanged feed is byte-for-byte identical between builds.
    `  <updated>${items.length ? atomDate(items[0].date) : atomDate(fallbackDate)}</updated>`,
    `  <author><name>Beat It</name><uri>${xml(SITE_URL)}</uri></author>`,
    `  <icon>${xml(SITE_URL)}assets/icon-192.png</icon>`,
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}

function writeFeeds(cancers, fallbackDate) {
  const approvals = mergedApprovals(cancers);
  const names = Object.fromEntries(cancers.map((c) => [c.id, c.name]));
  const intro = "New medicines and new uses approved by the U.S. Food and Drug Administration, each linked to the official announcement.";
  write("feed.xml", atomFeed({ rel: "feed.xml", title: "Beat It – new FDA cancer approvals", subtitle: intro, page: SITE_URL,
    approvals, names, fallbackDate }));
  for (const c of cancers) {
    write(`type/${c.id}/feed.xml`, atomFeed({ rel: `type/${c.id}/feed.xml`, title: `${c.name} – new FDA approvals | Beat It`,
      subtitle: intro, page: `${SITE_URL}type/${c.id}/`, approvals: approvals.filter((a) => a.types.includes(c.id)), names,
      fallbackDate: c.reviewed || fallbackDate }));
  }
  return 1 + cancers.length;
}

async function main() {
  const started = Date.now();
  const cancers = JSON.parse(fs.readFileSync(path.join(SRC, "data", "cancers.json"), "utf8"));
  let generatedAt = "";
  try { generatedAt = JSON.parse(fs.readFileSync(path.join(SRC, "data", "updates.json"), "utf8")).generatedAt || ""; } catch (_) { /* optional */ }
  const lastmod = (generatedAt || new Date().toISOString()).slice(0, 10);

  const shell = copySite();
  const server = await startServer(shell);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const routes = [""].concat(cancers.map((c) => `type/${c.id}/`));
  const pages = {};
  try {
    const queue = routes.slice();
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const route = queue.shift();
        pages[route] = await prerender(browser, origin, route);
      }
    }));
    // A path without words, so the static page suggests nothing; app.js adds suggestions for the real URL.
    pages["404.html"] = await prerender(browser, origin, "404/");
  } finally {
    await browser.close();
    server.close();
  }

  // Sanity checks so a broken render can never be deployed.
  const count = (html, re) => (html.match(re) || []).length;
  if (count(pages[""], /<article class="type-card[^"]*" data-type=/g) !== cancers.length) throw new Error("home page is missing cancer type cards");
  for (const c of cancers) {
    if (!pages[`type/${c.id}/`].includes(`<h1>${c.name.replace(/&/g, "&amp;")}</h1>`)) throw new Error(`type/${c.id}/ is missing its heading`);
  }
  if (!pages["404.html"].includes('content="noindex, follow"')) throw new Error("404 page must be noindex");

  for (const route of routes) write(route + "index.html", pages[route]);
  write("404.html", pages["404.html"]);
  const urls = routes.map((r) => `  <url>\n    <loc>${SITE_URL}${r}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`);
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
  // Crawlers only read robots.txt at the domain root, so this takes effect with a custom domain.
  write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
  const feeds = writeFeeds(cancers, lastmod);
  console.log(`Built ${routes.length} pages + 404.html and ${feeds} feeds into ${path.relative(ROOT, OUT) || "."}/ for ${SITE_URL} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
