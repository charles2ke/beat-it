// @ts-check
const { test, expect } = require("@playwright/test");

// Deterministic sample of the weekly-generated data so tests don't depend on the network.
const FIXTURE = {
  generatedAt: "2026-10-12T06:00:00Z",
  sources: { research: "PubMed (NCBI)", trials: "ClinicalTrials.gov", news: ["Fixture"] },
  byType: {
    lung: {
      research: [{ title: "Osimertinib after chemoradiation in EGFR-mutated NSCLC", url: "https://pubmed.ncbi.nlm.nih.gov/1/", journal: "Sample Journal", date: "2026 Oct" }],
      trials: [{ title: "A Phase 3 Study of a New KRAS Inhibitor", url: "https://clinicaltrials.gov/study/NCT00000001", nctId: "NCT00000001", status: "Recruiting", phase: "Phase 3", updated: "2026-10-01" }],
    },
  },
  news: [
    { title: "New immunotherapy combination extends survival in lung cancer", url: "https://example.org/news1", source: "Fixture", date: "2026-10-11T10:00:00+00:00", types: ["lung"] },
    { title: "<img src=x onerror=alert(1)> Melanoma vaccine update", url: "javascript:alert(1)", source: "Fixture", date: "2026-10-10T10:00:00+00:00", types: ["melanoma"] },
  ],
};

const shot = (page, name, fullPage = true) =>
  page.screenshot({ path: `test-results/screenshots/${test.info().project.name}-${name}.png`, fullPage, animations: "disabled" });
const searchBox = (page) => page.getByRole("combobox", { name: "Search cancer information" });

test.beforeEach(async ({ page }) => {
  await page.route("**/data/updates.json", (route) => route.fulfill({ json: FIXTURE }));
});

test("home page groups cancer types and shows latest news", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /^Solid tumors/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Blood cancers/ })).toBeVisible();
  await expect(page.locator("article[data-type]")).toHaveCount(22);
  await expect(page.getByText("New immunotherapy combination extends survival")).toBeVisible();
  await expect(page.locator("#updated")).toContainText("Last updated");
  await shot(page, "home");
});

test("cancer type page shows treatments, medicines, research and trials", async ({ page }) => {
  await page.goto("/");
  await page.locator("#types").getByRole("link", { name: "Lung cancer", exact: true }).click();
  await expect(page).toHaveURL(/\/type\/lung\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Lung cancer" })).toBeVisible();
  await expect(page.locator("table.meds")).toContainText("Osimertinib");
  await expect(page.getByRole("link", { name: /Osimertinib after chemoradiation/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /New KRAS Inhibitor/ })).toBeVisible();
  await shot(page, "type-lung");
});

test("search finds medicines and questions across types", async ({ page }) => {
  await page.goto("/");
  await searchBox(page).fill("tamoxifen");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\?q=tamoxifen$/);
  await expect(page.locator("#results .result").first()).toContainText("Tamoxifen");
  await expect(page.locator("#results .result").first()).toContainText("Breast cancer");

  await searchBox(page).fill("what is immunotherapy");
  await searchBox(page).press("Enter");
  await expect(page.locator("#results .result").first()).toContainText("What is immunotherapy?");
  await expect(page.locator("#view").getByRole("link", { name: "PubMed", exact: true })).toHaveAttribute("href", /pubmed\.ncbi\.nlm\.nih\.gov\/\?term=what\+is\+immunotherapy/);
  await shot(page, "search");
});

test("search requires every query token", async ({ page }) => {
  await page.goto("/?q=tamoxifen%20zzzzqqq");
  await expect(page.locator("#status")).toContainText("No results");
  await expect(page.locator("#results .result")).toHaveCount(0);
});

test("search corrects small misspellings", async ({ page }) => {
  await page.goto("/?q=imunotherapy");
  await expect(page.locator(".did-you-mean")).toContainText("immunotherapy");
  await expect(page.locator("#results .result").first()).toBeVisible();
});

test("search ranks curated pages above feed items and merges shared medicines", async ({ page }) => {
  const paper = { title: "Long-term outcomes of risk-reducing surgery in BRCA carriers: a retrospective multicentre cohort study",
    url: "https://pubmed.ncbi.nlm.nih.gov/2/", journal: "Sample Journal", date: "2026 Oct" };
  await page.route("**/data/updates.json", (route) => route.fulfill({ json: { ...FIXTURE, byType: { breast: { research: [paper], trials: [] } } } }));
  const results = page.locator("#results .result");

  await page.goto("/?q=BRCA");
  await expect(results.first()).toHaveAttribute("data-kind", "Cancer type");
  await expect(results.filter({ hasText: "risk-reducing surgery" })).toHaveCount(1);

  await page.goto("/?q=breast%20cancer%20symptoms");
  await expect(results.first()).toContainText("Breast cancer");

  await page.goto("/?q=pembrolizumab");
  const merged = results.filter({ has: page.getByRole("heading", { name: "Pembrolizumab", exact: true }) });
  await expect(merged).toHaveCount(1);
  expect(await merged.locator(".uses li").count()).toBeGreaterThan(1);
});

test("typeahead suggests pages and works with the keyboard", async ({ page }) => {
  await page.goto("/");
  await searchBox(page).fill("lung");
  const first = page.getByRole("option").first();
  await expect(first).toContainText("Lung cancer");
  await shot(page, "suggestions", false);
  await searchBox(page).press("ArrowDown");
  await expect(searchBox(page)).toHaveAttribute("aria-activedescendant", "sug-0");
  await searchBox(page).press("Enter");
  await expect(page).toHaveURL(/\/type\/lung\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Lung cancer" })).toBeFocused();
});

test("legacy hash links redirect and browser history works", async ({ page }) => {
  await page.goto("/#/search/tamoxifen");
  await expect(page).toHaveURL(/\/\?q=tamoxifen$/);
  await page.goto("/#/type/lung");
  await expect(page).toHaveURL(/\/type\/lung\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Lung cancer" })).toBeVisible();
  await page.locator("#type-nav").getByRole("link", { name: "Breast" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Breast cancer" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/type\/lung\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Lung cancer" })).toBeVisible();
});

test("pages have search-friendly titles, canonical URLs and structured data", async ({ page }) => {
  await page.goto("/type/lung/");
  await expect(page).toHaveTitle("Lung cancer: symptoms, treatment, medicines & latest research | Beat It");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://charles2ke.github.io/beat-it/type/lung/");
  const ld = JSON.parse(await page.locator("#ld-json").textContent() || "{}");
  const kinds = (ld["@graph"] || []).map((n) => n["@type"]);
  expect(kinds).toEqual(expect.arrayContaining(["MedicalWebPage", "MedicalCondition", "BreadcrumbList"]));

  await page.goto("/?q=tamoxifen");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/no-such-page/");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("theme toggle switches and remembers dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  await shot(page, "home-dark", false);
});

test("skip link focuses main without changing the route", async ({ page }) => {
  await page.goto("/type/lung/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/type\/lung\/$/);
  await expect(page.locator("#main")).toBeFocused();
});

test("two-column sections fit narrow viewports", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/type/lung/");
  const grid = page.locator(".two-col").first();
  await expect.poll(() => grid.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("unknown queries offer live external search", async ({ page }) => {
  await page.goto("/?q=zzzzqqq");
  await expect(page.locator("#status")).toContainText("No results");
  await expect(page.locator("#view").getByRole("link", { name: "ClinicalTrials.gov", exact: true })).toBeVisible();
});

test("untrusted feed content is rendered as text and unsafe links are neutralised", async ({ page }) => {
  let dialog = false;
  page.on("dialog", (d) => { dialog = true; d.dismiss(); });
  await page.goto("/type/melanoma/");
  const link = page.getByRole("link", { name: /Melanoma vaccine update/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "#");
  await expect(page.locator("#view img")).toHaveCount(0);
  expect(dialog).toBe(false);
});
