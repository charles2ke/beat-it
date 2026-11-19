// @ts-check
// Tests the deployable build in _site/ (created by `npm run build`), served under /beat-it/ like GitHub Pages.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const SITE = path.join(__dirname, "..", "_site");
const CANCERS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "site", "data", "cancers.json"), "utf8"));
const HOME_DESC = fs.readFileSync(path.join(__dirname, "..", "site", "index.html"), "utf8").match(/<meta name="description" content="([^"]+)"/)[1];
const shot = (page, name) =>
  page.screenshot({ path: `test-results/screenshots/${test.info().project.name}-${name}.png`, fullPage: true, animations: "disabled" });

test.skip(!fs.existsSync(path.join(SITE, "index.html")), "run `npm run build` first");

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("home page is fully rendered HTML with links to every cancer type", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("article[data-type]")).toHaveCount(CANCERS.length);
    await page.getByRole("link", { name: "Lung cancer", exact: true }).click();
    await expect(page).toHaveURL(/\/beat-it\/type\/lung\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Lung cancer" })).toBeVisible();
  });

  test("cancer type pages have content, metadata and structured data", async ({ page }) => {
    await page.goto("type/lung/");
    await expect(page.getByRole("heading", { level: 1, name: "Lung cancer" })).toBeVisible();
    await expect(page.locator("table.meds")).toContainText("Osimertinib");
    await expect(page).toHaveTitle("Lung cancer: symptoms, treatment, medicines & latest research | Beat It");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/beat-it\/type\/lung\/$/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /lung/i);
    const ld = JSON.parse(await page.locator("#ld-json").textContent() || "{}");
    expect(ld["@graph"].map((n) => n["@type"])).toEqual(expect.arrayContaining(["MedicalCondition", "BreadcrumbList"]));
    await expect(page.locator("#approvals").getByRole("link", { name: "RSS feed" })).toBeVisible();
    await expect(page.locator(".page-tools")).toBeHidden(); // Share and Print need JavaScript
    await shot(page, "type-lung-no-js");
  });
});

test("unknown paths return the styled 404 page", async ({ page }) => {
  const res = await page.goto("no/such/page/");
  expect(res && res.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator(".topbar")).toHaveCSS("position", "sticky");
  // Suggestions depend on the requested URL, so the shared 404.html has none built in.
  expect(fs.readFileSync(path.join(SITE, "404.html"), "utf8")).not.toContain("nf-suggest");
  await page.goto("type/lungs/");
  const suggestion = page.locator(".nf-list li").first();
  await expect(suggestion).toContainText("Lung cancer");
  await suggestion.getByRole("link").click();
  await expect(page).toHaveURL(/\/beat-it\/type\/lung\/$/);
});

test("Atom feeds of new FDA approvals are valid and linked from the pages", async ({ page, request }) => {
  const lung = CANCERS.find((c) => c.id === "lung");
  const feeds = [["feed.xml", 0], ["type/lung/feed.xml", Math.min(50, new Set(lung.approvals.map((a) => a.url)).size)]];
  for (const [rel, count] of feeds) {
    const res = await request.get(rel);
    expect(res.ok()).toBe(true);
    const feed = await page.evaluate((xml) => {
      const atom = "http://www.w3.org/2005/Atom";
      const d = new DOMParser().parseFromString(xml, "application/xml");
      const entries = [...d.getElementsByTagNameNS(atom, "entry")];
      const text = (node, tag) => ((node.getElementsByTagNameNS(atom, tag)[0] || {}).textContent || "").trim();
      return { errors: d.getElementsByTagName("parsererror").length, ns: d.documentElement.namespaceURI, entries: entries.length,
        self: (d.querySelector('feed > link[rel="self"]') || { getAttribute: () => "" }).getAttribute("href"),
        complete: entries.every((e) => ["id", "title", "updated", "summary"].every((tag) => text(e, tag))) };
    }, await res.text());
    expect(feed).toMatchObject({ errors: 0, ns: "http://www.w3.org/2005/Atom", complete: true });
    expect(feed.self).toMatch(new RegExp("/beat-it/" + rel.replace(/\./g, "\\.") + "$"));
    if (count) expect(feed.entries).toBe(count);
    else expect(feed.entries).toBeGreaterThan(0);
  }
  await page.goto("type/lung/");
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  const href = await page.locator("#approvals").getByRole("link", { name: "RSS feed" }).evaluate((a) => a.href);
  expect(href).toMatch(/\/beat-it\/type\/lung\/feed\.xml$/);
  expect((await request.get(href)).ok()).toBe(true);
  await expect(page.locator('link[rel="alternate"][data-feed="type"]')).toHaveAttribute("href", /\/beat-it\/type\/lung\/feed\.xml$/);
});

test("sitemap lists every page", async ({ request }) => {
  const res = await request.get("sitemap.xml");
  expect(res.ok()).toBe(true);
  const xml = await res.text();
  expect((xml.match(/<loc>/g) || []).length).toBe(CANCERS.length + 1);
  for (const c of CANCERS) expect(xml).toContain(`/type/${c.id}/</loc>`);
});

test("client-side search and navigation work under the base path", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("type/breast/");
  await page.getByRole("combobox", { name: "Search cancer information" }).fill("tamoxifen");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/beat-it\/\?q=tamoxifen$/);
  await expect(page.locator("#results .result").first()).toContainText("Tamoxifen");
  await page.getByRole("link", { name: "Beat It home" }).click();
  await expect(page).toHaveURL(/\/beat-it\/$/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", HOME_DESC);
  await page.goto("#/type/lung");
  await expect(page).toHaveURL(/\/beat-it\/type\/lung\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Lung cancer" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("links and searches work before the data has loaded", async ({ page }) => {
  let release;
  const loaded = new Promise((resolve) => { release = resolve; });
  await page.route("**/data/faq.json", async (route) => {
    await loaded;
    await route.continue().catch(() => {}); // the request may have been cancelled by a navigation
  });
  await page.goto("./");
  await page.locator("#types").getByRole("link", { name: "Lung cancer", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Lung cancer" })).toBeVisible();
  const box = page.getByRole("combobox", { name: "Search cancer information" });
  await box.fill("tamoxifen");
  await box.press("Enter");
  release();
  await expect(page).toHaveURL(/\/beat-it\/\?q=tamoxifen$/);
  await expect(page.locator("#results .result").first()).toContainText("Tamoxifen");
});

test("prerendered content stays readable if the data fails to load", async ({ page }) => {
  await page.route("**/data/faq.json", (route) => route.abort());
  await page.goto("type/lung/");
  await expect(page.locator("html")).toHaveAttribute("data-error", "");
  await expect(page.getByRole("heading", { level: 1, name: "Lung cancer" })).toBeVisible();
  await expect(page.locator("#status")).toContainText("Could not load data");
});
