// Serves the deck and forwards /api/* to the running Ambulance Flow app, so the
// live API console works without CORS. No dependencies.
// Usage: node presentation/serve.mjs   (app on :8787, deck on :5190)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 5190;
const APP = new URL(process.env.APP_URL || "http://127.0.0.1:8787");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };

http
  .createServer(async (req, res) => {
    if (req.url.startsWith("/api/")) {
      // GET-only proxy: the deck reads app state, it never writes.
      if (req.method !== "GET") return res.writeHead(405).end();
      const upstream = http.get({ hostname: APP.hostname, port: APP.port, path: req.url }, (r) => {
        res.writeHead(r.statusCode, { "Content-Type": r.headers["content-type"] || "application/json", "Cache-Control": "no-store" });
        r.pipe(res);
      });
      upstream.on("error", () => res.writeHead(502, { "Content-Type": "application/json" }).end('{"error":"app not running"}'));
      return;
    }
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(ROOT, path === "" || path === "." ? "index.html" : path);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Deck: http://127.0.0.1:${PORT}  (API proxied to ${APP.origin})`));
