// Minimal static file server for the Playwright e2e run: serves
// src/sogotable/static the way Cloudflare Pages does (index.html at "/",
// query strings ignored). `wrangler pages dev` cannot be used here because it
// picks up the Worker's wrangler.toml and refuses its Durable Object bindings.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(import.meta.dirname, "..", "src", "sogotable", "static");
const port = Number(process.argv[2] || 8788);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".pdf": "application/pdf",
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  try {
    const body = await readFile(join(root, relative));
    response.writeHead(200, { "Content-Type": types[extname(relative)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`static app on http://127.0.0.1:${port}`));
