// Bug-fixing agent runner for the bug-report manager. Each "Address" from the GUI
// spins up an isolated git worktree on its own branch, launches the Claude Code
// CLI headlessly inside it to diagnose + fix + test the report, and leaves the
// branch for review. It NEVER pushes or deploys — that stays a human decision.
//
// Isolation matters: worktrees keep the agent off the user's main working tree, so
// concurrent work (and other jobs sharing the clone) is untouched.
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

  // Start the persisted log fresh for a new fix.
  try {
    mkdirSync(logDir, { recursive: true });
    writeFileSync(job.logFile, `# Fix-agent log — ${job.branch} (report ${job.reportId})\n\n`);
  } catch { /* non-fatal */ }

  // Fresh worktree: clear any stale one for this report first.
  await git(["worktree", "remove", "--force", job.wtPath]);
  await git(["branch", "-D", job.branch]);
  mkdirSync(join(repoRoot, ".worktrees"), { recursive: true });
  log(`$ git worktree add -b ${job.branch} ${job.wtPath} main\n`);
  const add = await git(["worktree", "add", "-b", job.branch, job.wtPath, "main"]);
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
  job.endedAt = Date.now();
  if (res.exit !== 0) {
    job.status = "error";
    if (!job.error) job.error = `Agent exited with code ${res.exit}` + (res.exit === -1 ? " (is the `claude` CLI on PATH?)" : "");
  } else if (res.isError) {
    job.status = "error";
    if (!job.error) job.error = job.summary || "Agent reported an error.";
  } else {
    job.status = "done";
    if (!commits.out && !job.summary) job.summary = "Agent finished but committed no changes.";
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
  const resume = j.sessionId ? ` --resume ${j.sessionId}` : "";
  try {
    if (isWin) {
      spawn("cmd", ["/c", "start", "cmd", "/k", `cd /d "${j.wtPath}" && claude${resume}`], { shell: true, detached: true }).unref();
    } else {
      spawn("sh", ["-c", `cd "${j.wtPath}" && claude${resume}`], { detached: true, stdio: "ignore" }).unref();
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

function runNpm(args) {
  return new Promise((resolve) => {
    const p = spawn("npm", args, { cwd: repoRoot, shell: isWin, env: process.env });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    p.on("error", (e) => resolve({ code: -1, out: String(e.message || e) }));
    p.on("close", (code) => resolve({ code, out }));
  });
}

// Ship a reviewed fix to the LIVE site: merge (with the same safety checks), push to
// origin/main (Cloudflare Pages auto-deploys the static frontend), and — only if the
// change touched workers/ — run deploy:brain. Deliberate + user-triggered; the agent
// itself never does this. Because live is the only place changes can be verified here.
export async function shipJob(id) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: "No such job." };
  const changed = await git(["diff", "--name-only", `main...${j.branch}`]);
  const touchesWorker = changed.out.split("\n").some((f) => f.startsWith("workers/"));
  const merged = await mergeJob(id);
  if (!merged.ok) return merged;
  const steps = [merged.message || "merged"];
  const push = await git(["push", "origin", "main"]);
  if (push.code !== 0) return { ok: false, error: "Merged locally, but push failed:\n" + (push.err || push.out) + "\nPush/deploy manually." };
  steps.push("pushed → main (Pages deploys the static site)");
  if (touchesWorker) {
    const dep = await runNpm(["run", "deploy:brain"]);
    if (dep.code !== 0) return { ok: false, error: "Pushed, but worker deploy failed:\n" + dep.out.slice(-900) + "\nRun `npm run deploy:brain` manually." };
    steps.push("deployed worker (deploy:brain)");
  }
  return { ok: true, message: steps.join(" · "), hint: touchesWorker ? "Live now — hard-refresh to beat the SW cache." : "Live shortly (Pages build) — hard-refresh to beat the SW cache." };
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
