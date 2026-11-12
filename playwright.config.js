// @ts-check
const { defineConfig, devices } = require("@playwright/test");

// "desktop" and "mobile" test the source site/ (client-side rendering, served at /). "prerendered" tests
// the deployable _site/ build (run `npm run build` first) served under /beat-it/ like GitHub Pages.
module.exports = defineConfig({
  testDir: "./tests",
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: [
    { command: "python3 scripts/serve.py --dir site --port 4173", port: 4173, reuseExistingServer: !process.env.CI },
    { command: "python3 scripts/serve.py --dir _site --port 4174 --base /beat-it/ --pages", port: 4174, reuseExistingServer: !process.env.CI },
  ],
  projects: [
    { name: "desktop", testIgnore: /prerender\.spec/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testIgnore: /prerender\.spec/, use: { ...devices["Pixel 7"] } },
    { name: "prerendered", testMatch: /prerender\.spec/, use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4174/beat-it/" } },
  ],
});
