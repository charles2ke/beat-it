#!/usr/bin/env python3
"""Local static server for Beat It (Python standard library only).

Dev mode (default) serves site/ and falls back to index.html for extensionless routes such as
/type/lung/, so the client-side router works. --pages mimics GitHub Pages for the built _site/
directory: the site lives under --base (e.g. /beat-it/), folders redirect to a trailing slash and
unknown paths return 404.html with a 404 status.
"""
import argparse
import http.server
import os
import sys
from urllib.parse import unquote, urlsplit

TYPES = {
    ".webmanifest": "application/manifest+json",
    ".woff2": "font/woff2",
    ".js": "text/javascript",
    ".json": "application/json",
    ".xml": "application/xml",
    ".svg": "image/svg+xml",
}


def make_handler(root, base, pages, verbose):
    class Handler(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TYPES}

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=root, **kwargs)

        def log_message(self, fmt, *args):
            if verbose:
                super().log_message(fmt, *args)

        def end_headers(self):
            self.send_header("Cache-Control", "no-cache")
            super().end_headers()

        def redirect(self, location):
            self.send_response(301)
            # The location echoes the request, so drop line breaks that could start a new header.
            self.send_header("Location", location.replace("\n", "").replace("\r", ""))
            self.send_header("Content-Length", "0")
            self.end_headers()

        def send_file(self, path, status):
            f = open(path, "rb")
            size = os.fstat(f.fileno()).st_size
            self.send_response(status)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Length", str(size))
            self.end_headers()
            return f

        def not_found(self, rel):
            if pages:
                page = os.path.join(root, "404.html")
                if os.path.isfile(page):
                    return self.send_file(page, 404)
            elif "." not in rel.rsplit("/", 1)[-1]:
                return self.send_file(os.path.join(root, "index.html"), 200)
            self.send_error(404)
            return None

        def send_head(self):
            parts = urlsplit(self.path)
            path = unquote(parts.path)
            query = "?" + parts.query if parts.query else ""
            if not path.startswith(base):
                if path + "/" == base:
                    self.redirect(base + query)
                    return None
                return self.not_found(path)
            rel = path[len(base):]
            # A folder URL serves its index.html. realpath resolves ".." and symlinks; the trailing
            # separator keeps a sibling folder such as "site-old" from passing as "site".
            target = os.path.realpath(os.path.join(root, rel, "index.html") if path.endswith("/") else os.path.join(root, rel))
            if not target.startswith(root + os.sep):
                return self.not_found(rel)
            if os.path.isdir(target):
                self.redirect(parts.path + "/" + query)
                return None
            if os.path.isfile(target):
                return self.send_file(target, 200)
            return self.not_found(rel)

    return Handler


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dir", default="site", help="directory to serve (default: site)")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--base", default="/", help="URL path the site is served under, e.g. /beat-it/")
    parser.add_argument("--pages", action="store_true", help="GitHub Pages behaviour: 404.html for unknown paths")
    parser.add_argument("--verbose", action="store_true", help="log every request")
    args = parser.parse_args(argv)
    base = "/" + args.base.strip("/") + "/" if args.base.strip("/") else "/"
    root = os.path.realpath(args.dir)
    if not os.path.isdir(root):
        print(f"warning: {root} does not exist yet (run `npm run build` for _site)", file=sys.stderr)
    handler = make_handler(root, base, args.pages, args.verbose)
    server = http.server.ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving {args.dir} at http://{args.host}:{args.port}{base}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
