// @ts-check
const { test, expect } = require("@playwright/test");

// Deterministic sample of the weekly-generated data so tests don't depend on the network.
const FIXTURE = {
  generatedAt: "2026-10-12T06:00:00Z",
  sources: { research: "PubMed (NCBI)", trials: "ClinicalTrials.gov", news: ["Fixture"] },
  byType: {
    lung: {
      research: [{ title: "Osimertinib after chemoradiation in EGFR-mutated NSCLC", url: "https://pubmed.ncbi.nlm.nih.gov/1/", journal: "Sample Journal",
        date: "2026-10-09", kind: "Randomized trial", pmc: "PMC1234567", pmid: "1" }],
      trials: [{ title: "A Phase 3 Study of a New KRAS Inhibitor", url: "https://clinicaltrials.gov/study/NCT00000001", nctId: "NCT00000001", status: "Recruiting", phase: "Phase 3", updated: "2026-10-01",
        ages: "18 years and older", sex: "", countries: ["United States", "Canada", "Japan", "Spain"], sites: 12 }],
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

test("research and trials show paper type, free full text, eligibility and locations", async ({ page }) => {
  await page.goto("/type/lung/");
  const paper = page.locator("#research .items li").first();
  await expect(paper.locator(".badge.paper")).toHaveText("Randomized trial");
  await expect(paper.locator(".meta")).toContainText("Oct 9, 2026");
  await expect(paper.getByRole("link", { name: "Free full text" })).toHaveAttribute("href", "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/");
  const trial = page.locator("#trials .items li").first();
  await expect(trial.locator(".trial-details")).toContainText("Ages 18 years and older");
  await expect(trial.locator(".where")).toHaveText("United States, Canada, Japan +1 more · 12 sites");
  await expect(trial.locator(".where")).toHaveAttribute("title", "United States, Canada, Japan, Spain");
  await expect(trial.locator(".trial-details")).not.toContainText("only"); // open to all sexes

  await page.goto("/?q=kras%20spain");
  await expect(page.locator("#results .result").first()).toContainText("New KRAS Inhibitor");
});

test("share uses the share sheet when available, otherwise copies the page link", async ({ page }) => {
  await page.addInitScript(() => {
    window.__shared = [];
    window.__copied = [];
    const share = async (data) => { window.__shared.push(data); };
    Object.defineProperty(navigator, "share", { configurable: true, get: () => (window.__noShare ? undefined : share) });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.__copied.push(text); } } });
  });
  const url = "https://charles2ke.github.io/beat-it/type/lung/";
  await page.goto("/type/lung/");
  const button = page.locator('button[data-action="share"]');
  await expect(button).toHaveAccessibleName("Share");
  await button.click();
  await expect.poll(() => page.evaluate(() => window.__shared))
    .toEqual([{ title: "Lung cancer: symptoms, treatment, medicines & latest research | Beat It", url }]);

  await page.evaluate(() => { window.__noShare = true; });
  await button.click();
  await expect(button).toHaveText("Link copied");
  expect(await page.evaluate(() => window.__copied)).toEqual([url]);
  await expect(page.locator("#status")).toHaveText("Link copied to clipboard.");
  await expect(button).toHaveText("Share", { timeout: 5000 });
});

test("print opens the print dialog and prints a light layout even in dark mode", async ({ page }) => {
  await page.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/type/lung/");
  await page.getByRole("button", { name: "Print" }).click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);

  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".type-summary")).toHaveCSS("color", "rgb(51, 51, 51)");
  await expect(page.locator(".page-tools")).toBeHidden();
  await expect(page.locator(".subnav")).toBeHidden();
  await shot(page, "type-lung-print");
});

test("FDA approval feeds are linked on the page and advertised to feed readers", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-12T12:00:00Z")); // so "What's new" has recent approvals
  await page.goto("/");
  await expect(page.locator("#whats-new").getByRole("link", { name: "RSS feed" })).toHaveAttribute("href", "feed.xml");
  await expect(page.locator('link[rel="alternate"][type="application/atom+xml"]')).toHaveAttribute("href", "https://charles2ke.github.io/beat-it/feed.xml");

  await page.goto("/type/lung/");
  await expect(page.locator("#approvals").getByRole("link", { name: "RSS feed" })).toHaveAttribute("href", "type/lung/feed.xml");
  const typeFeed = page.locator('link[rel="alternate"][data-feed="type"]');
  await expect(typeFeed).toHaveAttribute("href", "https://charles2ke.github.io/beat-it/type/lung/feed.xml");
  await expect(typeFeed).toHaveAttribute("title", "Lung cancer – new FDA approvals | Beat It");
  await page.locator("#type-nav").getByRole("link", { name: "Breast" }).click();
  await expect(typeFeed).toHaveAttribute("href", "https://charles2ke.github.io/beat-it/type/breast/feed.xml");
  await page.getByRole("link", { name: "Beat It home" }).click();
  await expect(typeFeed).toHaveCount(0);
});

test("page not found suggests pages that match the mistyped address", async ({ page }) => {
  await page.goto("/type/lungs/");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  const suggestions = page.locator(".nf-list li");
  await expect(suggestions.first()).toContainText("Lung cancer");
  await expect(page.getByRole("link", { name: "See all results for “lungs”" })).toHaveAttribute("href", "./?q=lungs");
  await shot(page, "not-found");
  await suggestions.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/type\/lung\/$/);

  await page.goto("/no/such/page/"); // "page" must not be spell-corrected into an unrelated suggestion such as "age"
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.locator(".nf-suggest")).toHaveCount(0);
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

test("object property names in queries and URLs don't break the app", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?q=immunotherapy%20constructor");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("“immunotherapy constructor”");
  await page.goto("/type/constructor/");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  expect(errors).toEqual([]);
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
