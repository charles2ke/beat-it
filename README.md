# Beat It 🎗️

**Cancer information from trusted sources, updated every week.**

[![CI](https://github.com/charles2ke/beat-it/actions/workflows/ci.yml/badge.svg)](https://github.com/charles2ke/beat-it/actions/workflows/ci.yml)
[![Deploy](https://github.com/charles2ke/beat-it/actions/workflows/pages.yml/badge.svg)](https://github.com/charles2ke/beat-it/actions/workflows/pages.yml)

Beat It is a free, fast, searchable website about cancer. It covers symptoms, risk factors, screening, treatments, approved medicines, new FDA approvals, recruiting clinical trials, the latest research and news for **22 cancer types**. Research, trials and news refresh automatically **every Monday**.

🌐 **Live site: https://charles2ke.github.io/beat-it/**

> ⚠️ **Medical disclaimer:** This site is for general information only and is not medical advice. Always talk to a qualified healthcare professional about diagnosis and treatment.

## Features

- **Instant search.** Suggestions appear as you type and work with the keyboard. Press <kbd>/</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> to search from any page.
  - Search covers cancer types, medicines, treatments, biomarkers (`EGFR`, `HER2`, `BRCA`), questions, approvals, papers, trials and news.
  - Small typos are corrected ("did you mean…"), and synonyms and abbreviations work (`chemo`, `NSCLC`, `CAR T`).
  - Results can be filtered by type.
  - Every search links to live results on PubMed, ClinicalTrials.gov, cancer.gov and WHO.
- **A page for every cancer type.** Each page has an overview, symptoms, risk factors, screening, treatment options and example medicines. Recently approved medicines get a **New** badge.
  - Pages also include an approvals timeline, the latest PubMed papers, recruiting trials and tagged news, with section navigation.
- **What's new.** Recent FDA oncology approvals, each linked to the official announcement.
- **News labelled by source.** Stories are marked **Official** (health agencies and cancer organisations such as WHO, NCI, FDA and Cancer Research UK), **Science** (research news services and journals) or **Press**. They can be filtered, and press coverage is capped so it never crowds out official sources.
- **Key facts.** Global cancer statistics from WHO / IARC (GLOBOCAN 2022), each linked to its source.
- **Design.**
  - Light and dark themes, responsive from 320 px phones to wide desktops.
  - Accessible: skip link, ARIA combobox search, visible focus, and respects reduced-motion settings.
  - Installable as an app (web manifest).
  - Self-hosted Inter font, no tracking, no third-party scripts, and a strict Content-Security-Policy.

## Easy to find in search engines

- **Clean URLs.** Each cancer type has its own page, e.g. [`/beat-it/type/breast/`](https://charles2ke.github.io/beat-it/type/breast/). Old `#/type/…` links redirect automatically.
- **Prerendered HTML.** Every page is rendered to static HTML at deploy time, so crawlers and visitors without JavaScript get the full content.
- **Rich metadata.** Each page has a unique title, description and canonical URL, plus Open Graph / Twitter cards with a share image. JSON-LD structured data includes `MedicalWebPage`, `MedicalCondition`, `Drug`, `BreadcrumbList`, `FAQPage`, `ItemList` and `WebSite`.
- **[`sitemap.xml`](https://charles2ke.github.io/beat-it/sitemap.xml)** lists every page with its last-updated date.
- **OpenSearch.** Browsers can add Beat It as a search engine, and `?q=` links open search results directly.
- Search result pages are `noindex`. The 404 page returns a real 404 status.

**After deploying**, submit `https://charles2ke.github.io/beat-it/sitemap.xml` in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters). Crawlers only read `robots.txt` at a domain root, so on a `github.io/beat-it/` project site the generated `robots.txt` only takes effect with a custom domain.

## Where the information comes from

| Content | Source | Updated |
| --- | --- | --- |
| Cancer type overviews, symptoms, screening, treatments | [NCI](https://www.cancer.gov/types), [WHO](https://www.who.int/health-topics/cancer), [USPSTF](https://www.uspreventiveservicestaskforce.org/) | Reviewed by hand (`reviewed` date per type) |
| Medicines and new approvals | [FDA oncology approvals](https://www.fda.gov/drugs/resources-information-approved-drugs/oncology-cancer-hematologic-malignancies-approval-notifications) | Reviewed by hand |
| Key facts | [WHO / IARC GLOBOCAN 2022](https://gco.iarc.who.int/) | Reviewed by hand |
| Latest research | [PubMed](https://pubmed.ncbi.nlm.nih.gov/) (NCBI E-utilities) | Weekly, automatic |
| Recruiting trials | [ClinicalTrials.gov](https://clinicaltrials.gov/) API v2 | Weekly, automatic |
| News | RSS feeds from WHO, ScienceDaily, Medical Xpress and Google News, filtered for cancer topics and tagged by cancer type | Weekly, automatic |

If a source is temporarily unavailable, the updater keeps the last good data for that source (news is kept per feed), so the site never goes blank.

## Project layout

| Path | Purpose |
| --- | --- |
| `site/` | Website source (HTML shell, `assets/`, `data/`) |
| `site/data/cancers.json` | Curated information per cancer type |
| `site/data/faq.json` | Common questions with links to sources |
| `site/data/facts.json` | Key global statistics with sources |
| `site/data/updates.json` | Research, trials and news, **generated weekly**; don't edit by hand |
| `scripts/update_data.py` | Fetches the latest data (Python standard library only) |
| `scripts/build.js` | Builds and prerenders the deployable site into `_site/`, plus `sitemap.xml` |
| `scripts/serve.py` | Local static server (dev mode, or GitHub Pages-like preview) |
| `scripts/generate-images.js` | Regenerates the PNG icons and social share image |
| `tests/` | Playwright end-to-end tests (`site.spec.js`, `prerender.spec.js`) |
| `.github/workflows/pages.yml` | Weekly data refresh, build and deploy to GitHub Pages |
| `.github/workflows/ci.yml` | PR checks: unit tests, live-source smoke test, build, Playwright |

## Run locally

Requires Node.js 20+ and Python 3.10+.

```bash
npm ci
npx playwright install chromium   # used by the build (prerendering) and tests

npm run serve          # source site → http://localhost:8080
npm run build          # prerender into _site/ (set SITE_URL=https://example.org/path/ to change the deploy URL)
npm run preview        # serve _site/ like GitHub Pages → http://localhost:8080/beat-it/
npm run update-data    # refresh site/data/updates.json from the live sources (needs internet)
npm run images         # regenerate icons and the social share image
```

## Tests

```bash
npm run test:py        # offline unit tests for the data updater
npm test               # build, then Playwright on desktop, mobile and the prerendered site
```

Screenshots are saved to `test-results/screenshots/`. In CI they are uploaded as the `playwright-screenshots` artifact, with the HTML report as `playwright-report` and a sample of the live data fetch as `live-updates-json`.

## Deployment

`.github/workflows/pages.yml` runs on every push to `main`, **every Monday at 06:00 UTC**, and on manual dispatch. It:

1. fetches the latest research, trials and news, and commits `site/data/updates.json` on scheduled and manual runs;
2. builds and prerenders the site with the GitHub Pages URL;
3. deploys `_site/` to GitHub Pages.

One-time setup: in **Settings → Pages**, set **Source** to **GitHub Actions**. Optionally add an `NCBI_API_KEY` repository secret for higher PubMed rate limits.

## Data model

`site/data/cancers.json` is an array of cancer types:

| Field | Description |
| --- | --- |
| `id`, `name`, `group`, `aliases` | Identity, page URL (`type/<id>/`), group (`Solid tumors`, `Blood cancers`, `Childhood cancers`) and search synonyms |
| `summary`, `symptoms`, `riskFactors`, `screening`, `treatments` | Overview content |
| `medicines` | `[{ name, use, since? }]`. `since` (ISO date of FDA approval) shows a **New** badge for 24 months |
| `approvals` | Optional `[{ date, drug, text, url, source }]` timeline, also shown under **What's new** |
| `nci` | Link to the NCI page for the cancer type |
| `query` | PubMed / ClinicalTrials.gov search query used by the updater |
| `reviewed` | Optional ISO date the content was last checked against its sources |

## Contributing content

Medicines listed are examples of approved therapies, not a complete list or a recommendation. When proposing changes, cite authoritative sources (NCI, WHO, FDA labels and announcements, USPSTF) and update the `reviewed` date.

## License

[AGPL-3.0](LICENSE)
