"""Offline unit tests for scripts/update_data.py (no network access needed)."""

import datetime as dt
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_data as ud  # noqa: E402

CANCERS = json.loads(ud.CANCERS_FILE.read_text(encoding="utf-8"))
NOW = dt.datetime(2026, 10, 14, tzinfo=dt.timezone.utc)

RSS = b"""<?xml version="1.0"?>
<rss version="2.0"><channel><title>t</title>
<item><title>New immunotherapy shrinks lung tumors</title><link>https://example.org/a</link>
<pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate><description>NSCLC study &lt;b&gt;results&lt;/b&gt;</description></item>
<item><title>Old breast cancer story</title><link>https://example.org/old</link>
<pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate></item>
<item><title>Unrelated heart news</title><link>https://example.org/b</link>
<pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Bad link cancer</title><link>javascript:alert(1)</link></item>
<item><title>New immunotherapy shrinks lung tumors!</title><link>https://example.org/dup</link>
<pubDate>Mon, 12 Oct 2026 09:00:00 GMT</pubDate></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title>
<entry><title>Melanoma vaccine trial update</title><link href="https://example.org/m"/>
<updated>2026-10-10T08:00:00Z</updated><summary>skin cancer</summary></entry>
</feed>"""

AGGREGATOR = b"""<?xml version="1.0"?>
<rss version="2.0"><channel><title>t</title>
<item><title>FDA approves new drug for lung cancer - U.S. Food and Drug Administration (.gov)</title>
<link>https://example.org/fda</link><pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate>
<source url="https://www.fda.gov">U.S. Food and Drug Administration (.gov)</source></item>
<item><title>Runner raises money for cancer charity - Local Paper</title>
<link>https://example.org/local</link><pubDate>Mon, 12 Oct 2026 11:00:00 GMT</pubDate>
<source url="https://example.org">Local Paper</source></item>
<item><title>Lab finding in lung cancer | Newswise - Newswise</title>
<link>https://example.org/newswise</link><pubDate>Mon, 12 Oct 2026 09:00:00 GMT</pubDate>
<source url="https://www.newswise.com">Newswise</source></item>
<item><title>Trial results in breast cancer - The ASCO Post</title>
<link>https://example.org/ascopost</link><pubDate>Mon, 12 Oct 2026 08:00:00 GMT</pubDate>
<source url="https://ascopost.com">The ASCO Post</source></item>
</channel></rss>"""


class FeedTests(unittest.TestCase):
    def test_parse_rss_skips_unsafe_links(self):
        items = ud.parse_feed(RSS, "Test")
        urls = [i["url"] for i in items]
        self.assertIn("https://example.org/a", urls)
        self.assertNotIn("javascript:alert(1)", urls)
        self.assertEqual(items[0]["summary"], "NSCLC study results")

    def test_parse_atom(self):
        items = ud.parse_feed(ATOM, "Atom")
        self.assertEqual(items[0]["url"], "https://example.org/m")
        self.assertTrue(items[0]["date"].startswith("2026-10-10"))

    def test_filter_news_relevance_age_dedupe_and_tags(self):
        items = ud.parse_feed(RSS, "Test") + ud.parse_feed(ATOM, "Atom")
        news = ud.filter_news(items, CANCERS, NOW)
        titles = [n["title"] for n in news]
        self.assertEqual(titles, ["New immunotherapy shrinks lung tumors", "Melanoma vaccine trial update"])
        self.assertIn("lung", news[0]["types"])
        self.assertIn("melanoma", news[1]["types"])

    def test_filter_news_requires_date_within_window(self):
        items = [
            {"title": "Cancer study missing date", "date": ""},
            {"title": "Cancer study invalid date", "date": "not a date"},
            {"title": "Cancer study in the future", "date": "2026-10-15T00:00:00Z"},
            {"title": "Cancer study at cutoff", "date": (NOW - dt.timedelta(days=ud.NEWS_DAYS)).isoformat()},
        ]
        news = ud.filter_news(items, CANCERS, NOW)
        self.assertEqual([item["title"] for item in news], ["Cancer study at cutoff"])

    def test_fetch_news_reports_partial_feed_failures(self):
        feeds = [("Healthy", "https://example.org/healthy", "research"),
                 ("Failed", "https://example.org/failed", "official")]
        with mock.patch.object(ud, "NEWS_FEEDS", feeds), \
                mock.patch.object(ud, "http_get", side_effect=[RSS, RuntimeError("offline")]):
            news, succeeded, failed = ud.fetch_news(CANCERS, NOW)
        self.assertTrue(news)
        self.assertEqual({(n["feed"], n["category"]) for n in news}, {("Healthy", "research")})
        self.assertEqual(succeeded, ["Healthy"])
        self.assertEqual(failed, ["Failed"])

    def test_aggregator_items_drop_publisher_suffix_and_are_classified(self):
        with mock.patch.object(ud, "NEWS_FEEDS", [("Aggregator", "https://example.org/agg", None)]), \
                mock.patch.object(ud, "http_get", return_value=AGGREGATOR):
            news, _, _ = ud.fetch_news(CANCERS, NOW)
        by_title = {n["title"]: n for n in news}
        self.assertEqual(by_title["FDA approves new drug for lung cancer"]["category"], "official")
        self.assertEqual(by_title["Runner raises money for cancer charity"]["category"], "media")
        self.assertEqual(by_title["Lab finding in lung cancer"]["category"], "research")
        self.assertEqual(by_title["Trial results in breast cancer"]["category"], "research")

    def test_cap_news_keeps_official_stories_and_limits_press(self):
        def hours_ago(n):
            return (NOW - dt.timedelta(hours=n)).isoformat()
        items = [{"title": f"Press {n}", "date": hours_ago(n), "category": "media"} for n in range(ud.NEWS_MAX)]
        items += [{"title": "Agency update", "date": hours_ago(ud.NEWS_MAX + 1), "category": "official"},
                  {"title": "Lab finding", "date": hours_ago(ud.NEWS_MAX + 2), "category": "research"}]
        news = ud.cap_news(items)
        categories = [n["category"] for n in news]
        self.assertEqual(categories.count("media"), ud.MEDIA_MAX)
        self.assertEqual(categories[-2:], ["official", "research"])


class ApiParsingTests(unittest.TestCase):
    def test_get_json_failure_does_not_expose_url_or_exception(self):
        secret = "sensitive-api-key"
        url = f"https://example.org/data?api_key={secret}"
        error = RuntimeError(f"request failed for {url}")
        with mock.patch.object(ud, "http_get", side_effect=error), \
                mock.patch.object(ud.time, "sleep"):
            with self.assertRaises(RuntimeError) as raised:
                ud.get_json(url, retries=1)
        self.assertNotIn(secret, str(raised.exception))
        self.assertNotIn(url, str(raised.exception))

    def test_parse_pubmed_summary(self):
        data = {"result": {"uids": ["123", "456"],
                           "123": {"title": "Trial of X", "fulljournalname": "J Onc", "pubdate": "2027 Mar",
                                   "epubdate": "2026 Oct 9"},
                           "456": {"title": ""}}}
        items = ud.parse_pubmed_summary(data)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["url"], "https://pubmed.ncbi.nlm.nih.gov/123/")
        self.assertEqual(items[0]["date"], "2026 Oct 9")

    def test_parse_trials(self):
        data = {"studies": [
            {"protocolSection": {
                "identificationModule": {"nctId": "NCT01234567", "briefTitle": "A Study"},
                "statusModule": {"overallStatus": "RECRUITING", "lastUpdatePostDateStruct": {"date": "2026-10-01"}},
                "designModule": {"phases": ["PHASE2", "PHASE3"]}}},
            {"protocolSection": {"identificationModule": {"nctId": "bad", "briefTitle": "x"}}},
        ]}
        items = ud.parse_trials(data)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["status"], "Recruiting")
        self.assertEqual(items[0]["phase"], "Phase 2, Phase 3")


class BuildTests(unittest.TestCase):
    def test_build_keeps_previous_data_when_sources_fail(self):
        previous = {"byType": {"breast": {"research": [{"title": "old"}], "trials": []}},
                    "news": [{"title": "old news"}], "sources": {"news": ["X"]}}
        boom = mock.Mock(side_effect=RuntimeError("offline"))
        with mock.patch.object(ud, "fetch_pubmed", boom), \
                mock.patch.object(ud, "fetch_trials", boom), \
                mock.patch.object(ud, "http_get", boom), \
                mock.patch.object(ud.time, "sleep"):
            data, errors = ud.build(CANCERS, previous, NOW)
        self.assertEqual(data["byType"]["breast"]["research"], [{"title": "old"}])
        self.assertEqual(data["news"], [{"title": "old news"}])
        self.assertTrue(errors)
        self.assertEqual(set(data["byType"]), {c["id"] for c in CANCERS})

    def test_failed_feed_keeps_its_recent_stories_from_last_run(self):
        recent = (NOW - dt.timedelta(days=3)).isoformat()
        stale = (NOW - dt.timedelta(days=ud.NEWS_DAYS + 1)).isoformat()
        previous = {"news": [
            {"title": "Saved cancer story", "url": "https://example.org/s", "source": "X", "feed": "Failed", "date": recent},
            {"title": "Stale cancer story", "url": "https://example.org/t", "source": "X", "feed": "Failed", "date": stale},
            {"title": "Replaced cancer story", "url": "https://example.org/r", "source": "Y", "feed": "Healthy", "date": recent},
        ], "sources": {"news": ["Healthy", "Failed"]}}
        feeds = [("Healthy", "https://example.org/healthy", "research"),
                 ("Failed", "https://example.org/failed", "official")]
        with mock.patch.object(ud, "NEWS_FEEDS", feeds), \
                mock.patch.object(ud, "http_get", side_effect=[RSS, RuntimeError("offline")]), \
                mock.patch.object(ud, "fetch_pubmed", return_value=[]), \
                mock.patch.object(ud, "fetch_trials", return_value=[]), \
                mock.patch.object(ud.time, "sleep"):
            data, errors = ud.build(CANCERS, previous, NOW)
        titles = [n["title"] for n in data["news"]]
        self.assertIn("New immunotherapy shrinks lung tumors", titles)
        self.assertIn("Saved cancer story", titles)
        self.assertNotIn("Stale cancer story", titles)
        self.assertNotIn("Replaced cancer story", titles)
        self.assertEqual(data["sources"]["news"], ["Healthy", "Failed"])
        self.assertIn("news/Failed: feed failed", errors)


if __name__ == "__main__":
    unittest.main()
