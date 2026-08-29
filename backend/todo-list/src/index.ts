import { createServer } from "node:http";
import { healthBody } from "./health.js";

const port = Number(process.env.APP_PORT || process.env.PORT);
if (!Number.isInteger(port) || port < 1) {
  process.stderr.write("APP_PORT or PORT required\n");
  process.exit(1);
}

const server = createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/health" || req.url === "/health/")) {
    const body = healthBody();
    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port);
