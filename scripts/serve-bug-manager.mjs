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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFix, startRoomFix, listJobs, getJob, getDiff, mergeJob, discardJob, continueJob, openTerminal, shipJob, initJobs, claudeAvailable, runnerStatus } from "./bug-agent.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const htmlPath = join(repoRoot, "bugreport", "manage.html");
const api = process.env.SOGOTABLE_API_ORIGIN || "https://sogotable.sogodojo.com";
const port = Number(process.env.BUG_MANAGER_PORT) || 8917;

// The bug-report API is a PUBLIC Cloudflare endpoint gated by the Sogo superuser passcode; that gate
// stays. What we remove is the friction of re-typing it: the passcode is remembered in a gitignored
// local `.env` (SOGOTABLE_SUPERUSER_PASSCODE=…) and read here, injected server-side, never sent to the
// browser. If the bug-report endpoints ever stop being passcode-gated, this local convenience is moot.
const envFile = join(repoRoot, ".env");
const PASS_KEY = "SOGOTABLE_SUPERUSER_PASSCODE";
function readEnvFile() {
  const out = {};
  try {
    if (!existsSync(envFile)) return out;
    for (const raw of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("="); if (eq === -1) continue;
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[line.slice(0, eq).trim()] = v;
    }
  } catch { /* unreadable — treat as empty */ }
  return out;
}
function saveToEnv(code) {                       // preserve any other keys already in .env
  const env = readEnvFile(); env[PASS_KEY] = code;
  writeFileSync(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
}

const argv = process.argv.slice(2);
const saveIdx = argv.indexOf("--save");
const cliPass = (saveIdx !== -1 ? (argv[saveIdx + 1] || "") : (argv.find((a) => a && !a.startsWith("--")) || "")).trim();
// `--save <passcode>` writes it to .env once, then launches with it — future runs need no passcode.
if (saveIdx !== -1) {
  if (!cliPass) { console.error("Usage: node scripts/serve-bug-manager.mjs --save <sogo-passcode>"); process.exit(1); }
  try { saveToEnv(cliPass); console.log(`Saved ${PASS_KEY} to .env (gitignored) — future launches need no passcode.`); }
  catch (e) { console.error("Could not write .env: " + e.message); process.exit(1); }
}

let passcode = cliPass, passSource = cliPass ? (saveIdx !== -1 ? "saved to .env, now in use" : "command line") : "";
if (!passcode && process.env[PASS_KEY]) { passcode = process.env[PASS_KEY]; passSource = "environment"; }
if (!passcode) { const v = readEnvFile()[PASS_KEY]; if (v) { passcode = v; passSource = ".env file"; } }

if (!passcode) {
  console.error([
    "No passcode found. Save it once — it's remembered locally and never committed:",
    "  node scripts/serve-bug-manager.mjs --save <sogo-passcode>",
    `  (writes ${PASS_KEY} to .env, which is gitignored)`,
    "Per-launch alternatives: pass it as an argument, or set SOGOTABLE_SUPERUSER_PASSCODE.",
  ].join("\n"));
  process.exit(1);
}

// Only these upstream paths may be proxied — the page can list and resolve, nothing else.
const PROXY_PATHS = new Set(["/api/bug-reports/list", "/api/bug-reports/resolve", "/api/bug-reports/update"]);

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => resolve(raw));
  });
}

// Call the upstream D1 API with the Sogo passcode injected (never trusted from the browser).
async function apiCall(path, body) {
  const r = await fetch(`${api}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(body || {}), passcode }),
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 200) }; }
}
// A report's room: prefer room_code, fall back to the game_state snapshot's room.
function reportRoom(r) {
  if (r.room_code) return String(r.room_code).toUpperCase();
  try { return String(JSON.parse(r.game_state || "{}").room || "").toUpperCase(); } catch { return ""; }
}
// Every OPEN (not-done) report for a room.
async function openReportsForRoom(code) {
  const room = String(code || "").toUpperCase();
  const d = await apiCall("/api/bug-reports/list", {});
  const all = d.reports || d.bug_reports || [];
  return all.filter((r) => r.status !== "done" && reportRoom(r) === room);
}
// Mark a set of reports DONE by id (the room agent's onShipped step) — resolved, not deleted, so the
// report stays on file as an audit trail. If it needs more work, the reporter re-files. Returns the count.
async function resolveReports(ids) {
  if (!ids || !ids.length) return 0;
  const d = await apiCall("/api/bug-reports/resolve", { ids });   // no delete flag → status:"done"
  return d.affected || 0;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      // Never cache — the page is edited often, and a stale cache hides new features.
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, must-revalidate" });
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
    // Stop the server from the browser, so the user never has to guess which
    // console window to close (and never risks closing their Claude session).
    if (req.method === "POST" && url.pathname === "/shutdown") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      console.log("\nStopped from the browser. This window is safe to close.");
      setTimeout(() => process.exit(0), 150);
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
      // Address an ENTIRE playtest room in one agent: gather its open reports, hand them to a room agent,
      // and mark them DONE (resolved, kept on file) only after a green ship — the agent never touches them.
      if (req.method === "POST" && url.pathname === "/agent/room-fix") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const code = String(body.room || "").toUpperCase();
        if (!code) return send({ ok: false, error: "No room code." });
        const reports = await openReportsForRoom(code);
        if (!reports.length) return send({ ok: false, error: `No open reports for room ${code}.` });
        return send(await startRoomFix({ roomCode: code, reports, onShipped: resolveReports }));
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
  console.log("========================================================");
  console.log("  SogoTable BUG MANAGER  —  THIS window (safe to close)");
  console.log("  This is NOT your Claude session.");
  console.log(`  Running at ${target}`);
  console.log("  Stop it with the browser's  ⏻ Stop  button (closes this");
  console.log("  window for you), or just close this window.");
  console.log("========================================================");
  // Print the revision this server is running on, so a restart is verifiable at a glance ("am I on
  // the new code?"), plus whether auto-ship is armed and the agent CLI is reachable.
  try {
    const st = await runnerStatus();
    console.log(`  Code:      ${st.branch} @ ${st.short}${st.dirty ? " (DIRTY working tree)" : ""} — ${st.subject}`);
    console.log(`  Auto-ship: ${st.autoship ? "ON — fixes land on main automatically and report the hash" : "OFF — fixes park on a branch for review"}`);
    console.log(`  Agent CLI: ${(await claudeAvailable()) ? "claude reachable" : "⚠ claude NOT found on PATH — fixes can't run"}`);
    console.log(`  Passcode:  loaded from ${passSource} (public API stays gated; value never shown)`);
    console.log("========================================================");
  } catch { /* non-fatal — banner is best-effort */ }
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
