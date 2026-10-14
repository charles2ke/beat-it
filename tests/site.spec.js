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

const shot = (page, name) =>
  page.screenshot({ path: `test-results/screenshots/${test.info().project.name}-${name}.png`, fullPage: true });

test.beforeEach(async ({ page }) => {
  await page.route("**/data/updates.json", (route) => route.fulfill({ json: FIXTURE }));
});

test("home page groups cancer types and shows latest news", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Solid tumors" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Blood cancers" })).toBeVisible();
  await expect(page.locator("article[data-type]")).toHaveCount(22);
  await expect(page.getByText("New immunotherapy combination extends survival")).toBeVisible();
  await expect(page.locator("#updated")).toContainText("Last updated");
  await shot(page, "home");
});

test("cancer type page shows treatments, medicines, research and trials", async ({ page }) => {
  await page.goto("/");
  await page.locator("#type-nav").getByRole("link", { name: "Lung cancer" }).click();
  await expect(page).toHaveURL(/#\/type\/lung$/);
  await expect(page.getByRole("heading", { level: 2, name: "Lung cancer" })).toBeVisible();
  await expect(page.locator("table.meds")).toContainText("Osimertinib");
  await expect(page.getByRole("link", { name: /Osimertinib after chemoradiation/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /New KRAS Inhibitor/ })).toBeVisible();
  await shot(page, "type-lung");
});

test("search finds medicines and questions across types", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox").fill("tamoxifen");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/#\/search\/tamoxifen$/);
  await expect(page.locator("#results .result").first()).toContainText("Tamoxifen");
  await expect(page.locator("#results .result").first()).toContainText("Breast cancer");

  await page.getByRole("searchbox").fill("what is immunotherapy");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.locator("#results .result").first()).toContainText("What is immunotherapy?");
  await expect(page.locator("#view").getByRole("link", { name: "PubMed" })).toHaveAttribute("href", /pubmed\.ncbi\.nlm\.nih\.gov\/\?term=what\+is\+immunotherapy/);
  await shot(page, "search");
});

test("search requires every query token", async ({ page }) => {
  await page.goto("/#/search/tamoxifen%20zzzzqqq");
  await expect(page.locator("#status")).toContainText("No results");
  await expect(page.locator("#results .result")).toHaveCount(0);
});

test("skip link focuses main without changing the route", async ({ page }) => {
  await page.goto("/#/type/lung");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/type\/lung$/);
  await expect(page.locator("#main")).toBeFocused();
});

test("two-column sections fit narrow viewports", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/#/type/lung");
  const grid = page.locator(".two-col").first();
  await expect.poll(() => grid.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("unknown queries offer live external search", async ({ page }) => {
  await page.goto("/#/search/zzzzqqq");
  await expect(page.locator("#status")).toContainText("No results");
  await expect(page.getByRole("link", { name: "ClinicalTrials.gov" }).first()).toBeVisible();
});

test("untrusted feed content is rendered as text and unsafe links are neutralised", async ({ page }) => {
  let dialog = false;
  page.on("dialog", (d) => { dialog = true; d.dismiss(); });
  await page.goto("/#/type/melanoma");
  const link = page.getByRole("link", { name: /Melanoma vaccine update/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "#");
  await expect(page.locator("#view img")).toHaveCount(0);
  expect(dialog).toBe(false);
});
