"""Offline unit tests for scripts/update_data.py (no network access needed)."""

import datetime as dt
import json
import sys
import unittest
import urllib.parse
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

    def test_clean_text_decodes_entities_and_removes_markup(self):
        self.assertEqual(ud.clean_text("Phase&nbsp;3 &amp; beyond&#8230;"), "Phase 3 & beyond…")
        self.assertEqual(ud.clean_text("CD8<sup>+</sup> T cells<br/>in &lt;i&gt;KRAS&lt;/i&gt; NSCLC"),
                         "CD8+ T cells in KRAS NSCLC")
        self.assertEqual(ud.clean_text("Children &lt;5 years"), "Children <5 years")

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
        data = {"result": {"uids": ["123", "456", "789", "790", "791", "792"],
                           "123": {"title": "Trial of X", "fulljournalname": "J Onc", "pubdate": "2027 Mar",
                                   "epubdate": "2026 Oct 9",
                                   "pubtype": ["Journal Article", "Randomized Controlled Trial"],
                                   "articleids": [{"idtype": "pubmed", "value": "123"},
                                                  {"idtype": "pmc", "value": "PMC1234567"}]},
                           "456": {"title": ""},
                           "789": {"title": "[Corrigendum] Trial of X", "pubtype": ["Journal Article"]},
                           "790": {"title": "Trial of X", "pubtype": ["Published Erratum"]},
                           "791": {"title": "Correction of hypercalcemia in myeloma", "pubdate": "2027 Jan",
                                   "epubdate": "", "pubtype": ["Journal Article", "Review"],
                                   "history": [{"pubstatus": "received", "date": "2026/05/01 00:00"},
                                               {"pubstatus": "entrez", "date": "2026/10/02 06:00"}]},
                           "792": {"title": "Correction to Lung cancer screening outcomes",
                                   "pubtype": ["Journal Article"]}}}
        items = ud.parse_pubmed_summary(data, today=NOW.date())
        self.assertEqual([i["pmid"] for i in items], ["123", "791"])
        self.assertEqual(items[0]["url"], "https://pubmed.ncbi.nlm.nih.gov/123/")
        self.assertEqual(items[0]["date"], "2026-10-09")
        self.assertEqual(items[0]["kind"], "Randomized trial")
        self.assertEqual(items[0]["pmc"], "PMC1234567")
        # The issue date is in the future and there is no online date, so the day PubMed added it is used.
        self.assertEqual(items[1]["date"], "2026-10-02")
        self.assertEqual((items[1]["kind"], items[1]["pmc"]), ("Review", ""))

    def test_notice_titles(self):
        notices = ["[Corrigendum] Trial of X", 'Corrigendum to "Trial of X" [J Onc 12 (2026) 1-9]',
                   "Erratum: Trial of X", "Correction to: Trial of X", "Correction: Trial of X",
                   "Correction to Lung cancer screening outcomes", "Author Corrections to Trial of X",
                   "Author Correction: Trial of X", "Retraction Note: Trial of X", "RETRACTED: Trial of X",
                   "Statement of Retraction: Trial of X", "Expression of Concern: Trial of X",
                   "WITHDRAWN: Trial of X", "Retraction notice to “Trial of X”",
                   'Author\'s Reply Regarding "Trial of X"', "Authors' reply: Trial of X", "Reply to Smith et al.",
                   "In Reply", "Re: Trial of X", 'Comment on "Trial of X"', "Letter to the Editor regarding X",
                   "Letter: Trial of X", "Response to letter regarding Trial of X", "Response to: Trial of X"]
        papers = ["Correction of hypercalcemia in myeloma", "Correction toward normal in myeloma",
                  "Retracted nipple as a sign of breast cancer",
                  "Retraction of the mesentery in carcinoid tumours", "Erratic growth of low-grade glioma",
                  "Response to neoadjuvant chemotherapy in breast cancer", "Re-irradiation for recurrent glioma",
                  "Replication stress in ovarian cancer"]
        self.assertEqual([t for t in notices if not ud.NOTICE_TITLE.match(t)], [])
        self.assertEqual([t for t in papers if ud.NOTICE_TITLE.match(t)], [])

    def test_pubmed_date(self):
        cases = {"2026 Oct 9": "2026-10-09", "2026 Oct": "2026-10", "2026 Sep-Oct": "2026-09",
                 "2026/10/02 06:00": "2026-10-02", "2026 Oct 15": "", "2027 Mar": "", "2026 Fall": "",
                 "2026 Feb 30": "", "": ""}
        for value, expected in cases.items():
            self.assertEqual(ud.pubmed_date(value, NOW.date()), expected, value)

    def test_topic_pattern(self):
        cancers = {c["id"]: c for c in CANCERS}
        named = {"breast": "Breast tumour microenvironment", "head-neck": "Recurrent head and neck tumours",
                 "brain": "Gliomas in adults", "sarcoma": "GIST in Turner syndrome", "lung": "EGFR-mutant NSCLC"}
        unnamed = {"breast": "Breastfeeding after pregnancy", "head-neck": "Head-to-head comparison of antibodies",
                   "sarcoma": "The gist of cancer care", "lung": "Ferroptosis in health and disease"}
        for cid, title in named.items():
            self.assertTrue(ud.topic_pattern(cancers[cid]).search(title), title)
        for cid, title in unnamed.items():
            self.assertFalse(ud.topic_pattern(cancers[cid]).search(title), title)

    def test_fetch_pubmed_prefers_latest_papers_that_name_the_cancer_type(self):
        lung = next(c for c in CANCERS if c["id"] == "lung")
        ids = [str(n) for n in range(101, 101 + ud.PUBMED_FETCH)]  # most recently added first
        start = dt.date(2020, 1, 1)
        records = {uid: {"title": f"Paper {uid}", "epubdate": f"{start + dt.timedelta(days=int(uid)):%Y/%m/%d}"}
                   for uid in ids}
        for uid, title in {"102": "Erratum: Lung cancer screening", "104": "EGFR inhibitors in NSCLC",
                           "120": "Lung adenocarcinoma organoids", "133": "Small cell lung cancer outcomes"}.items():
            records[uid]["title"] = title
        summary = {"result": {"uids": ids[::-1], **records}}
        with mock.patch.object(ud, "get_json", side_effect=[{"esearchresult": {"idlist": ids}}, summary]) as get, \
                mock.patch.object(ud.time, "sleep"):
            papers = ud.fetch_pubmed("lung cancer", ud.topic_pattern(lung))
        search = urllib.parse.parse_qs(urllib.parse.urlparse(get.call_args_list[0][0][0]).query)
        self.assertNotIn("sort", search)
        self.assertEqual((search["datetype"], search["retmax"]), (["edat"], [str(ud.PUBMED_FETCH)]))
        self.assertIn(" NOT (published erratum[pt] OR ", search["term"][0])
        # The three papers about lung cancer, then the latest of the rest, shown newest first.
        self.assertEqual([p["pmid"] for p in papers], ["133", "120", "105", "104", "103", "101"])

    def test_parse_trials(self):
        data = {"studies": [
            {"protocolSection": {
                "identificationModule": {"nctId": "NCT01234567", "briefTitle": "A Study"},
                "statusModule": {"overallStatus": "RECRUITING", "lastUpdatePostDateStruct": {"date": "2026-10-01"}},
                "designModule": {"phases": ["PHASE2", "PHASE3"]},
                "eligibilityModule": {"sex": "FEMALE", "minimumAge": "18 Years", "maximumAge": "N/A"},
                "contactsLocationsModule": {"locations": [
                    {"country": "Japan"}, {"country": "Korea, Republic of"}, {"country": "United States"},
                    {"country": "Korea, Republic of"}, {"country": "Iran, Islamic Republic of"}]}}},
            {"protocolSection": {"identificationModule": {"nctId": "bad", "briefTitle": "x"}}},
            {"protocolSection": {"identificationModule": {"nctId": "NCT07654321", "briefTitle": "B Study"},
                                 "eligibilityModule": {"sex": "ALL"}}},
        ]}
        items = ud.parse_trials(data)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["status"], "Recruiting")
        self.assertEqual(items[0]["phase"], "Phase 2, Phase 3")
        self.assertEqual((items[0]["ages"], items[0]["sex"], items[0]["sites"]), ("18 years and older", "Female", 5))
        self.assertEqual(items[0]["countries"], ["South Korea", "Japan", "United States", "Iran"])
        self.assertEqual({k: items[1][k] for k in ("ages", "sex", "countries", "sites")},
                         {"ages": "", "sex": "", "countries": [], "sites": 0})

    def test_age_range(self):
        cases = {("18 Years", "75 Years"): "18 to 75 years", ("6 Months", "21 Years"): "6 months to 21 years",
                 ("18 Years", "N/A"): "18 years and older", (None, "1 Year"): "up to 1 year",
                 ("0 Years", None): "", ("N/A", "N/A"): ""}
        for (low, high), expected in cases.items():
            self.assertEqual(ud.age_range(low, high), expected, (low, high))

    def test_fetch_trials_only_requests_interventional_studies(self):
        with mock.patch.object(ud, "get_json", return_value={"studies": []}) as get:
            ud.fetch_trials("lung cancer")
        query = urllib.parse.parse_qs(urllib.parse.urlparse(get.call_args[0][0]).query)
        self.assertEqual(query["filter.advanced"], ["AREA[StudyType]INTERVENTIONAL"])
        self.assertEqual(query["filter.overallStatus"], ["RECRUITING"])


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
