#!/usr/bin/env python3
"""Fetch the latest cancer research, clinical trials and news.

Writes ``site/data/updates.json`` which is rendered by the static site.
Uses only the Python standard library so it runs anywhere (including the
weekly GitHub Actions job) without installing dependencies.

Sources:
  * PubMed (NCBI E-utilities)   - recent peer-reviewed publications per cancer type
  * ClinicalTrials.gov API v2    - recently updated, recruiting trials per cancer type
  * RSS/Atom news feeds          - worldwide cancer news, tagged by cancer type

If a source fails, previously saved data for that section is kept so the
site never goes blank because of a temporary outage.
"""

from __future__ import annotations

import argparse
import datetime as dt
import email.utils
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
TRIALS_PER_TYPE = 5
NEWS_DAYS = 14
NEWS_MAX = 60

NEWS_FEEDS = [
    ("Google News", "https://news.google.com/rss/search?q=cancer+research+when:7d&hl=en-US&gl=US&ceid=US:en"),
    ("ScienceDaily", "https://www.sciencedaily.com/rss/health_medicine/cancer.xml"),
    ("Medical Xpress", "https://medicalxpress.com/rss-feed/cancer-news/"),
    ("WHO", "https://www.who.int/rss-feeds/news-english.xml"),
]

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


def clean_text(text: str | None) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# --------------------------------------------------------------------------- PubMed

def pubmed_term(query: str) -> str:
    return f"({query}) AND (neoplasms[MeSH Terms] OR cancer[Title/Abstract])"


def parse_pubmed_summary(data: dict) -> list[dict]:
    result = data.get("result", {})
    items = []
    for uid in result.get("uids", []):
        rec = result.get(uid, {})
        title = clean_text(rec.get("title"))
        if not title:
            continue
        items.append({
            "title": title,
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
            "journal": clean_text(rec.get("fulljournalname") or rec.get("source")),
            "date": clean_text(rec.get("pubdate") or rec.get("sortpubdate", "")[:10]),
            "pmid": uid,
        })
    return items


def fetch_pubmed(query: str) -> list[dict]:
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
    common = {"db": "pubmed", "retmode": "json", "tool": "beat-it"}
    if os.environ.get("NCBI_API_KEY"):
        common["api_key"] = os.environ["NCBI_API_KEY"]
    search = get_json(base + "esearch.fcgi?" + urllib.parse.urlencode({
        **common,
        "term": pubmed_term(query),
        "retmax": PUBMED_PER_TYPE,
        "sort": "pub_date",
        "datetype": "pdat",
        "reldate": PUBMED_DAYS,
    }))
    ids = search.get("esearchresult", {}).get("idlist", [])
    if not ids:
        return []
    time.sleep(0.4)  # stay under NCBI's 3 requests/second limit
    summary = get_json(base + "esummary.fcgi?" + urllib.parse.urlencode({**common, "id": ",".join(ids)}))
    return parse_pubmed_summary(summary)


# --------------------------------------------------------------------- ClinicalTrials

def parse_trials(data: dict) -> list[dict]:
    items = []
    for study in data.get("studies", []):
        proto = study.get("protocolSection", {})
        ident = proto.get("identificationModule", {})
        status = proto.get("statusModule", {})
        design = proto.get("designModule", {})
        nct = ident.get("nctId")
        if not nct or not re.fullmatch(r"NCT\d{8}", nct):
            continue
        phases = [p.replace("PHASE", "Phase ").replace("EARLY_", "Early ").replace("NA", "N/A")
                  for p in design.get("phases", [])]
        items.append({
            "title": clean_text(ident.get("briefTitle")),
            "url": f"https://clinicaltrials.gov/study/{nct}",
            "nctId": nct,
            "status": (status.get("overallStatus") or "").replace("_", " ").title(),
            "phase": ", ".join(phases),
            "updated": (status.get("lastUpdatePostDateStruct") or {}).get("date", ""),
        })
    return items


def fetch_trials(query: str) -> list[dict]:
    url = "https://clinicaltrials.gov/api/v2/studies?" + urllib.parse.urlencode({
        "query.cond": query,
        "filter.overallStatus": "RECRUITING",
        "sort": "LastUpdatePostDate:desc",
        "pageSize": TRIALS_PER_TYPE,
        "fields": "NCTId,BriefTitle,OverallStatus,Phase,LastUpdatePostDate",
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
        if not url or not title:
            continue
        parsed = parse_date(date)
        items.append({
            "title": title,
            "url": url,
            "source": clean_text(item_source),
            "date": parsed.isoformat() if parsed else "",
            "summary": clean_text(desc)[:300],
        })
    return items


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
        out.append(item)
    out.sort(key=lambda i: i["date"] or "", reverse=True)
    return out[:NEWS_MAX]


def fetch_news(cancers: list[dict], now: dt.datetime) -> tuple[list[dict], list[str], list[str]]:
    collected: list[dict] = []
    ok_sources = []
    failed_sources = []
    for name, url in NEWS_FEEDS:
        try:
            items = parse_feed(http_get(url), name)
            collected.extend(items)
            ok_sources.append(name)
            log(f"  news: {name}: {len(items)} items")
        except Exception as err:
            log(f"  news: {name} FAILED: {err}")
            failed_sources.append(name)
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
        prev = prev_types.get(cid, {})
        entry = {}
        for key, fetcher in (("research", fetch_pubmed), ("trials", fetch_trials)):
            try:
                entry[key] = fetcher(query)
            except Exception as err:
                errors.append(f"{key}/{cid}: {err}")
                entry[key] = prev.get(key, [])
            time.sleep(0.4)
        log(f"{cid}: {len(entry['research'])} papers, {len(entry['trials'])} trials")
        by_type[cid] = entry

    news, ok_sources, failed_sources = fetch_news(cancers, now)
    news_sources = ok_sources
    if failed_sources:
        errors.extend(f"news/{source}: feed failed" for source in failed_sources)
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
