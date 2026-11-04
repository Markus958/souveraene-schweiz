from __future__ import annotations

import argparse
import hmac
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class FeedHandler(BaseHTTPRequestHandler):
    feed_path: Path
    api_key: str

    def _json(self, status: HTTPStatus, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        if self.path != "/gmail-feed":
            self._json(HTTPStatus.NOT_FOUND, {"detail": "not found"})
            return
        provided = self.headers.get("X-API-Key", "")
        if not provided or not hmac.compare_digest(provided, self.api_key):
            self._json(HTTPStatus.UNAUTHORIZED, {"detail": "invalid API key"})
            return
        try:
            raw = self.feed_path.read_bytes()
            json.loads(raw)
        except (OSError, ValueError):
            self._json(HTTPStatus.SERVICE_UNAVAILABLE, {"detail": "feed unavailable"})
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, fmt: str, *args: object) -> None:
        # Never log request headers or credentials.
        print(f"gmail_feed status={args[1] if len(args) > 1 else '-'} path={self.path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the sanitised Gmail monitor feed.")
    parser.add_argument("--feed", type=Path, required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8770)
    args = parser.parse_args()
    api_key = os.environ.get("GMAIL_FEED_API_KEY", "")
    if len(api_key) < 24:
        raise SystemExit("GMAIL_FEED_API_KEY missing or too short")
    FeedHandler.feed_path = args.feed
    FeedHandler.api_key = api_key
    server = ThreadingHTTPServer((args.host, args.port), FeedHandler)
    print(f"gmail_feed listening={args.host}:{args.port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
