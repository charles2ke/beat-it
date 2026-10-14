# beat-it
Beat Cancer 🆘

**Beat It** is a free, static website for searching cancer questions, treatments, medicines, clinical trials and the latest research — grouped by cancer type. Research, trials and news are refreshed automatically **every week**.

🌐 **Live site:** https://charles2ke.github.io/beat-it/ (available once GitHub Pages is enabled and `main` has been deployed — see [Deployment](#deployment)).

> ⚠️ **Medical disclaimer:** This site is for general information only and is not medical advice. Always talk to a qualified healthcare professional.

## Features

- **Search anything** – questions ("what is immunotherapy"), drugs ("tamoxifen"), treatments, biomarkers ("EGFR", "HER2"), trials and news. Every search also has one-click links to search PubMed, ClinicalTrials.gov, cancer.gov and WHO live.
- **Grouped by cancer type** – 22 types across *Solid tumors*, *Blood cancers* and *Childhood cancers*. Each page lists symptoms, risk factors, screening, treatment options, example medicines, latest papers, recruiting trials and related news.
- **Weekly automatic updates** – a scheduled GitHub Action pulls:
  - recent publications from **PubMed** (NCBI E-utilities)
  - recently updated, recruiting studies from **ClinicalTrials.gov** (API v2)
  - worldwide cancer news from public RSS feeds (Google News, ScienceDaily, Medical Xpress, WHO), filtered for cancer topics and tagged by cancer type
- No build step, no tracking, no third-party scripts (strict Content-Security-Policy).

## Project layout

| Path | Purpose |
| --- | --- |
| `site/` | The static website published to GitHub Pages |
| `site/data/cancers.json` | Curated information per cancer type (edit to add/modify types) |
| `site/data/faq.json` | Common cancer questions |
| `site/data/updates.json` | Auto-generated weekly research, trials and news |
| `scripts/update_data.py` | Fetches the latest data (Python standard library only) |
| `scripts/test_update_data.py` | Offline unit tests for the updater |
| `tests/site.spec.js` | Playwright end-to-end tests |
| `.github/workflows/pages.yml` | Weekly data refresh + deploy to GitHub Pages |
| `.github/workflows/ci.yml` | PR checks: unit tests, live fetch smoke test, Playwright |

## Run locally

```bash
npm run serve            # http://localhost:8080
npm run update-data      # refresh site/data/updates.json (needs internet)
```

## Tests

```bash
npm run test:py          # Python unit tests for the data updater
npm ci && npx playwright install chromium
npm test                 # Playwright end-to-end tests (screenshots in test-results/screenshots/)
```

## Deployment

`.github/workflows/pages.yml` runs on every push to `main`, **every Monday at 06:00 UTC**, and on manual dispatch. It fetches the latest data, commits `site/data/updates.json` (scheduled/manual runs), and deploys `site/` to GitHub Pages.

One-time setup: in **Settings → Pages**, set **Source** to **GitHub Actions** (the workflow also attempts to enable Pages automatically). Optionally add an `NCBI_API_KEY` repository secret for higher PubMed rate limits.

## Contributing content

Cancer type information lives in `site/data/cancers.json`. Medicines listed are examples of approved therapies, not a complete list or a recommendation. Please cite authoritative sources (e.g. NCI, WHO, FDA labels) when proposing changes.

## License

[AGPL-3.0](LICENSE)
