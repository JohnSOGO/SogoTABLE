// Serve the human-friendly bug-report manager (bugreport/manage.html) on
// localhost and proxy its API calls to the deployed Worker. Two reasons this is a
// local server rather than just opening the .html file:
//   1. CORS — the Worker only allows http://localhost:<port> (and the prod
//      origins); a file:// page sends `Origin: null` and is rejected.
//   2. The passcode stays here in the terminal and is injected into proxied
//      requests, so it never lives in the browser page.
//
// Usage:
//   node scripts/serve-bug-manager.mjs <sogo-passcode>
//   SOGOTABLE_SUPERUSER_PASSCODE=... node scripts/serve-bug-manager.mjs
// Override the API origin with SOGOTABLE_API_ORIGIN (defaults to production) and
// the port with BUG_MANAGER_PORT (defaults to 8917).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFix, listJobs, getJob, getDiff, mergeJob, discardJob, continueJob, openTerminal, shipJob, initJobs, claudeAvailable } from "./bug-agent.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const htmlPath = join(repoRoot, "bugreport", "manage.html");
const api = process.env.SOGOTABLE_API_ORIGIN || "https://sogotable.sogodojo.com";
const port = Number(process.env.BUG_MANAGER_PORT) || 8917;
const passcode = process.argv[2] || process.env.SOGOTABLE_SUPERUSER_PASSCODE || "";

if (!passcode) {
  console.error("Usage: node scripts/serve-bug-manager.mjs <sogo-passcode>  (or set SOGOTABLE_SUPERUSER_PASSCODE)");
  process.exit(1);
}

// Only these upstream paths may be proxied — the page can list and resolve, nothing else.
const PROXY_PATHS = new Set(["/api/bug-reports/list", "/api/bug-reports/resolve"]);

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => resolve(raw));
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(readFileSync(htmlPath, "utf8"));
      return;
    }
    if (req.method === "POST" && PROXY_PATHS.has(url.pathname)) {
      const incoming = await readBody(req);
      const body = incoming ? JSON.parse(incoming) : {};
      const upstream = await fetch(`${api}${url.pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Passcode is injected here, never trusted from the browser.
        body: JSON.stringify({ ...body, passcode }),
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(text);
      return;
    }
    // Local agent routes — spawn/track fix agents in isolated worktrees.
    if (url.pathname.startsWith("/agent/")) {
      const send = (payload, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(payload));
      };
      if (req.method === "GET" && url.pathname === "/agent/jobs") return send({ ok: true, jobs: listJobs() });
      if (req.method === "GET" && url.pathname === "/agent/available") return send({ ok: true, available: await claudeAvailable() });
      if (req.method === "GET" && url.pathname === "/agent/job") return send(getJob(url.searchParams.get("id")) || { ok: false, error: "No such job." });
      if (req.method === "GET" && url.pathname === "/agent/diff") return send(await getDiff(url.searchParams.get("id")));
      if (req.method === "POST" && url.pathname === "/agent/fix") {
        const body = JSON.parse((await readBody(req)) || "{}");
        return send(await startFix(body.report || {}));
      }
      if (req.method === "POST" && url.pathname === "/agent/merge") {
        const body = JSON.parse((await readBody(req)) || "{}");
        return send(await mergeJob(body.id));
      }
      if (req.method === "POST" && url.pathname === "/agent/discard") {
        const body = JSON.parse((await readBody(req)) || "{}");
        return send(await discardJob(body.id));
      }
      if (req.method === "POST" && url.pathname === "/agent/continue") {
        const body = JSON.parse((await readBody(req)) || "{}");
        return send(continueJob(body.id, body.message));
      }
      if (req.method === "POST" && url.pathname === "/agent/terminal") {
        const body = JSON.parse((await readBody(req)) || "{}");
        return send(openTerminal(body.id));
      }
      if (req.method === "POST" && url.pathname === "/agent/ship") {
        const body = JSON.parse((await readBody(req)) || "{}");
        return send(await shipJob(body.id));
      }
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err && err.message || err) }));
  }
});

// If a manager is already running on this port, don't crash with a stack trace —
// just open the existing one and exit cleanly. (Common when double-clicking the
// launcher again without closing the previous window.)
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    const target = `http://localhost:${port}/`;
    console.log(`\nA bug manager is already running at ${target} — opening it.`);
    console.log(`To run a fresh copy, close the other manager window first (or set BUG_MANAGER_PORT to a different port).`);
    openBrowser(target);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

// Bind to loopback only — this is a personal admin tool, not a network service.
server.listen(port, "127.0.0.1", async () => {
  const target = `http://localhost:${port}/`;
  console.log(`Bug-report manager running at ${target}`);
  console.log(`Proxying to ${api} — press Ctrl+C to stop.`);
  try {
    const n = await initJobs();
    if (n) console.log(`Restored ${n} fix branch(es) from a previous run.`);
  } catch { /* not fatal — just start with no restored jobs */ }
  openBrowser(target);
});

function openBrowser(target) {
  const platform = process.platform;
  const cmd = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", target] : [target];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    console.log(`Open ${target} in your browser.`);
  }
}
