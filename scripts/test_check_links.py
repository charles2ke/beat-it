"""Offline unit tests for scripts/check_links.py (no network access needed)."""

import io
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_links as cl  # noqa: E402


def http_error(code):
    return urllib.error.HTTPError("https://example.org/x", code, "error", {}, io.BytesIO())


class CollectUrlsTest(unittest.TestCase):
    def test_finds_nested_https_urls_once_with_their_location(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            (data / "cancers.json").write_text(json.dumps([
                {"id": "lung", "nci": "https://www.cancer.gov/types/lung",
                 "approvals": [{"url": "https://www.fda.gov/a"}, {"url": "https://www.fda.gov/a"}],
                 "query": "http://insecure.example.org not-a-url"}]), encoding="utf-8")
            (data / "faq.json").write_text(json.dumps([{"q": "Q", "link": "https://www.fda.gov/a"}]), encoding="utf-8")
            urls = cl.collect_urls(data)  # facts.json is missing on purpose
        self.assertEqual(urls, {
            "https://www.cancer.gov/types/lung": "cancers.json lung nci",
            "https://www.fda.gov/a": "cancers.json lung approvals url",
        })


class CheckTest(unittest.TestCase):
    def check_with(self, effect):
        with mock.patch.object(cl.urllib.request, "urlopen", side_effect=effect):
            return cl.check("https://example.org/x")[0]

    def test_classifies_responses(self):
        ok = mock.MagicMock()
        ok.__enter__.return_value.status = 200
        self.assertEqual(self.check_with([ok]), "ok")
        self.assertEqual(self.check_with(http_error(404)), "broken")
        self.assertEqual(self.check_with(http_error(410)), "broken")
        # Bot blocking, rate limits, server and network errors don't prove a link is dead.
        self.assertEqual(self.check_with(http_error(403)), "unverified")
        self.assertEqual(self.check_with(http_error(503)), "unverified")
        self.assertEqual(self.check_with(urllib.error.URLError("timed out")), "unverified")

    def test_only_broken_links_fail_the_run(self):
        urls = {"https://a.example.org/1": "x", "https://a.example.org/2": "y", "https://b.example.org/": "z"}
        cases = [({"https://a.example.org/2": ("unverified", "HTTP 403")}, 0),
                 ({"https://b.example.org/": ("broken", "HTTP 404")}, 1)]
        for bad, code in cases:
            with self.subTest(bad=bad), mock.patch.object(cl, "collect_urls", return_value=urls), \
                    mock.patch.object(cl, "check", side_effect=lambda u, bad=bad: bad.get(u, ("ok", "HTTP 200"))), \
                    mock.patch.object(cl, "PAUSE", 0), mock.patch.dict(cl.os.environ, {"GITHUB_STEP_SUMMARY": ""}), \
                    mock.patch("sys.stdout", new_callable=io.StringIO) as out:
                self.assertEqual(cl.main(), code)
            self.assertIn("3 links:", out.getvalue())


if __name__ == "__main__":
    unittest.main()
