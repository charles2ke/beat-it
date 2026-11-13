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
  - Papers are labelled by study type (guideline, meta-analysis, randomized trial…) and link to free full text when PubMed Central has it.
  - Trials show who can join (ages, and sex when only one is eligible) and the countries where they run, with the number of sites.
  - **Share** and **Print** buttons. Printed pages use a clean light layout and include the address of each paper and trial.
- **What's new.** FDA oncology approvals since 2024, each linked to the official announcement. Approvals that cover several cancer types are shown once.
- **Approval feeds.** Follow new approvals in any feed reader: [`feed.xml`](https://charles2ke.github.io/beat-it/feed.xml) for all cancer types, or `type/<id>/feed.xml` for one (e.g. [lung](https://charles2ke.github.io/beat-it/type/lung/feed.xml)). The feeds are Atom and list up to 50 approvals each.
- **Helpful 404 page.** A mistyped address such as `/type/lungs/` suggests the pages it probably meant.
- **News labelled by source.** Stories are marked **Official** (health agencies and cancer organisations such as WHO, NCI, FDA and Cancer Research UK), **Science** (research news services and journals) or **Press**. They can be filtered, and press coverage is capped so it never crowds out official sources.
- **Key facts.** Global cancer statistics from WHO / IARC (GLOBOCAN 2024, released July 2026), each linked to its source.
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
| Cancer type overviews, symptoms, screening, treatments | [NCI](https://www.cancer.gov/types), [WHO](https://www.who.int/health-topics/cancer), [USPSTF](https://www.uspreventiveservicestaskforce.org/), [HRSA](https://www.hrsa.gov/womens-guidelines) | Reviewed by hand (`reviewed` date per type) |
| Medicines and new approvals | [FDA oncology approvals](https://www.fda.gov/drugs/resources-information-approved-drugs/oncology-cancer-hematologic-malignancies-approval-notifications) | Reviewed by hand |
| Key facts | [IARC / WHO GLOBOCAN 2024](https://gco.iarc.who.int/today), [WHO cancer fact sheet](https://www.who.int/news-room/fact-sheets/detail/cancer) | Reviewed by hand |
| Latest research | [PubMed](https://pubmed.ncbi.nlm.nih.gov/) (NCBI E-utilities) | Weekly, automatic |
| Recruiting trials | [ClinicalTrials.gov](https://clinicaltrials.gov/) API v2 | Weekly, automatic |
| News | RSS feeds from NCI, IARC, WHO, ScienceDaily, Medical Xpress and Google News, filtered for cancer topics and tagged by cancer type | Weekly, automatic |

- **Research** lists up to 6 papers per cancer type, newest first, from the latest added to PubMed in the last 30 days. Papers whose title names the cancer type are picked before broader papers that only mention it, and corrections, retraction notices, commentary and preprints are left out.
- **Trials** are recruiting interventional studies, which test a treatment or another intervention such as screening, most recently updated first (up to 5 per cancer type). Observational studies are left out.

If a source is temporarily unavailable, the updater keeps the last good data for that source (news is kept per feed), so the site never goes blank.

### Latest content review (12 November 2026)

- **Approvals.** 134 FDA oncology approvals from 2024 onward, across 22 cancer types. Each was checked against the opening paragraph of FDA's approval notice: link, date, wording, and accelerated or full approval. The notices were read from a third-party archive of FDA's oncology announcements covering up to **26 October 2026**, so later approvals will be added at the next review. Approvals for a new formulation only (such as an under-the-skin version of an existing medicine) are not listed.
- **Screening.** USPSTF recommendations as currently published (breast 2024, skin 2023, lung 2021, colorectal 2021, prostate 2018) and HRSA's 2026 women's preventive services guidelines for cervical screening. Pages also cover newer options: self-collected HPV tests and blood tests for colorectal screening.
- **Key facts.** GLOBOCAN 2024 (IARC with the American Cancer Society, July 2026) and the WHO cancer fact sheet.
- **Links.** `scripts/check_links.py` requests every source link in the curated data. CI runs it on each pull request and lists broken or unverified links in the job summary.

## Project layout

| Path | Purpose |
| --- | --- |
| `site/` | Website source (HTML shell, `assets/`, `data/`) |
| `site/data/cancers.json` | Curated information per cancer type |
| `site/data/faq.json` | Common questions with links to sources |
| `site/data/facts.json` | Key global statistics with sources |
| `site/data/updates.json` | Research, trials and news, **generated weekly**; don't edit by hand |
| `scripts/update_data.py` | Fetches the latest data (Python standard library only) |
| `scripts/check_links.py` | Checks that every source link in the curated data still works |
| `scripts/build.js` | Builds and prerenders the deployable site into `_site/`, plus `sitemap.xml` and the Atom approval feeds |
| `scripts/serve.py` | Local static server (dev mode, or GitHub Pages-like preview) |
| `scripts/generate-images.js` | Regenerates the PNG icons and social share image |
| `tests/` | Playwright end-to-end tests (`site.spec.js`, `prerender.spec.js`) |
| `.github/workflows/pages.yml` | Weekly data refresh, build and deploy to GitHub Pages |
| `.github/workflows/ci.yml` | PR checks: unit tests, live-source smoke test, source link check, build, Playwright |

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
npm run test:py        # offline unit tests for the data updater and link checker
python3 scripts/check_links.py   # check every source link in site/data (needs internet)
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
| `screeningSource` | Optional `{ name, url }` of the screening guideline, shown under the screening text |
| `approvals` | Optional `[{ date, drug, text, url, source }]` timeline, also shown under **What's new**. Approvals shared by several types are merged by `url`, so keep their `drug` and `text` identical |
| `nci` | Link to the NCI page for the cancer type |
| `query` | PubMed / ClinicalTrials.gov search query used by the updater |
| `reviewed` | Optional ISO date the content was last checked against its sources |

`site/data/updates.json` is written by the updater. `byType.<id>` holds the research and trials for each cancer type, and `news` holds the tagged stories:

| Field | Description |
| --- | --- |
| `research` | `[{ title, url, journal, date, kind, pmc, pmid }]`. `date` is an ISO date (`YYYY-MM` when PubMed gives no day) and never in the future. `kind` is the study type, e.g. `Randomized trial`. `pmc` is the PubMed Central ID for free full text. Both are `""` when unknown |
| `trials` | `[{ title, url, nctId, status, phase, updated, ages, sex, countries, sites }]`. `ages` reads like `18 years and older` and `sex` is `Female` or `Male`; `""` means no limit. `countries` lists the countries with the most sites first, and `sites` counts all study locations |

## Contributing content

Medicines listed are examples of approved therapies, not a complete list or a recommendation. When proposing changes, cite authoritative sources (NCI, WHO, FDA labels and announcements, USPSTF) and update the `reviewed` date.

## License

[AGPL-3.0](LICENSE)
