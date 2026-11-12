#!/usr/bin/env python3
"""Check that the source links in the curated data files still work.

Requests every https URL in site/data/cancers.json, faq.json and facts.json.
Links that return 404 or 410 are reported as broken (exit code 1). Other failures
(403, 429, 5xx, timeouts) are reported as unverified, because some sites block
automated requests. Hosts are checked in parallel, but requests to the same host
are sent one at a time with a pause, so large sites are not flooded.
Set GITHUB_STEP_SUMMARY to also write a Markdown report.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit

DATA = Path(__file__).resolve().parent.parent / "site" / "data"
FILES = ("cancers.json", "faq.json", "facts.json")
USER_AGENT = "beat-it-link-check/1.0 (+https://github.com/charles2ke/beat-it)"
TIMEOUT = 30
BROKEN = {404, 410}
PAUSE = 0.3  # seconds between requests to the same host


def collect_urls(data_dir: Path = DATA) -> dict[str, str]:
    """Map each URL to where it was first found, e.g. "cancers.json leukemia approvals url"."""
    urls: dict[str, str] = {}

    def walk(value, where):
        if isinstance(value, str):
            if value.startswith("https://"):
                urls.setdefault(value, where)
        elif isinstance(value, list):
            for item in value:
                walk(item, where)
        elif isinstance(value, dict):
            if isinstance(value.get("id"), str):
                where += " " + value["id"]
            for key, item in value.items():
                walk(item, f"{where} {key}")

    for name in FILES:
        path = data_dir / name
        if path.exists():
            walk(json.loads(path.read_text(encoding="utf-8")), name)
    return urls


def check(url: str) -> tuple[str, str]:
    """Return (result, detail) where result is "ok", "broken" or "unverified"."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:  # noqa: S310 - https URLs from our own data
            return "ok", f"HTTP {resp.status}"
    except urllib.error.HTTPError as err:
        return ("broken" if err.code in BROKEN else "unverified"), f"HTTP {err.code}"
    except Exception as err:  # timeouts, TLS and connection errors
        return "unverified", type(err).__name__


def check_host(urls: list[str]) -> list[tuple[str, tuple[str, str]]]:
    results = []
    for i, url in enumerate(urls):
        if i:
            time.sleep(PAUSE)
        results.append((url, check(url)))
    return results


def main() -> int:
    urls = collect_urls()
    by_host: dict[str, list[str]] = defaultdict(list)
    for url in urls:
        by_host[urlsplit(url).hostname or ""].append(url)
    results: dict[str, tuple[str, str]] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for pairs in pool.map(check_host, by_host.values()):
            results.update(pairs)
    counts = {"ok": 0, "broken": 0, "unverified": 0}
    rows = []
    for url, (result, detail) in sorted(results.items(), key=lambda r: (r[1][0] == "ok", r[0])):
        counts[result] += 1
        if result != "ok":
            print(f"{result.upper():10} {detail:20} {url}  ({urls[url]})")
            rows.append(f"| {result} | {detail} | {url} | {urls[url]} |")
    summary = f"{len(urls)} links: {counts['ok']} ok, {counts['broken']} broken, {counts['unverified']} unverified"
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
            out.write(f"### Source links\n\n{summary}\n\n")
            if rows:
                out.write("| Result | Detail | URL | Found in |\n|---|---|---|---|\n" + "\n".join(rows) + "\n")
    return 1 if counts["broken"] else 0


if __name__ == "__main__":
    sys.exit(main())
