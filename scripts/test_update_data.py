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
                           "123": {"title": "Trial of X", "fulljournalname": "J Onc", "pubdate": "2026 Oct"},
                           "456": {"title": ""}}}
        items = ud.parse_pubmed_summary(data)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["url"], "https://pubmed.ncbi.nlm.nih.gov/123/")

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


if __name__ == "__main__":
    unittest.main()
