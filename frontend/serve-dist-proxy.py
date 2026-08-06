from __future__ import annotations

import http.client
import json
import os
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
BACKEND = os.environ.get("BACKEND_URL", "http://127.0.0.1:6001")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "5173"))
PROXY_TIMEOUT = int(os.environ.get("PROXY_TIMEOUT", "600"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def end_headers(self):
        # Prevent stale HTML/JS/CSS from being reused after local rebuilds.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy()
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._proxy()
            return
        self.send_error(404)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self._proxy()
            return
        self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self._proxy()
            return
        self.send_error(404)

    def _proxy(self):
        parsed = urlsplit(BACKEND)
        target_path = self.path
        conn_cls = http.client.HTTPConnection if parsed.scheme == "http" else http.client.HTTPSConnection
        conn = conn_cls(
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            timeout=PROXY_TIMEOUT,
        )

        try:
            headers = {k: v for k, v in self.headers.items() if k.lower() != "host"}
            body = None
            if "Content-Length" in self.headers:
                body = self.rfile.read(int(self.headers["Content-Length"]))

            conn.request(self.command, target_path, body=body, headers=headers)
            resp = conn.getresponse()
            payload = resp.read()

            self.send_response(resp.status, resp.reason)
            for key, value in resp.getheaders():
                if key.lower() in {"transfer-encoding", "connection", "content-length"}:
                    continue
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except (TimeoutError, socket.timeout) as exc:
            self.send_response(504, "Gateway Timeout")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            payload = json.dumps({
                "detail": f"Request to backend timed out after {PROXY_TIMEOUT}s",
                "proxy_error": repr(exc),
            }).encode("utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        finally:
            conn.close()

    def send_error(self, code, message=None, explain=None):
        # Single-page app routes should fall back to index.html rather than a 404 page.
        if code == 404 and self.command == "GET" and not self.path.startswith("/api/"):
            self.path = "/index.html"
            return super().do_GET()
        return super().send_error(code, message, explain)


if __name__ == "__main__":
    try:
        if not DIST.exists():
            raise SystemExit(f"Missing dist directory: {DIST}")
        print(f"Serving frontend dist on http://{HOST}:{PORT}", flush=True)
        print(f"Proxying /api to {BACKEND}", flush=True)
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except Exception as exc:
        print(f"Frontend proxy failed: {exc!r}", flush=True)
        raise
