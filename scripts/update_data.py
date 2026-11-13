#!/usr/bin/env python3
"""Fetch the latest cancer research, clinical trials and news.

Writes ``site/data/updates.json`` which is rendered by the static site.
Uses only the Python standard library so it runs anywhere (including the
weekly GitHub Actions job) without installing dependencies.

Sources:
  * PubMed (NCBI E-utilities)   - the latest papers added in the last month per cancer type, preferring
                                   titles that name the type, without corrections, retraction notices,
                                   commentary or preprints
  * ClinicalTrials.gov API v2    - recently updated, recruiting interventional trials per cancer type,
                                   with age/sex eligibility and the countries where they run
  * RSS/Atom news feeds          - cancer news from health agencies ("official"),
                                   science news services ("research") and the press
                                   ("media"), tagged by cancer type

If a source fails, previously saved data for that source is kept so the
site never goes blank because of a temporary outage.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import email.utils
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CANCERS_FILE = ROOT / "site" / "data" / "cancers.json"
OUTPUT_FILE = ROOT / "site" / "data" / "updates.json"

USER_AGENT = "beat-it-cancer-updates/1.0 (+https://github.com/charles2ke/beat-it)"
TIMEOUT = 30

PUBMED_DAYS = 30
PUBMED_PER_TYPE = 6
PUBMED_FETCH = 40  # candidates: notices are dropped and titles that name the cancer type are preferred
TRIALS_PER_TYPE = 5
NEWS_DAYS = 14
NEWS_MAX = 60
MEDIA_MAX = 20  # press stories must not crowd out health agencies and science news

# (name, url, category). Trusted feeds come first so their copy of a story wins
# de-duplication. Category None marks an aggregator: each item is classified by
# its original publisher instead.
NEWS_FEEDS = [
    ("NCI", "https://www.cancer.gov/publishedcontent/rss/syndication/rss/ncinewsreleases.rss", "official"),
    ("IARC", "https://www.iarc.who.int/feed/?post_type=news-events", "official"),
    ("WHO", "https://www.who.int/rss-feeds/news-english.xml", "official"),
    ("ScienceDaily", "https://www.sciencedaily.com/rss/health_medicine/cancer.xml", "research"),
    ("Medical Xpress", "https://medicalxpress.com/rss-feed/cancer-news/", "research"),
    ("Google News", "https://news.google.com/rss/search?q=cancer+research+when:7d&hl=en-US&gl=US&ceid=US:en", None),
]

OFFICIAL_ACRONYMS = re.compile(r"\b(WHO|NCI|NIH|FDA|CDC|IARC|NHS|ESMO|ASCO|AACR)\b")
OFFICIAL_NAMES = re.compile(
    r"world health|national cancer institute|national institutes of health|food and drug|"
    r"centers for disease control|cancer research uk|american cancer society|macmillan",
    re.IGNORECASE,
)
# Checked before the official names so a society's news magazine (The ASCO Post) counts as science news.
RESEARCH_NAMES = re.compile(
    r"science ?daily|medical ?xpress|eurekalert|newswise|asco post|ecancer|nature|lancet|nejm|jama|bmj|"
    r"cell press|technology networks|news-medical|bioengineer|scitechdaily",
    re.IGNORECASE,
)

CANCER_WORDS = re.compile(
    r"\b(cancer|cancers|oncolog\w*|tumou?rs?|carcinoma\w*|leuka?emia\w*|lymphoma\w*|"
    r"melanoma\w*|myeloma\w*|sarcoma\w*|glioma\w*|glioblastoma\w*|metasta\w*|chemotherap\w*|"
    r"immunotherap\w*|neoplas\w*)\b",
    re.IGNORECASE,
)


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:  # noqa: S310 - fixed https URLs
        return resp.read()


def get_json(url: str, retries: int = 3) -> dict:
    for attempt in range(retries):
        try:
            return json.loads(http_get(url).decode("utf-8"))
        except Exception:  # network / rate-limit errors
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"GET request failed after {retries} attempts") from None


def safe_url(url: str | None) -> str | None:
    if not url:
        return None
    url = url.strip()
    return url if urllib.parse.urlparse(url).scheme in ("http", "https") else None


# Inline tags are dropped without a gap so "CD8<sup>+</sup>" stays "CD8+"; other tags become a space.
INLINE_TAG = re.compile(r"</?(?:a|b|em|i|span|strong|sub|sup|u)\b[^<>]*>", re.IGNORECASE)
ANY_TAG = re.compile(r"</?[a-z][^<>]*>", re.IGNORECASE)


def strip_tags(text: str) -> str:
    return ANY_TAG.sub(" ", INLINE_TAG.sub("", text))


def clean_text(text: str | None) -> str:
    """Plain text: markup removed (also when it was escaped twice) and entities such as &nbsp; decoded."""
    if not text:
        return ""
    text = strip_tags(html.unescape(strip_tags(text)))
    return re.sub(r"\s+", " ", text).strip()


# --------------------------------------------------------------------------- PubMed

# Publication types that are not new findings. Preprints are skipped because they are not peer reviewed.
PUBMED_SKIP_TYPES = ("published erratum", "retraction of publication", "retracted publication",
                     "expression of concern", "comment", "editorial", "news", "preprint")
# Correction and retraction notices, and replies to other papers, that are not tagged with one of the types
# above yet (the newest records often are not). Words that also start real titles ("Correction of
# hypercalcemia", "Retracted nipple", "Response to chemotherapy") only count in their notice or reply form.
NOTICE_TITLE = re.compile(
    r"^\W*(?:(?:author|publisher)\s+)?(?:"
    r"corrigend(?:um|a)\b|errat(?:um|a)\b|(?:editorial\s+)?expression\s+of\s+concern\b"
    r"|(?:statement|notice)\s+of\s+(?:retraction|concern)\b|(?:corrections?|retraction)\s+(?:note|notice)\b"
    r"|(?:corrections?|retraction|retracted|withdrawn)(?:\s*[:\]]|\s+(?:to|of|for)\s*[:\"'“‘\[])"
    r"|(?:in\s+)?reply\b|authors?['’]?s?['’]?\s+(?:reply|response)\b|re\s*:|comment(?:s|ary)?\s+on\b"
    r"|letter\s*:|letter\s+to\s+the\s+editor\b"
    r"|response\s+to\s*(?::|(?:the\s+)?(?:letters?|comments?|editor|correspondence)\b)"
    r")",
    re.IGNORECASE,
)
# PubMed publication type -> label shown next to a paper, strongest evidence first.
PAPER_KINDS = {
    "practice guideline": "Guideline",
    "guideline": "Guideline",
    "meta-analysis": "Meta-analysis",
    "systematic review": "Systematic review",
    "randomized controlled trial": "Randomized trial",
    "clinical trial, phase iv": "Phase 4 trial",
    "clinical trial, phase iii": "Phase 3 trial",
    "clinical trial, phase ii": "Phase 2 trial",
    "clinical trial, phase i": "Phase 1 trial",
    "controlled clinical trial": "Clinical trial",
    "clinical trial": "Clinical trial",
    "clinical trial protocol": "Trial protocol",
    "observational study": "Observational study",
    "review": "Review",
    "case reports": "Case report",
}
MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun",
                                      "jul", "aug", "sep", "oct", "nov", "dec"), 1)}


def pubmed_term(query: str) -> str:
    skip = " OR ".join(f"{t}[pt]" for t in PUBMED_SKIP_TYPES)
    # E-utilities rejects "AND NOT": NOT is a binary operator on its own.
    return f"({query}) AND (neoplasms[MeSH Terms] OR cancer[Title/Abstract]) NOT ({skip})"


def pubmed_date(value: str | None, today: dt.date) -> str:
    """"2026 Oct 9", "2026 Oct" or "2026/10/09 00:00" as an ISO date; "" if unparseable or in the future."""
    match = re.match(r"\s*(\d{4})[ /-]+([a-z]{3}|\d{1,2})[a-z]*(?:[ /-]+(\d{1,2})\b)?", value or "", re.IGNORECASE)
    if not match:
        return ""
    year, month, day = int(match[1]), match[2].lower(), match[3]
    month = MONTHS.get(month, 0) if month.isalpha() else int(month)
    if not 1 <= month <= 12:
        return ""
    if day:
        try:
            date = dt.date(year, month, int(day))
        except ValueError:
            return ""
        return date.isoformat() if date <= today else ""
    return f"{year}-{month:02d}" if (year, month) <= (today.year, today.month) else ""


def paper_date(rec: dict, today: dt.date) -> str:
    # Online-first date, else the issue date, else the day PubMed added the record. Issue dates of
    # print journals are often months ahead and are skipped while they are in the future.
    history = {h.get("pubstatus"): h.get("date") for h in rec.get("history", []) if isinstance(h, dict)}
    for value in (rec.get("epubdate"), rec.get("pubdate"), history.get("entrez"), history.get("pubmed")):
        date = pubmed_date(value, today)
        if date:
            return date
    return ""


def paper_kind(pubtypes: list[str]) -> str:
    types = {t.lower() for t in pubtypes}
    return next((label for name, label in PAPER_KINDS.items() if name in types), "")


def parse_pubmed_summary(data: dict, today: dt.date | None = None) -> list[dict]:
    """Papers in the order PubMed listed them, without correction/retraction notices and commentary."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    result = data.get("result", {})
    items = []
    for uid in result.get("uids", []):
        rec = result.get(uid, {})
        title = clean_text(rec.get("title"))
        pubtypes = [str(t) for t in rec.get("pubtype", [])]
        if not title or NOTICE_TITLE.match(title) or any(t.lower() in PUBMED_SKIP_TYPES for t in pubtypes):
            continue
        pmc = next((str(a.get("value", "")) for a in rec.get("articleids", []) if a.get("idtype") == "pmc"), "")
        items.append({
            "title": title,
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
            "journal": clean_text(rec.get("fulljournalname") or rec.get("source")),
            "date": paper_date(rec, today),
            "kind": paper_kind(pubtypes),
            "pmc": pmc if re.fullmatch(r"PMC\d+", pmc) else "",  # free full text in PubMed Central
            "pmid": uid,
        })
    return items


# Trailing words of a search term that do not say which cancer it is about.
GENERIC_WORDS = {"cancer", "cancers", "carcinoma", "carcinomas", "cell", "neoplasm", "neoplasms",
                 "squamous", "tumor", "tumors", "tumour", "tumours"}


def topic_pattern(cancer: dict) -> re.Pattern[str]:
    """Matches a title that names the cancer type: its name, an alias or a search term such as "head and neck"."""
    names = [cancer["name"].split("(")[0], *cancer.get("aliases", [])]
    for term in re.split(r"\s+OR\s+", cancer.get("query", "")):
        words = re.sub(r'[()"]', " ", term).split()
        while words and words[-1].lower() in GENERIC_WORDS:
            words.pop()
        names.append(" ".join(words))
    names = sorted({n.strip() for n in names if len(n.strip()) >= 4 or n.strip().isupper()})
    # As in tag_types, acronyms only count in capitals so that GIST does not match "the gist".
    alternatives = [re.escape(n) if n.isupper() else f"(?i:{re.escape(n)})" for n in names]
    return re.compile(r"\b(?:" + "|".join(alternatives) + r")s?\b")


def fetch_pubmed(query: str, topic: re.Pattern[str] | None = None) -> list[dict]:
    """The latest papers for a search, preferring those whose title matches ``topic``, newest first."""
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
    common = {"db": "pubmed", "retmode": "json", "tool": "beat-it"}
    if os.environ.get("NCBI_API_KEY"):
        common["api_key"] = os.environ["NCBI_API_KEY"]
    search = get_json(base + "esearch.fcgi?" + urllib.parse.urlencode({
        **common,
        "term": pubmed_term(query),
        "retmax": PUBMED_FETCH,
        # No "sort", so the papers added to PubMed most recently come first. Best Match ("relevance")
        # favoured broad reviews that only mention the cancer type, and publication date favoured
        # journals that date their print issues months ahead.
        "datetype": "edat",
        "reldate": PUBMED_DAYS,
    }))
    ids = search.get("esearchresult", {}).get("idlist", [])
    if not ids:
        return []
    time.sleep(0.4)  # stay under NCBI's 3 requests/second limit
    summary = get_json(base + "esummary.fcgi?" + urllib.parse.urlencode({**common, "id": ",".join(ids)}))
    rank = {uid: i for i, uid in enumerate(ids)}

    def order(paper: dict) -> tuple[bool, int]:
        named = bool(topic and topic.search(paper["title"]))
        return not named, rank.get(paper["pmid"], len(rank))

    papers = sorted(parse_pubmed_summary(summary), key=order)[:PUBMED_PER_TYPE]
    return sorted(papers, key=lambda p: p["date"], reverse=True)


# --------------------------------------------------------------------- ClinicalTrials

TRIAL_FIELDS = "NCTId,BriefTitle,OverallStatus,Phase,LastUpdatePostDate,MinimumAge,MaximumAge,Sex,LocationCountry"
# ClinicalTrials.gov uses ISO-style names ("Korea, Republic of"); show the everyday short form.
COUNTRY_NAMES = {
    "Korea, Republic of": "South Korea",
    "Korea, Democratic People's Republic of": "North Korea",
    "Congo, The Democratic Republic of the": "DR Congo",
}


def country_name(name: str) -> str:
    name = clean_text(name)
    return COUNTRY_NAMES.get(name) or name.split(",")[0].strip()


def parse_age(value: str | None) -> tuple[float, str] | None:
    """"18 Years" -> (18.0, "year"). "N/A", a missing value and age 0 mean no limit."""
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*([a-z]+?)s?\s*", value or "", re.IGNORECASE)
    if not match or float(match[1]) <= 0:
        return None
    return float(match[1]), match[2].lower()


def age_range(minimum: str | None, maximum: str | None) -> str:
    """Eligible ages in words, e.g. "18 years and older", "6 months to 21 years" or "" for any age."""
    def label(age: tuple[float, str]) -> str:
        return f"{age[0]:g} {age[1]}{'' if age[0] == 1 else 's'}"
    low, high = parse_age(minimum), parse_age(maximum)
    if low and high:
        return f"{low[0]:g} to {label(high)}" if low[1] == high[1] else f"{label(low)} to {label(high)}"
    if low:
        return f"{label(low)} and older"
    return f"up to {label(high)}" if high else ""


def parse_trials(data: dict) -> list[dict]:
    items = []
    for study in data.get("studies", []):
        proto = study.get("protocolSection", {})
        ident = proto.get("identificationModule", {})
        status = proto.get("statusModule", {})
        design = proto.get("designModule", {})
        eligibility = proto.get("eligibilityModule", {})
        locations = proto.get("contactsLocationsModule", {}).get("locations", [])
        nct = ident.get("nctId")
        if not nct or not re.fullmatch(r"NCT\d{8}", nct):
            continue
        phases = [p.replace("PHASE", "Phase ").replace("EARLY_", "Early ").replace("NA", "N/A")
                  for p in design.get("phases", [])]
        # Countries with the most study sites first.
        countries = collections.Counter(country_name(loc["country"]) for loc in locations if loc.get("country"))
        items.append({
            "title": clean_text(ident.get("briefTitle")),
            "url": f"https://clinicaltrials.gov/study/{nct}",
            "nctId": nct,
            "status": (status.get("overallStatus") or "").replace("_", " ").title(),
            "phase": ", ".join(phases),
            "updated": (status.get("lastUpdatePostDateStruct") or {}).get("date", ""),
            "ages": age_range(eligibility.get("minimumAge"), eligibility.get("maximumAge")),
            "sex": {"FEMALE": "Female", "MALE": "Male"}.get(eligibility.get("sex", ""), ""),  # "" = any sex
            "countries": [name for name, _ in countries.most_common()],
            "sites": len(locations),
        })
    return items


def fetch_trials(query: str) -> list[dict]:
    url = "https://clinicaltrials.gov/api/v2/studies?" + urllib.parse.urlencode({
        "query.cond": query,
        "filter.overallStatus": "RECRUITING",
        # Studies that test an intervention (treatment, screening, prevention…); observational ones only collect data.
        "filter.advanced": "AREA[StudyType]INTERVENTIONAL",
        "sort": "LastUpdatePostDate:desc",
        "pageSize": TRIALS_PER_TYPE,
        "fields": TRIAL_FIELDS,
        "format": "json",
    })
    return parse_trials(get_json(url))


# ------------------------------------------------------------------------------ News

def _text(el: ET.Element | None) -> str:
    return (el.text or "").strip() if el is not None else ""


def parse_date(value: str) -> dt.datetime | None:
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def parse_feed(xml_bytes: bytes, source: str) -> list[dict]:
    """Parse RSS 2.0 or Atom into a list of news items."""
    root = ET.fromstring(xml_bytes)
    atom = "{http://www.w3.org/2005/Atom}"
    items = []
    for node in root.iter():
        tag = node.tag
        if tag == "item":
            title = _text(node.find("title"))
            link = _text(node.find("link"))
            date = _text(node.find("pubDate")) or _text(node.find("{http://purl.org/dc/elements/1.1/}date"))
            desc = _text(node.find("description"))
            src = node.find("source")
            item_source = _text(src) or source
        elif tag == f"{atom}entry":
            title = _text(node.find(f"{atom}title"))
            link_el = node.find(f"{atom}link")
            link = link_el.get("href", "") if link_el is not None else ""
            date = _text(node.find(f"{atom}updated")) or _text(node.find(f"{atom}published"))
            desc = _text(node.find(f"{atom}summary"))
            item_source = source
        else:
            continue
        url = safe_url(link)
        title = clean_text(title)
        item_source = clean_text(item_source)
        if item_source:  # aggregator "Headline - Publisher", sometimes "Headline | Publisher - Publisher"
            title = re.sub(r"(?:\s+[-|–—]\s+" + re.escape(item_source) + r")+$", "", title)
        if not url or not title:
            continue
        parsed = parse_date(date)
        items.append({
            "title": title,
            "url": url,
            "source": item_source,
            "date": parsed.isoformat() if parsed else "",
            "summary": clean_text(desc)[:300],
        })
    return items


def classify_source(source: str) -> str:
    if RESEARCH_NAMES.search(source):
        return "research"
    if OFFICIAL_ACRONYMS.search(source) or OFFICIAL_NAMES.search(source):
        return "official"
    return "media"


def tag_types(text: str, cancers: list[dict]) -> list[str]:
    low = text.lower()
    tags = []
    for cancer in cancers:
        names = [cancer["name"].split("(")[0].strip(), *cancer.get("aliases", [])]
        keywords = [n.lower() for n in names if len(n) >= 4 or n.isupper()]
        for kw in keywords:
            if re.search(r"\b" + re.escape(kw) + r"\b", low if not kw.isupper() else text):
                tags.append(cancer["id"])
                break
    return tags


def filter_news(items: list[dict], cancers: list[dict], now: dt.datetime) -> list[dict]:
    cutoff = now - dt.timedelta(days=NEWS_DAYS)
    seen: set[str] = set()
    out = []
    for item in items:
        blob = f"{item['title']} {item.get('summary', '')}"
        if not CANCER_WORDS.search(blob):
            continue
        published = parse_date(item.get("date", ""))
        if not published or not cutoff <= published <= now:
            continue
        key = re.sub(r"\W+", "", item["title"].lower())[:80]
        if key in seen:
            continue
        seen.add(key)
        item["types"] = tag_types(blob, cancers)
        item["category"] = item.get("category") or classify_source(item.get("source", ""))
        out.append(item)
    return cap_news(out)


def cap_news(items: list[dict]) -> list[dict]:
    """Newest first; every official story is kept and press is capped at MEDIA_MAX."""
    newest = sorted(items, key=lambda i: i["date"] or "", reverse=True)
    official = [i for i in newest if i["category"] == "official"][:NEWS_MAX]
    others, media = [], 0
    for item in newest:
        if item["category"] == "official" or (item["category"] == "media" and media >= MEDIA_MAX):
            continue
        media += item["category"] == "media"
        others.append(item)
    picked = official + others[: NEWS_MAX - len(official)]
    return sorted(picked, key=lambda i: i["date"] or "", reverse=True)


def fetch_news(cancers: list[dict], now: dt.datetime,
               previous_news: list[dict] | None = None) -> tuple[list[dict], list[str], list[str]]:
    collected: list[dict] = []
    ok_sources = []
    failed_sources = []
    for name, url, category in NEWS_FEEDS:
        try:
            items = parse_feed(http_get(url), name)
        except Exception as err:
            log(f"  news: {name} FAILED: {err}")
            failed_sources.append(name)
            continue
        for item in items:
            item["feed"] = name
            item["category"] = category or classify_source(item["source"])
        collected.extend(items)
        ok_sources.append(name)
        log(f"  news: {name}: {len(items)} items")
    # A failed feed keeps its stories from the last run while they are still recent.
    collected.extend(item for item in previous_news or []
                     if (item.get("feed") or item.get("source")) in failed_sources)
    return filter_news(collected, cancers, now), ok_sources, failed_sources


# ------------------------------------------------------------------------------ Main

def load_previous(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def build(cancers: list[dict], previous: dict, now: dt.datetime) -> tuple[dict, list[str]]:
    errors: list[str] = []
    prev_types = previous.get("byType", {})
    by_type = {}
    for cancer in cancers:
        cid, query = cancer["id"], cancer.get("query", cancer["name"])
        topic = topic_pattern(cancer)
        prev = prev_types.get(cid, {})
        entry = {}
        for key, fetcher, args in (("research", fetch_pubmed, (query, topic)), ("trials", fetch_trials, (query,))):
            try:
                entry[key] = fetcher(*args)
            except Exception as err:
                errors.append(f"{key}/{cid}: {err}")
                entry[key] = prev.get(key, [])
            time.sleep(0.4)
        named = sum(1 for paper in entry["research"] if topic.search(paper.get("title", "")))
        log(f"{cid}: {len(entry['research'])} papers ({named} name the type), {len(entry['trials'])} trials")
        by_type[cid] = entry

    news, ok_sources, failed_sources = fetch_news(cancers, now, previous.get("news", []))
    errors.extend(f"news/{source}: feed failed" for source in failed_sources)
    if ok_sources:
        present = {item.get("feed") for item in news}
        news_sources = [name for name, _, _ in NEWS_FEEDS if name in ok_sources or name in present]
    else:  # total outage: keep the whole previous news section
        news = previous.get("news", [])
        news_sources = previous.get("sources", {}).get("news", [])

    return {
        "generatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sources": {
            "research": "PubMed (NCBI)",
            "trials": "ClinicalTrials.gov",
            "news": news_sources,
        },
        "byType": by_type,
        "news": news,
    }, errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, default=OUTPUT_FILE)
    parser.add_argument("--strict", action="store_true",
                        help="exit non-zero if any source failed (used in CI smoke tests)")
    args = parser.parse_args(argv)

    cancers = json.loads(CANCERS_FILE.read_text(encoding="utf-8"))
    previous = load_previous(args.output)
    data, errors = build(cancers, previous, dt.datetime.now(dt.timezone.utc))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    total_papers = sum(len(v["research"]) for v in data["byType"].values())
    total_trials = sum(len(v["trials"]) for v in data["byType"].values())
    log(f"Wrote {args.output}: {total_papers} papers, {total_trials} trials, {len(data['news'])} news items")
    for err in errors:
        log(f"WARNING: {err}")
    return 1 if (args.strict and errors) else 0


if __name__ == "__main__":
    sys.exit(main())
