// Bug-fixing agent runner for the bug-report manager. Each "Address" from the GUI
// spins up an isolated git worktree on its own branch, launches the Claude Code
// CLI headlessly inside it to diagnose + fix + test the report, and then — by
// default — auto-ships the committed fix straight to main (see AUTOSHIP below).
//
// Isolation matters: worktrees keep the agent off the user's main working tree, so
// concurrent work (and other jobs sharing the clone) is untouched. Shipping also runs
// FROM the worktree — it pushes the branch tip to origin/main directly — so it never
// depends on (or disturbs) the shared primary working tree's branch or cleanliness.
// That dependency is what used to strand fixes on their branch: the shared main moved
// under a concurrent session and the in-tree merge hit a spurious conflict.
//
// Job state is in-memory: it lives only while the server runs, which is fine — the
// durable artifacts are the git branches/worktrees, which survive a restart.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const isWin = process.platform === "win32";
const MAX_CONCURRENT = 2;
const LOG_TAIL = 6000;
// Full agent logs are persisted here (gitignored under bugreport/) so they survive a
// server restart and can be reopened later. In-memory job.log keeps only a tail.
const logDir = join(repoRoot, "bugreport", "agent-logs");
const MEM_LOG_CAP = 24000;
// Auto-ship: when a fix agent finishes with committed work, land it on main by itself
// (merge → test → push → deploy-if-worker) and report the hash — no manual Ship. Set
// BUG_AGENT_AUTOSHIP=off to fall back to park-on-branch-for-review.
const AUTOSHIP = String(process.env.BUG_AGENT_AUTOSHIP || "on").toLowerCase() !== "off";
let shipChain = Promise.resolve();   // serialize merges into main so two jobs never race

const safeBranch = (branch) => branch.replace(/[^\w.-]/g, "-");

// Append to a job's log: memory (capped) + its on-disk file (full).
function writeLog(job, s) {
  job.log += s;
  if (job.log.length > MEM_LOG_CAP) job.log = job.log.slice(-MEM_LOG_CAP);
  if (job.logFile) { try { appendFileSync(job.logFile, s); } catch { /* disk hiccup — memory still has it */ } }
}

const jobs = new Map(); // id -> full job record
let running = 0;
let seq = 0;

function git(args, cwd = repoRoot) {
  return new Promise((resolve) => {
    const p = spawn("git", args, { cwd, shell: isWin });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", (e) => resolve({ code: -1, out: "", err: String(e.message || e) }));
    p.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

function firstLine(text) {
  return String(text || "").trim().split("\n")[0].slice(0, 80) || "(no description)";
}

function reportToText(r) {
  const lines = [`Report ID: ${r.id}`];
  if (r.game) lines.push(`Game: ${r.game}`);
  if (r.screen) lines.push(`Screen: ${r.screen}`);
  if (r.room_code) lines.push(`Room: ${r.room_code}`);
  if (r.player_name) lines.push(`Reported by: ${r.player_name}`);
  lines.push("", "Issue:", String(r.description || "").trim());
  return lines.join("\n");
}

function buildPrompt(report, branch) {
  return [
    "You are fixing an issue in the SogoTable project. You are running inside an",
    `isolated git worktree on branch \`${branch}\` — your changes here do NOT touch`,
    "the user's main working tree, so work freely.",
    "",
    "Follow the repository's CLAUDE.md doctrine (placement before implementation,",
    "smallest correct change, sibling-path parity, docs when contracts change).",
    "Investigate the report below, implement the fix (or the feature, if that's what",
    "it asks), and verify it. The worker test suite needs no install — run",
    "`node --test workers/tests/*.test.js` directly. Commit your work to this branch",
    "with a clear message.",
    "",
    "HARD CONSTRAINTS:",
    "- Do NOT `git push`. Do NOT deploy (no `npm run deploy:*`). Do NOT switch to or",
    "  modify `main`. Commit only to this branch.",
    "- If the report is too ambiguous to fix safely, do NOT guess — explain what you'd",
    "  need and what you investigated instead.",
    "",
    "When finished, output a concise summary: root cause, files changed, and how you",
    "verified (test results).",
    "",
    "--- REPORT ---",
    reportToText(report),
  ].join("\n");
}

// A short, human-readable label for a tool_use event in the live log.
function briefTool(item) {
  const inp = item.input || {};
  if (item.name === "Bash") return String(inp.command || "").split("\n")[0].slice(0, 140);
  if (item.name === "Edit" || item.name === "Write" || item.name === "Read" || item.name === "NotebookEdit") return inp.file_path || "";
  if (item.name === "Grep" || item.name === "Glob") return inp.pattern || inp.query || "";
  if (item.name === "Task") return inp.description || inp.subagent_type || "";
  return JSON.stringify(inp).slice(0, 120);
}

function publicJob(j) {
  return {
    id: j.id, reportId: j.reportId, title: j.title, branch: j.branch,
    status: j.status, summary: j.summary, error: j.error, commits: j.commits,
    sessionId: j.sessionId || "", log: j.log.slice(-LOG_TAIL), logFile: j.logFile || "",
    shipState: j.shipState || "", shippedHash: j.shippedHash || "", deployed: !!j.deployed, shipError: j.shipError || "",
    startedAt: j.startedAt, endedAt: j.endedAt,
  };
}

export function listJobs() {
  return [...jobs.values()].map(publicJob).sort((a, b) => b.startedAt - a.startedAt);
}

// Rebuild job cards for any fix/bug-* branches left from a previous server run, so a
// restart never strands a fix. The in-memory summary/log/session are gone (they
// weren't persisted), but the branch + worktree are real, so View diff / Ship /
// Merge / Discard still work. Called once at startup.
export async function initJobs() {
  const branches = await git(["branch", "--list", "fix/bug-*", "--format=%(refname:short)"]);
  const wt = await git(["worktree", "list", "--porcelain"]);
  const wtByBranch = {};
  let cur = "";
  for (const line of wt.out.split("\n")) {
    if (line.startsWith("worktree ")) cur = line.slice(9).trim();
    else if (line.startsWith("branch ")) wtByBranch[line.slice(7).trim().replace("refs/heads/", "")] = cur;
  }
  for (const branch of branches.out.split("\n").map((s) => s.trim()).filter(Boolean)) {
    if ([...jobs.values()].some((j) => j.branch === branch)) continue;
    const reportId = branch.replace(/^fix\/bug-/, "");
    const commits = await git(["log", "--oneline", `main..${branch}`]);
    const id = `job-${++seq}`;
    const logFile = join(logDir, safeBranch(branch) + ".log");
    let savedLog = "(restored after a server restart — no saved log found)\n";
    if (existsSync(logFile)) { try { savedLog = readFileSync(logFile, "utf8").slice(-MEM_LOG_CAP); } catch { /* keep default */ } }
    jobs.set(id, {
      id, reportId, title: `(restored) ${reportId}`, branch,
      wtPath: wtByBranch[branch] || join(repoRoot, ".worktrees", `bug-${reportId}`),
      logFile,
      status: "done", log: savedLog,
      summary: commits.out ? "Restored fix branch from a previous run. View the diff to review, then Ship or Discard." : "Restored branch with no commits — safe to discard.",
      error: "", commits: commits.out, sessionId: "", startedAt: 0, endedAt: 0,
    });
  }
  return listJobs().length;
}

export function getJob(id) {
  const j = jobs.get(id);
  return j ? publicJob(j) : null;
}

export async function startFix(report) {
  const reportId = String(report && report.id || "").replace(/[^a-z0-9-]/gi, "");
  if (!reportId) return { ok: false, error: "Report has no id." };
  if (running >= MAX_CONCURRENT) return { ok: false, error: `Too many agents running (${running}). Try again shortly.` };
  for (const j of jobs.values()) {
    if (j.reportId === reportId && j.status === "running") return { ok: false, error: "An agent is already working this report." };
  }
  const id = `job-${++seq}`;
  const branch = `fix/bug-${reportId}`;
  const job = {
    id, reportId, title: firstLine(report.description), branch,
    wtPath: join(repoRoot, ".worktrees", `bug-${reportId}`),
    logFile: join(logDir, safeBranch(branch) + ".log"),
    status: "running", log: "", summary: "", error: "", commits: "",
    startedAt: Date.now(), endedAt: 0,
  };
  jobs.set(id, job);
  running += 1;
  run(job, report).catch((e) => { job.status = "error"; job.error = String(e && e.message || e); })
    .finally(() => { running -= 1; if (!job.endedAt) job.endedAt = Date.now(); });
  return { ok: true, id, branch };
}

async function run(job, report) {
  const log = (s) => writeLog(job, s);

  // Start the persisted log fresh for a new fix, and record the exact brief the agent
  // was given (the edited text goes in via stdin and isn't stored anywhere else).
  try {
    mkdirSync(logDir, { recursive: true });
    writeFileSync(job.logFile, `# Fix-agent log — ${job.branch} (report ${job.reportId})\n\n`);
  } catch { /* non-fatal */ }
  log(`== Brief given to the agent ==\n${reportToText(report)}\n\n`);

  // Fresh worktree: clear any stale one for this report first.
  await git(["worktree", "remove", "--force", job.wtPath]);
  await git(["branch", "-D", job.branch]);
  mkdirSync(join(repoRoot, ".worktrees"), { recursive: true });
  // Start from the freshest PUBLISHED main, not the shared clone's local main — which may be behind
  // if another machine pushed. Branching off FETCH_HEAD means the agent reasons about (and its fix
  // lands on) current code, so a stale start doesn't turn into a merge conflict at ship time. Falls
  // back to local main only if the fetch can't reach origin (offline).
  const fetched = await git(["fetch", "origin", "main"]);
  const base = fetched.code === 0 ? "FETCH_HEAD" : "main";
  log(`$ git worktree add -b ${job.branch} ${job.wtPath} ${base === "FETCH_HEAD" ? "origin/main (fetched)" : "main (offline — fetch failed)"}\n`);
  const add = await git(["worktree", "add", "-b", job.branch, job.wtPath, base]);
  log((add.out ? add.out + "\n" : "") + (add.err ? add.err + "\n" : ""));
  if (add.code !== 0) {
    job.status = "error";
    job.error = "Could not create worktree: " + (add.err || "git failed");
    job.endedAt = Date.now();
    return;
  }

  log(`\n$ claude (stream-json) — prompt via stdin, cwd: worktree\n\n`);
  const res = await spawnClaude(job, { prompt: buildPrompt(report, job.branch) });
  job.sessionId = res.sessionId || job.sessionId;
  await finalize(job, res);
}

// Spawn Claude Code headless, streaming stream-json events into the job log so the
// GUI sees live progress. bypassPermissions lets it edit + run tests unattended; the
// prompt forbids push/deploy and it's boxed to the worktree branch. The prompt goes
// in via STDIN, not as an argument: a multi-line arg gets mangled by Windows cmd.exe.
function spawnClaude(job, { prompt, resume }) {
  const log = (s) => writeLog(job, s);
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"];
  if (resume) args.push("--resume", resume);
  const holder = { result: "", isError: false, sessionId: job.sessionId || "" };
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn("claude", args, { cwd: job.wtPath, shell: isWin, env: process.env });
    } catch (e) {
      log(`[could not launch claude: ${e.message}]\n`);
      resolve({ exit: -1, ...holder });
      return;
    }
    let buf = "";
    proc.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        const t = line.trim(); if (!t) continue;
        let evt; try { evt = JSON.parse(t); } catch { log(line + "\n"); continue; }
        onEvent(evt, holder, log);
      }
    });
    proc.stderr.on("data", (d) => log(d.toString()));
    proc.on("error", (e) => { log(`[claude error: ${e.message}]\n`); resolve({ exit: -1, ...holder }); });
    proc.on("close", (code) => resolve({ exit: code, ...holder }));
    try { proc.stdin.write(prompt); proc.stdin.end(); } catch (e) { log(`[stdin error: ${e.message}]\n`); }
  });
}

// Translate a stream-json event into a readable live-log line.
function onEvent(evt, holder, log) {
  if (evt.type === "system") {
    if (evt.subtype === "init") { holder.sessionId = evt.session_id || holder.sessionId; log(`▶ session ${(evt.session_id || "").slice(0, 8)} · ${evt.model || "?"}\n`); }
    return;
  }
  if (evt.type === "assistant" && evt.message && evt.message.content) {
    for (const item of evt.message.content) {
      if (item.type === "text" && item.text && item.text.trim()) log(item.text.trim() + "\n");
      else if (item.type === "tool_use") log(`⚙ ${item.name}: ${briefTool(item)}\n`);
    }
    return;
  }
  if (evt.type === "user" && evt.message && evt.message.content) {
    for (const item of evt.message.content) if (item.type === "tool_result" && item.is_error) log(`  ↳ tool error\n`);
    return;
  }
  if (evt.type === "result") {
    holder.result = evt.result || holder.result;
    holder.isError = Boolean(evt.is_error);
    holder.sessionId = evt.session_id || holder.sessionId;
    log(`\n■ ${evt.subtype || "done"} · ${evt.num_turns || "?"} turns · $${Number(evt.total_cost_usd || 0).toFixed(3)}\n`);
    return;
  }
}

async function finalize(job, res) {
  const commits = await git(["log", "--oneline", `main..${job.branch}`]);
  job.commits = commits.out;
  if (res.result) job.summary = res.result.trim().slice(-4000);
  if (res.exit !== 0) {
    job.status = "error";
    if (!job.error) job.error = `Agent exited with code ${res.exit}` + (res.exit === -1 ? " (is the `claude` CLI on PATH?)" : "");
  } else if (res.isError) {
    job.status = "error";
    if (!job.error) job.error = job.summary || "Agent reported an error.";
  } else {
    job.status = "done";
    if (!commits.out) {
      if (!job.summary) job.summary = "Agent finished but committed no changes.";
    } else if (AUTOSHIP) {
      await autoShip(job);
    }
  }
  job.endedAt = Date.now();
}

// Land a finished job on main, serialized so two jobs never merge at once.
function autoShip(job) {
  job.shipState = "queued";
  shipChain = shipChain
    .then(() => doAutoShip(job))
    .catch((e) => { job.shipState = "parked"; job.shipError = String(e && e.message || e); });
  return shipChain;
}

async function doAutoShip(job) {
  const log = (s) => writeLog(job, s);
  job.shipState = "shipping";
  log(`\n▶ auto-ship: landing ${job.branch} on main…\n`);
  const res = await landOnMain(job);
  if (!res.ok) {
    job.shipState = "parked"; job.shipError = res.error;
    log(`■ parked: ${res.error}\n   (the fix stays on ${job.branch} — resolve, then use Ship to retry.)\n`);
    return;
  }
  job.shippedHash = res.hash; job.deployed = res.deployed;
  if (res.touchesWorker && !res.deployed) job.shipError = "pushed, but deploy:brain failed — run it manually";
  job.shipState = "shipped";
  log(`\n■ SHIPPED to main as ${res.hash}${res.touchesWorker ? (res.deployed ? " · worker deployed" : " · ⚠ worker deploy FAILED") : ""}\n`);
}

// The shared "land this branch on origin/main" core, used by both auto-ship and the
// manual Ship button. It runs ENTIRELY from the job's worktree: fetch the current remote
// main, merge it into the fix branch there, run the test suite on the merged result, and
// push the branch tip straight to origin/main. Nothing here touches the shared primary
// working tree — depending on that tree (dirty / on another branch because several
// sessions share this clone) is exactly what used to strand fixes. A genuine content
// conflict (two sessions edited the same lines) is now the only thing that parks a fix,
// and the branch is preserved for a manual resolve + retry.
// Returns { ok, hash, deployed, touchesWorker, error }.
async function landOnMain(job) {
  const log = (s) => writeLog(job, s);
  const wt = job.wtPath;
  if (!existsSync(wt)) return { ok: false, error: "the fix worktree is gone — Discard this job and re-run the fix." };

  const touchesWorker = (await git(["diff", "--name-only", `main...${job.branch}`], wt)).out
    .split("\n").some((f) => f.startsWith("workers/"));

  // Catch the branch up to the CURRENT remote main so the push fast-forwards cleanly.
  await git(["fetch", "origin", "main"], wt);
  const merge = await git(["merge", "--no-ff", "FETCH_HEAD", "-m", `Merge origin/main into ${job.branch}`], wt);
  if (merge.code !== 0) {
    await git(["merge", "--abort"], wt);
    return { ok: false, touchesWorker, error: "conflicts with the current main — resolve on the branch, then Ship." };
  }

  // Safety gate: never push a red suite. Tests run against the merged worktree state.
  log(`  running the test suite before pushing…\n`);
  const test = await runNpm(["test"], wt);
  if (test.code !== 0) return { ok: false, touchesWorker, error: "tests failed after merging main — not pushed; the fix is safe on the branch." };

  // Push the branch tip straight onto origin/main (Cloudflare Pages auto-deploys static).
  const push = await git(["push", "origin", "HEAD:main"], wt);
  if (push.code !== 0) return { ok: false, touchesWorker, error: "push rejected: " + (push.err || push.out).slice(0, 200) + " — Ship to retry." };
  job.shippedHash = (await git(["rev-parse", "--short", "HEAD"], wt)).out;

  // Keep the clone's local main ref current when it's safe, so future fix branches start fresh.
  await syncLocalMain(job);

  let deployed = false;
  if (touchesWorker) {
    const dep = await runNpm(["run", "deploy:brain"], wt);
    deployed = dep.code === 0;
  }

  // Tidy the now-merged branch + worktree.
  await git(["worktree", "remove", "--force", wt]);
  await git(["branch", "-D", job.branch]);

  return { ok: true, hash: job.shippedHash, deployed, touchesWorker };
}

// Best-effort: move the clone's LOCAL main ref up to the just-pushed tip, so the next fix
// branch (cut from local main) starts current. Safe by construction — if main is the
// checked-out branch we only fast-forward a clean tree; if it's dirty or not checked out
// we leave it (the next run re-fetches remote main anyway). Never blocks a ship.
async function syncLocalMain(job) {
  const log = (s) => writeLog(job, s);
  const head = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (head.out === "main") {
    const status = await git(["status", "--porcelain"]);
    if (status.out) { log(`  (local main has uncommitted work — left it as-is)\n`); return; }
    const ff = await git(["merge", "--ff-only", job.branch]);
    if (ff.code === 0) log(`  local main fast-forwarded to ${job.shippedHash}\n`);
  } else {
    await git(["update-ref", "refs/heads/main", job.branch]);
  }
}

// Send a follow-up message into an existing job, resuming its Claude session in the
// same worktree/branch — turn-based interactivity from the GUI.
export function continueJob(id, message) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: "No such job." };
  if (j.status === "running") return { ok: false, error: "Agent is still working — wait for it to pause." };
  if (!j.sessionId) return { ok: false, error: "No session to resume yet." };
  const msg = String(message || "").trim();
  if (!msg) return { ok: false, error: "Empty message." };
  if (running >= MAX_CONCURRENT) return { ok: false, error: `Too many agents running (${running}).` };
  j.status = "running"; j.endedAt = 0; j.error = "";
  writeLog(j, `\n\n— you: ${msg}\n\n`);
  running += 1;
  (async () => {
    const res = await spawnClaude(j, { prompt: msg, resume: j.sessionId });
    j.sessionId = res.sessionId || j.sessionId;
    await finalize(j, res);
  })().catch((e) => { j.status = "error"; j.error = String(e && e.message || e); })
    .finally(() => { running -= 1; if (!j.endedAt) j.endedAt = Date.now(); });
  return { ok: true };
}

// Open a full interactive Claude session in the job's worktree, in a new console
// window — for when you want to watch and steer it live. Resumes the session so it
// keeps the conversation context.
export function openTerminal(id) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: "No such job." };
  // Interactive session — you're at the keyboard, so run with permissions skipped
  // (no prompts) and resume the agent's session so it keeps context.
  const flags = `--dangerously-skip-permissions${j.sessionId ? ` --resume ${j.sessionId}` : ""}`;
  try {
    if (isWin) {
      spawn("cmd", ["/c", "start", "cmd", "/k", `cd /d "${j.wtPath}" && claude ${flags}`], { shell: true, detached: true }).unref();
    } else {
      spawn("sh", ["-c", `cd "${j.wtPath}" && claude ${flags}`], { detached: true, stdio: "ignore" }).unref();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

export async function getDiff(id) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: "No such job." };
  const diff = await git(["diff", `main...${j.branch}`]);
  const stat = await git(["diff", "--stat", `main...${j.branch}`]);
  if (diff.code !== 0) return { ok: false, error: diff.err || "No diff (branch may be gone)." };
  return { ok: true, branch: j.branch, stat: stat.out, diff: diff.out };
}

// Safe merge into main: refuses on a dirty tree or when not on main, and aborts on
// conflict rather than leaving a mess. Never pushes/deploys.
export async function mergeJob(id) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: "No such job." };
  const ahead = await git(["rev-list", "--count", `main..${j.branch}`]);
  if (Number(ahead.out) === 0) return { ok: false, error: "Nothing to ship — the agent committed no changes to this branch." };
  const status = await git(["status", "--porcelain"]);
  if (status.out) return { ok: false, error: `Main working tree has uncommitted changes — merge manually when clear:\n  git merge --no-ff ${j.branch}` };
  const head = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (head.out !== "main") return { ok: false, error: `Not on main (on ${head.out}). Merge manually.` };
  const merge = await git(["merge", "--no-ff", job2branch(j), "-m", `Merge ${j.branch} (bug ${j.reportId})`]);
  if (merge.code !== 0) {
    await git(["merge", "--abort"]);
    return { ok: false, error: "Merge hit a conflict and was aborted. Resolve manually." };
  }
  return { ok: true, message: merge.out || `Merged ${j.branch} into main.`, hint: "Now push + deploy when ready." };
}

function job2branch(j) { return j.branch; }

// Tear down a job's worktree + branch (local only).
export async function discardJob(id) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: "No such job." };
  await git(["worktree", "remove", "--force", j.wtPath]);
  await git(["branch", "-D", j.branch]);
  jobs.delete(id);
  return { ok: true };
}

function runNpm(args, cwd = repoRoot) {
  return new Promise((resolve) => {
    const p = spawn("npm", args, { cwd, shell: isWin, env: process.env });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    p.on("error", (e) => resolve({ code: -1, out: String(e.message || e) }));
    p.on("close", (code) => resolve({ code, out }));
  });
}

// Ship a reviewed fix to the LIVE site — the manual retry for a parked auto-ship. Uses
// the exact same worktree-based landing (landOnMain), so it works even when the primary
// tree is busy: fetch → merge current main → test → push HEAD:main → deploy if worker.
// Deliberate + user-triggered. Because live is the only place changes can be verified.
export async function shipJob(id) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: "No such job." };
  const ahead = await git(["rev-list", "--count", `main..${j.branch}`]);
  if (Number(ahead.out) === 0) return { ok: false, error: "Nothing to ship — the agent committed no changes to this branch." };
  j.shipState = "shipping";
  const res = await landOnMain(j);
  if (!res.ok) { j.shipState = "parked"; j.shipError = res.error; return { ok: false, error: res.error }; }
  j.shipState = "shipped"; j.shippedHash = res.hash; j.deployed = res.deployed;
  const steps = [`pushed → main as ${res.hash} (Pages deploys the static site)`];
  if (res.touchesWorker) steps.push(res.deployed ? "deployed worker (deploy:brain)" : "⚠ worker deploy FAILED — run `npm run deploy:brain`");
  return { ok: true, message: steps.join(" · "), hint: "Live shortly — hard-refresh to beat the SW cache." };
}

// Confirm the CLI is reachable so the GUI can warn early.
export async function claudeAvailable() {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn("claude", ["--version"], { shell: isWin, env: process.env });
    } catch {
      resolve(false);
      return;
    }
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}
