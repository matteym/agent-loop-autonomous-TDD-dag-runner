import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from src.health import health_body


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path in ("/health", "/health/"):
            body = health_body().encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    raw = os.environ.get("APP_PORT") or os.environ.get("PORT") or ""
    try:
        port = int(raw)
    except ValueError:
        port = 0
    if port < 1:
        raise SystemExit("APP_PORT or PORT required")
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
