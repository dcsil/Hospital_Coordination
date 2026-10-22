// Serves the deck and forwards /api/* to the running Ambulance Flow app, so the
// live API console works without CORS. No dependencies.
// Usage: node presentation/serve.mjs   (app on :5173, deck on :5190)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 5190;
const APP = new URL(process.env.APP_URL || "http://127.0.0.1:5173");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm" };

http
  .createServer(async (req, res) => {
    if (req.url === "/runtime-config.js") {
      res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
      return res.end(`window.PRESENTATION_CONFIG = ${JSON.stringify({ appUrl: APP.href })};`);
    }
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
      const type = TYPES[extname(file)] || "application/octet-stream";
      // Byte ranges let the browser seek in the videos.
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
      if (range) {
        const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        if (start > end || start >= body.length) return res.writeHead(416, { "Content-Range": `bytes */${body.length}` }).end();
        return res.writeHead(206, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${body.length}`, "Content-Length": end - start + 1 }).end(body.subarray(start, end + 1));
      }
      res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes" }).end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Deck: http://127.0.0.1:${PORT}  (API proxied to ${APP.origin})`));
