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
    await shot(page, "type-lung-no-js");
  });
});

test("unknown paths return the styled 404 page", async ({ page }) => {
  const res = await page.goto("no/such/page/");
  expect(res && res.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator(".topbar")).toHaveCSS("position", "sticky");
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
