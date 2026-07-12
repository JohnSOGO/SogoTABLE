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
// A one-line lifecycle ledger to the SERVER CONSOLE (the terminal window) — START / SHIPPED / PARKED /
// ERROR only, so a job's outcome is visible at a glance even with the browser GUI closed. Distinct from
// writeLog, which feeds the detailed in-GUI/on-disk job log; this is the terminal's running record.
function ledger(job, msg) {
  console.log(`${new Date().toTimeString().slice(0, 8)} [${job.id}·${job.reportId}] ${msg}`);
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
  // A snapshot of the game at report time (Tier 1 capture) — the real board/seats/pending/chronicle,
  // so the agent can see the state that produced the bug instead of reconstructing it blind.
  if (r.game_state) lines.push("", "Game state at report time (JSON — board, seats, pending, chronicle):", String(r.game_state));
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

// The ROOM batch prompt: one agent takes EVERY open report from a single playtest room and works them as
// a set — the methodology refined by hand over the HPM2/GY3B/UHKO/1WSQ/67QG/06CK batches. Like the
// single-report agent it is BOXED to its worktree branch (no push/deploy/clear) — the harness runs the
// tests and ships (push to main + deploy) only if green, then clears the room's reports.
function buildRoomPrompt(reports, branch, roomCode) {
  const dossier = reports.map((r, i) => `#### Report ${i + 1} of ${reports.length}\n${reportToText(r)}`).join("\n\n----------------\n\n");
  return [
    `You are addressing an ENTIRE playtest room (${roomCode}) of the SogoTable project in one pass —`,
    `${reports.length} report(s) below. You are in an isolated git worktree on branch \`${branch}\`, so`,
    "work freely; your changes do NOT touch the user's main tree.",
    "",
    "Follow CLAUDE.md doctrine (placement before implementation, smallest correct change, sibling-path",
    "parity, docs when contracts change). Work the reports AS A WHOLE, in this order:",
    "",
    "1. REVIEW every report together. GROUP duplicates and near-duplicates (the same underlying issue",
    "   reported different ways) so you fix each root cause once.",
    "2. TRIAGE each report into one of: (a) a real bug to fix; (b) a UX/clarity gap to fix with clearer",
    "   messaging/emoji/feedback — NOT rule changes; (c) working-as-intended — communicate WHY (a clearer",
    "   message), do not change behaviour. Many reports are questions or confusion, not defects.",
    "3. RULES ARE AUTHORITATIVE. For a game, its rulebook doc is the source of truth (e.g.",
    "   docs/mystic-wood-rulebook.md). Do NOT invent or bend rules. If a request CONFLICTS with the",
    "   published rules, follow the rules, keep the behaviour, and explain it in a message — never silently",
    "   implement the conflicting ask. When a snapshot 'bug' turns out to be correct play, say so.",
    "4. Use each report's `game_state` JSON snapshot (board, seats, pending, and the chronicle — each log",
    "   line carries a `t` turn number) to reconstruct what actually happened before deciding.",
    "5. IMPLEMENT the smallest correct change per root cause. Check sibling paths (hot-seat vs room, bot vs",
    "   human, each game module). Respect the file-size ceilings in workers/tests/architecture.test.js —",
    "   if an owning file is at its cap, COMPACT or extract rather than bloat it; never raise a cap.",
    "6. ADD or update focused tests for any logic/rule change. The suite needs no install:",
    "   run `node --test workers/tests/*.test.js` and get it fully GREEN before you finish.",
    "7. COMMIT all of it to this branch with one clear message that maps each report id → what you did",
    "   (fixed / clarified / working-as-intended), and note anything you deliberately did NOT change.",
    "",
    "HARD CONSTRAINTS:",
    "- Do NOT `git push`, do NOT deploy (`npm run deploy:*`), do NOT touch `main`, do NOT resolve/clear the",
    "  bug reports. The harness ships (push to main + deploy if the worker changed) and clears this room's",
    "  reports FOR you — but ONLY if your committed work leaves the test suite green. So a red suite = no",
    "  ship, no clear; leave it green.",
    "- If a report is too ambiguous to act on safely, do NOT guess: say what you investigated and what",
    "  you'd need. The reporter can always re-file it.",
    "",
    "When finished, output a per-report summary: for each, its id and whether you fixed it, clarified it,",
    "or judged it correct — plus the files changed and the test result.",
    "",
    `--- ${reports.length} REPORT(S) FROM ROOM ${roomCode} ---`,
    "",
    dossier,
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
    roomCode: j.roomCode || "", reportCount: Array.isArray(j.reports) ? j.reports.length : 0,
    reportsCleared: j.reportsCleared || 0, clearError: j.clearError || "",
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
  const branches = await git(["branch", "--list", "fix/bug-*", "fix/room-*", "--format=%(refname:short)"]);
  const wt = await git(["worktree", "list", "--porcelain"]);
  const wtByBranch = {};
  let cur = "";
  for (const line of wt.out.split("\n")) {
    if (line.startsWith("worktree ")) cur = line.slice(9).trim();
    else if (line.startsWith("branch ")) wtByBranch[line.slice(7).trim().replace("refs/heads/", "")] = cur;
  }
  for (const branch of branches.out.split("\n").map((s) => s.trim()).filter(Boolean)) {
    if ([...jobs.values()].some((j) => j.branch === branch)) continue;
    const isRoom = branch.startsWith("fix/room-");
    // A room branch is ours ONLY if its suffix is a real room-code shape (uppercase alphanumeric). This
    // keeps recovery from adopting unrelated `fix/room-<topic-slug>` feature branches as phantom jobs.
    if (isRoom && !/^[A-Z0-9]{3,8}$/.test(branch.replace(/^fix\/room-/, ""))) continue;
    const reportId = branch.replace(/^fix\/(bug|room)-/, isRoom ? "room-" : "");
    const commits = await git(["log", "--oneline", `main..${branch}`]);
    const id = `job-${++seq}`;
    const logFile = join(logDir, safeBranch(branch) + ".log");
    let savedLog = "(restored after a server restart — no saved log found)\n";
    if (existsSync(logFile)) { try { savedLog = readFileSync(logFile, "utf8").slice(-MEM_LOG_CAP); } catch { /* keep default */ } }
    jobs.set(id, {
      id, reportId, roomCode: isRoom ? branch.replace(/^fix\/room-/, "") : "", title: `(restored) ${reportId}`, branch,
      wtPath: wtByBranch[branch] || join(repoRoot, ".worktrees", isRoom ? reportId : `bug-${reportId}`),
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
    id, reportId, report, title: firstLine(report.description), branch,
    wtPath: join(repoRoot, ".worktrees", `bug-${reportId}`),
    logFile: join(logDir, safeBranch(branch) + ".log"),
    status: "running", log: "", summary: "", error: "", commits: "",
    startedAt: Date.now(), endedAt: 0,
  };
  jobs.set(id, job);
  running += 1;
  run(job).catch((e) => { job.status = "error"; job.error = String(e && e.message || e); })
    .finally(() => { running -= 1; if (!job.endedAt) job.endedAt = Date.now(); });
  return { ok: true, id, branch };
}

// Address an ENTIRE room in one agent: the reports (fetched by the caller, which owns the API + passcode)
// are worked as a set. `onShipped(reportIds)` is invoked ONLY after a green auto-ship lands on main, so the
// caller can then clear the room's reports — a red suite parks the branch and leaves the reports untouched.
export async function startRoomFix({ roomCode, reports, onShipped } = {}) {
  const code = String(roomCode || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!code) return { ok: false, error: "No room code." };
  if (!Array.isArray(reports) || !reports.length) return { ok: false, error: `No open reports for room ${code}.` };
  if (running >= MAX_CONCURRENT) return { ok: false, error: `Too many agents running (${running}). Try again shortly.` };
  for (const j of jobs.values()) {
    if (j.roomCode === code && j.status === "running") return { ok: false, error: `An agent is already working room ${code}.` };
  }
  const id = `job-${++seq}`;
  const branch = `fix/room-${code}`;
  const job = {
    id, reportId: `room-${code}`, roomCode: code, reports, onShipped,
    reportIds: reports.map((r) => r.id), title: `Room ${code} — ${reports.length} report(s)`, branch,
    wtPath: join(repoRoot, ".worktrees", `room-${code}`),
    logFile: join(logDir, safeBranch(branch) + ".log"),
    status: "running", log: "", summary: "", error: "", commits: "",
    startedAt: Date.now(), endedAt: 0,
  };
  jobs.set(id, job);
  running += 1;
  run(job).catch((e) => { job.status = "error"; job.error = String(e && e.message || e); })
    .finally(() => { running -= 1; if (!job.endedAt) job.endedAt = Date.now(); });
  return { ok: true, id, branch, count: reports.length };
}

async function run(job) {
  const log = (s) => writeLog(job, s);
  const isRoom = Array.isArray(job.reports);
  const prompt = isRoom ? buildRoomPrompt(job.reports, job.branch, job.roomCode) : buildPrompt(job.report, job.branch);

  // Start the persisted log fresh for a new fix, and record the exact brief the agent
  // was given (the edited text goes in via stdin and isn't stored anywhere else).
  try {
    mkdirSync(logDir, { recursive: true });
    writeFileSync(job.logFile, `# Fix-agent log — ${job.branch} (${isRoom ? `room ${job.roomCode}, ${job.reports.length} reports` : `report ${job.reportId}`})\n\n`);
  } catch { /* non-fatal */ }
  log(`== Brief given to the agent ==\n${isRoom ? job.reports.map((r) => reportToText(r)).join("\n\n----\n\n") : reportToText(job.report)}\n\n`);

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
    ledger(job, "✗ ERROR — could not create worktree: " + (add.err || "git failed"));
    return;
  }
  // Stamp the exact base the fix is cut from — the answer to "which code did this land on top of?".
  job.baseRev = (await git(["rev-parse", "--short", base])).out || base;
  log(`base: ${base === "FETCH_HEAD" ? "origin/main" : "local main"} @ ${job.baseRev}\n`);
  ledger(job, `▶ START — "${job.title}" (base ${job.baseRev})`);

  log(`\n$ claude (stream-json) — prompt via stdin, cwd: worktree\n\n`);
  const res = await spawnClaude(job, { prompt });
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
    ledger(job, "✗ ERROR — " + job.error);
  } else if (res.isError) {
    job.status = "error";
    if (!job.error) job.error = job.summary || "Agent reported an error.";
    ledger(job, "✗ ERROR — agent reported a failure");
  } else {
    job.status = "done";
    if (!commits.out) {
      if (!job.summary) job.summary = "Agent finished but committed no changes.";
      ledger(job, "○ done — no changes committed");
    } else if (AUTOSHIP) {
      await autoShip(job);
    } else {
      ledger(job, `● done — ${commits.out.split("\n").length} commit(s) parked on ${job.branch} (auto-ship off)`);
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
    ledger(job, "■ PARKED — " + res.error);
    return;
  }
  job.shippedHash = res.hash; job.deployed = res.deployed;
  if (res.touchesWorker && !res.deployed) job.shipError = "pushed, but deploy:brain failed — run it manually";
  job.shipState = "shipped";
  const shipTail = res.touchesWorker ? (res.deployed ? " · worker deployed" : " · ⚠ worker deploy FAILED") : "";
  log(`\n■ SHIPPED to main as ${res.hash}${shipTail}\n`);
  ledger(job, `■ SHIPPED to main as ${res.hash}${shipTail}`);
  // A room batch clears its reports ONLY now — after the fix is green, on main, and (if needed) deployed.
  if (typeof job.onShipped === "function" && Array.isArray(job.reportIds) && job.reportIds.length) {
    try {
      const cleared = await job.onShipped(job.reportIds);
      job.reportsCleared = cleared;
      log(`\n■ cleared ${cleared} report(s) for room ${job.roomCode}\n`);
      ledger(job, `■ cleared ${cleared} report(s) for room ${job.roomCode}`);
    } catch (e) {
      job.clearError = String(e && e.message || e);
      log(`\n⚠ could not clear reports: ${job.clearError} (shipped OK — clear them manually)\n`);
      ledger(job, `⚠ ship ok, clear failed: ${job.clearError}`);
    }
  }
}

// The shared "land this branch on origin/main" core, used by both auto-ship and the
// manual Ship button. It runs ENTIRELY from the job's worktree: run the test suite, then
// push the branch tip straight to origin/main — a fast-forward when main is unchanged (the
// common case), so there's no fetch/merge to lose to a lock race in this shared clone. Only
// if the push is REJECTED because main advanced does it fetch + merge current main and push
// again (real-conflict / transient handling there). Nothing here touches the shared primary
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

  // Safety gate: never push a red suite. The branch was cut from fresh origin/main, so in the common
  // case (main unchanged during the run) this tests the fix against live main.
  log(`  running the test suite before pushing…\n`);
  let test = await runNpm(["test"], wt);
  if (test.code !== 0) return { ok: false, touchesWorker, error: "tests failed — not pushed; the fix is safe on the branch." };

  // Let the PUSH be the source of truth. A direct push fast-forwards origin/main when main hasn't moved
  // (the common case) — no fetch, no merge, so nothing to lose to a lock race. Git only accepts a
  // fast-forward, so if main advanced under us the push is REJECTED as non-fast-forward; ONLY THEN do we
  // fetch + merge current main in and push again. This is what stops a clean fix parking on a phantom
  // merge failure: in the overwhelmingly common case there is no merge step at all.
  const isNonFF = (r) => /non-fast-forward|fetch first|\[rejected\]|tip of your current branch is behind/i.test((r.err || "") + (r.out || ""));
  let push = await git(["push", "origin", "HEAD:main"], wt);
  if (push.code !== 0 && isNonFF(push)) {
    log(`  main advanced under us — merging it in and retrying the push…\n`);
    await git(["fetch", "origin", "main"], wt);
    const merge = await git(["merge", "--no-ff", "FETCH_HEAD", "-m", `Merge origin/main into ${job.branch}`], wt);
    if (merge.code !== 0) {
      const conflicted = (await git(["diff", "--name-only", "--diff-filter=U"], wt)).out;
      await git(["merge", "--abort"], wt);   // harmless if there was no merge in progress
      if (conflicted) {
        const n = conflicted.split("\n").filter(Boolean).length;
        return { ok: false, touchesWorker, error: `conflicts with the current main (${n} file${n === 1 ? "" : "s"}) — resolve on the branch, then Ship.` };
      }
      return { ok: false, touchesWorker, error: "transient git error merging the advanced main — Ship to retry." };
    }
    test = await runNpm(["test"], wt);   // re-test against the just-merged main
    if (test.code !== 0) return { ok: false, touchesWorker, error: "tests failed after merging the advanced main — the fix is safe on the branch." };
    push = await git(["push", "origin", "HEAD:main"], wt);
  }
  if (push.code !== 0) return { ok: false, touchesWorker, error: "push failed: " + (push.err || push.out).slice(0, 200) + " — Ship to retry." };
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

// The runner's own state for the startup banner: which revision this code is running on, and whether
// auto-ship is armed. Printed once at launch so a restart can be verified ("am I on the new code?").
export async function runnerStatus() {
  const short = (await git(["rev-parse", "--short", "HEAD"])).out;
  const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).out;
  const dirty = !!(await git(["status", "--porcelain"])).out;
  const subject = (await git(["log", "-1", "--format=%s"])).out;
  return { short, branch, dirty, subject, autoship: AUTOSHIP };
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
