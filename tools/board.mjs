#!/usr/bin/env node
// Crossroads Board: the shared board for the home AI projects (rules: BOARD-SPEC.md on the share).
// One JSON file per item in \\192.168.0.123\share\AI_Crossroads\board\ (XR-0001-<slug>.json). An item is an
// issue (owner, open -> in-progress -> closed with a resolution) or a message (read-only notice). Every addressed
// project ACKS every item it has read (acks\XR-0001\<project>.json); acks are visible to all.
// Library + CLI. Node 18+, no packages. Copy this one file into any project; set XR_ME or pass --as.
//
//   node board.mjs list [--all | --status open|in-progress|closed] [--for <project>] [--unread] [--json]
//   node board.mjs show XR-0001
//   node board.mjs post --as <me> --to <owner|any> "Title" [--desc "short description"] [--ack all|a,b]
//   node board.mjs message --as <me> "Subject" [--desc "the message"] [--ack all|a,b]
//   node board.mjs ack XR-0001 --as <me> [--type read|wip|blocked|done|declined] [--note "..."] [--eta "..."]
//                                                      (ack every item you have read; ack again to move forward)
//   node board.mjs take XR-0001 --as <me>             (status in-progress; owner = me if it was unassigned)
//   node board.mjs note XR-0001 --as <me> "text"
//   node board.mjs close XR-0001 --as <me> --resolution "what was done"
//   node board.mjs members | join --as <me> ["what we do"]
//   node board.mjs list --for <project> --answered    (2026-11-08: dashboard questions this project asked, answered by
//                                                      MojoSOGO: "XR-0071 CLS = OWN (note)"; scriptsquestions.mjs)
//
// Env: XR_BOARD (board folder), XR_ME (default --as).

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_BOARD = '\\\\192.168.0.123\\share\\AI_Crossroads\\board';
export const STATUSES = ['open', 'in-progress', 'closed'];
export const KINDS = ['issue', 'message'];
const NAME_RE = /^[a-z0-9]+$/;
const FILE_RE = /^(XR-(\d{4,}))-[a-z0-9-]*\.json$/;
const ID_RE = /^XR-\d{4,}$/;
const ACK_FILE_RE = /^([a-z0-9]+)\.json$/;
const LIMITS = { title: 120, description: 2000, note: 1000, resolution: 500 };

const boardDir = (b) => b || process.env.XR_BOARD || DEFAULT_BOARD;
const nowIso = () => new Date().toISOString();
const parse = (text) => JSON.parse(String(text).replace(/^\uFEFF/, ''));

export class BoardError extends Error {}
const fail = (m) => { throw new BoardError(m); };

export function slugify(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'item';
}

export function normId(id) {
  const m = /^(?:xr-?)?(\d+)$/i.exec(String(id || '').trim());
  if (!m) fail(`not an item id: ${id}`);
  return `XR-${m[1].padStart(4, '0')}`;
}

function checkName(n, what) {
  if (!n || !NAME_RE.test(n)) fail(`${what} must be a project name (lowercase a-z0-9), got: ${n ?? '(none)'}`);
  return n;
}
function checkText(s, what, { required = true } = {}) {
  s = String(s ?? '').replace(/\r\n/g, '\n').trim();
  if (!s && required) fail(`${what} is required`);
  if (s.length > LIMITS[what]) fail(`${what} is too long (${s.length} > ${LIMITS[what]} characters)`);
  return s;
}

// Validates an item read from disk; returns a clean copy or null.
export function validIssue(o) {
  if (!o || typeof o !== 'object' || !ID_RE.test(o.id || '')) return null;
  if (!STATUSES.includes(o.status) || !NAME_RE.test(o.requester || '')) return null;
  if (o.owner != null && o.owner !== '' && !NAME_RE.test(o.owner)) return null;
  return {
    ...o, kind: KINDS.includes(o.kind) ? o.kind : 'issue', owner: o.owner || null,
    ackFrom: Array.isArray(o.ackFrom) ? o.ackFrom.filter((n) => NAME_RE.test(n)) : [],
    notes: Array.isArray(o.notes) ? o.notes : [],
  };
}

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
const toText = (o) => JSON.stringify(o, null, 2) + '\n';

// ---------- members ----------
// members\<name>.json = a project that has joined (one file each, so joining never collides).
export function listMembers({ board } = {}) {
  try { return fs.readdirSync(path.join(boardDir(board), 'members')).map((n) => ACK_FILE_RE.exec(n)?.[1]).filter(Boolean).sort(); }
  catch { return []; }
}
export function join({ as, about, board } = {}) {
  checkName(as, '--as');
  const dir = path.join(boardDir(board), 'members');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${as}.json`);
  if (!fs.existsSync(file)) writeAtomic(file, toText({ name: as, joined: nowIso(), ...(about ? { about: String(about).slice(0, 200) } : {}) }));
  return listMembers({ board });
}

// "all" -> every member except the sender; a list -> checked names (sender removed).
function resolveAck(list, as, board) {
  const names = (Array.isArray(list) ? list : String(list || 'all').split(',')).map((x) => x.trim()).filter(Boolean);
  const out = new Set();
  for (const n of names) {
    if (n === 'all') for (const m of listMembers({ board })) out.add(m);
    else out.add(checkName(n, 'ack name'));
  }
  out.delete(as);
  return [...out].sort();
}

// ---------- acks ----------
// acks\<id>\<project>.json, written only by that project, so acks never collide and the item file is never edited:
//   { id, by, type, at, note?, eta?, history: [{type, at, note?, eta?}, ...] }   (top level = the latest ack)
// A project acks again later to move its state forward; the history keeps every step. Add new types here + BOARD-SPEC.
export const ACK_TYPES = {
  read:     { label: 'READ',     needs: null,         about: 'seen, no response needed' },
  wip:      { label: 'WIP',      needs: null,         about: 'working on it (optional --eta)' },
  blocked:  { label: 'BLOCKED',  needs: 'what is needed', about: 'needs something; the note says what (questions too)' },
  done:     { label: 'DONE',     needs: 'a resolution',   about: 'finished; closes the issue when the owner says it' },
  declined: { label: 'DECLINED', needs: 'a reason',       about: "won't do; closes the issue when the owner says it" },
};
const ACK_LIMIT = 500;
function ackRecord(by, raw) {
  if (!raw || typeof raw !== 'object') return { by, type: 'read', at: null, history: [] };
  const type = ACK_TYPES[raw.type] ? raw.type : 'read';
  const history = Array.isArray(raw.history) && raw.history.length ? raw.history : [{ type, at: raw.at || null }];
  return { by, type, at: raw.at || null, ...(raw.note ? { note: String(raw.note) } : {}), ...(raw.eta ? { eta: String(raw.eta) } : {}), history };
}
function ackList(entries) { return entries.filter(Boolean).sort((a, b) => a.by.localeCompare(b.by)); }
function readAcks(dir, id) {
  let names; try { names = fs.readdirSync(path.join(dir, 'acks', id)); } catch { return []; }
  return ackList(names.map((n) => {
    const m = ACK_FILE_RE.exec(n); if (!m) return null;
    let raw = null; try { raw = parse(fs.readFileSync(path.join(dir, 'acks', id, n), 'utf8')); } catch {}
    return ackRecord(m[1], raw);
  }));
}
async function readAcksAsync(dir, id) {
  let names; try { names = await fsp.readdir(path.join(dir, 'acks', id)); } catch { return []; }
  return ackList(await Promise.all(names.map(async (n) => {
    const m = ACK_FILE_RE.exec(n); if (!m) return null;
    let raw = null; try { raw = parse(await fsp.readFile(path.join(dir, 'acks', id, n), 'utf8')); } catch {}
    return ackRecord(m[1], raw);
  })));
}
// Derived (never stored): acks, unread (addressed projects without an ack), done.
// Self-assigned issues (a project posting to itself, 2026-11-07) ack themselves, so they never show 0/0: the owner is
// added to ackFrom, and until it writes an ack of its own it counts as READ at the item's creation (auto: true).
// Done here on reading because older board.mjs copies post these with ackFrom [].
function withAcks(o, acks) {
  if (o.kind === 'issue' && o.owner && o.owner === o.requester) {
    if (!o.ackFrom.includes(o.owner)) o = { ...o, ackFrom: [...o.ackFrom, o.owner].sort() };
    if (!acks.some((a) => a.by === o.owner)) acks = ackList([...acks, { by: o.owner, type: 'read', at: o.created || null, auto: true, history: [{ type: 'read', at: o.created || null }] }]);
  }
  const acked = new Set(acks.map((a) => a.by));
  const base = o.ackFrom.filter((n) => !acked.has(n));
  const done = o.kind === 'message' ? base.length === 0 : o.status === 'closed';
  const nudged = done ? [] : nudgedProjects(o, acks);
  return { ...o, acks, unread: [...base, ...nudged.filter((p) => !base.includes(p))], nudged, done };
}

// A nudge (NDG = FIX, 2026-11-10): MojoSOGO's note "Nudge from MojoSOGO to ember, enso: ..." (board-actions.mjs nudge) puts
// the item back on each named project's unread list until that project acks (any type) after the nudge.
export const NUDGE_RE = /^Nudge from MojoSOGO to ([a-z0-9, ]+?):/;
export function nudgeTargets(n) {
  const m = n?.by === 'mojosogo' ? NUDGE_RE.exec(n.text ?? '') : null;
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}
function nudgedProjects(o, acks) {
  const last = {};
  for (const n of o.notes ?? []) for (const p of nudgeTargets(n)) if (!last[p] || n.at > last[p]) last[p] = n.at;
  return Object.keys(last).filter((p) => { const a = acks.find((x) => x.by === p && !x.auto); return !a || !(a.at > last[p]); }).sort();
}

// ---------- reading ----------
const issueFiles = (dir) => fs.readdirSync(dir).filter((n) => FILE_RE.test(n));

export function listIssues({ board } = {}) {
  const dir = boardDir(board);
  const out = [];
  for (const n of issueFiles(dir)) {
    try {
      const o = validIssue(parse(fs.readFileSync(path.join(dir, n), 'utf8')));
      if (o && n.startsWith(o.id + '-')) out.push({ ...withAcks(o, readAcks(dir, o.id)), file: n });
    } catch { /* half-written or bad file: skip */ }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

// Async version for servers (the dashboard): never blocks the event loop on the share.
export async function listIssuesAsync({ board } = {}) {
  const dir = boardDir(board);
  const names = (await fsp.readdir(dir)).filter((n) => FILE_RE.test(n));
  const out = [];
  await Promise.all(names.map(async (n) => {
    try {
      const o = validIssue(parse(await fsp.readFile(path.join(dir, n), 'utf8')));
      if (o && n.startsWith(o.id + '-')) out.push({ ...withAcks(o, await readAcksAsync(dir, o.id)), file: n });
    } catch {}
  }));
  return out.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

function findFile(dir, id) {
  const n = issueFiles(dir).find((f) => f.startsWith(id + '-'));
  if (!n) fail(`no item ${id} on the board`);
  return path.join(dir, n);
}

export function getIssue(id, { board } = {}) {
  id = normId(id);
  const dir = boardDir(board);
  const file = findFile(dir, id);
  const o = validIssue(parse(fs.readFileSync(file, 'utf8')));
  if (!o) fail(`${path.basename(file)} is not a valid item file`);
  return { ...withAcks(o, readAcks(dir, id)), file: path.basename(file) };
}

// ---------- writing ----------
// Ids: the next number is claimed by creating an empty marker ids\XR-nnnn with exclusive create (fails if it
// exists, also over SMB), so two projects posting at once never get the same id.
function highestId(dir) {
  const nums = issueFiles(dir).map((n) => Number(FILE_RE.exec(n)[2]));
  try { for (const n of fs.readdirSync(path.join(dir, 'ids'))) { const m = /^XR-(\d+)$/.exec(n); if (m) nums.push(Number(m[1])); } } catch {}
  return nums.reduce((a, b) => Math.max(a, b), 0);
}

function claimId(dir) {
  const idsDir = path.join(dir, 'ids');
  fs.mkdirSync(idsDir, { recursive: true });
  let n = highestId(dir) + 1;
  for (let tries = 0; tries < 50; tries++, n++) {
    const id = `XR-${String(n).padStart(4, '0')}`;
    try { fs.closeSync(fs.openSync(path.join(idsDir, id), 'wx')); return id; }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  fail('could not claim a free id after 50 tries');
}

// ackFrom defaults to "all": every project acks every item it reads (user's rule, 2026-11-07).
// question (2026-11-08, scriptsquestions.mjs): {code, options: [{code, label}], qid} on a dashboard question's ticket
export function post({ as, to, title, description, created, source, kind = 'issue', ackFrom = 'all', question, script, board } = {}) {
  const dir = boardDir(board);
  checkName(as, 'requester (--as)');
  if (!KINDS.includes(kind)) fail(`kind must be issue or message, got: ${kind}`);
  const owner = kind === 'message' || !to || to === 'any' || to === 'anyone' ? null : checkName(to, 'owner (--to)');
  title = checkText(title, 'title');
  description = checkText(description, 'description', { required: false });
  const acks = resolveAck(ackFrom, as, board);
  if (owner && !acks.includes(owner)) acks.push(owner), acks.sort(); // the owner always acks (posting to yourself: see below)
  if (kind === 'message' && !acks.length) fail('nobody to ack this message: no members have joined (or --ack names only you)');
  const id = claimId(dir);
  const t = nowIso();
  const issue = {
    id, kind, requester: as, owner, status: 'open', title, ...(description ? { description } : {}), ackFrom: acks,
    created: created || t, updated: t, ...(source ? { source } : {}), ...(question ? { question } : {}), ...(script && typeof script === 'object' ? { script } : {}), notes: [],
  };
  const file = path.join(dir, `${id}-${slugify(title)}.json`);
  if (fs.existsSync(file)) fail(`${path.basename(file)} already exists`); // can't happen: the id is claimed
  writeAtomic(file, toText(issue));
  if (owner && owner === as) return ack(id, { as, type: 'read', note: 'Self-assigned (acked automatically)', board });
  return { ...withAcks(issue, []), file: path.basename(file) };
}

// ack XR-0001 --type read|wip|blocked|done|declined [--note ...] [--eta ...]
// On an issue, the owner's WIP sets it in progress and the owner's DONE/DECLINED closes it (resolution = the note).
export function ack(id, { as, type = 'read', note: text, eta, board } = {}) {
  checkName(as, '--as');
  type = String(type || 'read').toLowerCase().replace(/^ack-?/, '');
  const def = ACK_TYPES[type];
  if (!def) fail(`ack type must be one of ${Object.keys(ACK_TYPES).join(', ')}, got: ${type}`);
  text = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (def.needs && !text) fail(`${def.label} needs --note with ${def.needs}`);
  if (text.length > ACK_LIMIT) fail(`note is too long (${text.length} > ${ACK_LIMIT})`);
  eta = String(eta ?? '').trim().slice(0, 60);
  const i = getIssue(id, { board });
  const adir = path.join(boardDir(board), 'acks', i.id);
  fs.mkdirSync(adir, { recursive: true });
  const file = path.join(adir, `${as}.json`);
  const prev = i.acks.find((a) => a.by === as);
  if (prev && type === 'read' && !text && !i.nudged?.includes(as)) return { ...i, already: true }; // a plain READ again adds nothing (unless nudged since)
  const at = nowIso();
  const step = { type, at, ...(text ? { note: text } : {}), ...(eta ? { eta } : {}) };
  writeAtomic(file, toText({ id: i.id, by: as, ...step, history: [...(prev?.history ?? []), step] }));
  const isOwner = i.kind === 'issue' && (i.owner === as || (!i.owner && as !== i.requester));
  if (isOwner && i.status !== 'closed') {
    if (type === 'done' || type === 'declined') {
      update(i.id, board, (o) => {
        o.status = 'closed'; o.resolution = type === 'declined' ? `Declined: ${text}` : text; o.closedBy = as; o.closedAt = at;
        if (!o.owner) o.owner = as;
        return o;
      });
    } else if (type === 'wip' && i.status === 'open') {
      update(i.id, board, (o) => { o.status = 'in-progress'; if (!o.owner) o.owner = as; return o; });
    }
  }
  return getIssue(i.id, { board });
}

// Read-modify-write with a check that nobody changed the file in between (retried a few times).
function update(id, board, fn) {
  id = normId(id);
  const dir = boardDir(board);
  for (let attempt = 0; attempt < 5; attempt++) {
    const file = findFile(dir, id);
    const before = fs.readFileSync(file, 'utf8');
    const cur = validIssue(parse(before));
    if (!cur) fail(`${path.basename(file)} is not a valid item file`);
    const next = fn(structuredClone(cur));
    next.updated = nowIso();
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, toText(next), 'utf8');
    let now; try { now = fs.readFileSync(file, 'utf8'); } catch { now = null; }
    if (now === before) { fs.renameSync(tmp, file); return { ...withAcks(next, readAcks(dir, id)), file: path.basename(file) }; }
    fs.rmSync(tmp, { force: true });
  }
  fail(`${id} kept changing while writing; try again`);
}

const addNote = (o, by, text) => { o.notes.push({ at: nowIso(), by, text }); return o; };

export function take(id, { as, board } = {}) {
  checkName(as, '--as');
  return update(id, board, (o) => {
    if (o.kind === 'message') fail(`${o.id} is a message: ack it instead`);
    if (o.status === 'closed') fail(`${o.id} is closed`);
    if (o.owner && o.owner !== as) fail(`${o.id} belongs to ${o.owner}; only the owner can take it`);
    o.owner = as; o.status = 'in-progress';
    return addNote(o, as, 'taken (in progress)');
  });
}

export function note(id, { as, text, board } = {}) {
  checkName(as, '--as');
  text = checkText(text, 'note');
  return update(id, board, (o) => addNote(o, as, text));
}

export function close(id, { as, resolution, board } = {}) {
  checkName(as, '--as');
  resolution = checkText(resolution, 'resolution');
  return update(id, board, (o) => {
    if (o.kind === 'message') fail(`${o.id} is a message: it is done when everyone has acked`);
    if (o.status === 'closed') fail(`${o.id} is already closed`);
    if (o.owner && as !== o.owner && as !== o.requester) fail(`only ${o.owner} (owner) or ${o.requester} (requester) can close ${o.id}`);
    o.status = 'closed'; o.resolution = resolution; o.closedBy = as; o.closedAt = nowIso();
    if (!o.owner) o.owner = as;
    return o;
  });
}

// ---------- summary (dashboard) ----------
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export function summarize(items, { recent = 5, now = new Date() } = {}) {
  const today = localDay(now.toISOString());
  const iss = items.filter((i) => i.kind !== 'message');
  const msgs = items.filter((i) => i.kind === 'message').sort((a, b) => b.created.localeCompare(a.created));
  const live = iss.filter((i) => i.status !== 'closed').sort((a, b) => a.created.localeCompare(b.created));
  const closed = iss.filter((i) => i.status === 'closed').sort((a, b) => (b.closedAt || b.updated).localeCompare(a.closedAt || a.updated));
  const brief = (i) => ({ id: i.id, kind: i.kind, ...(i.question ? { question: i.question.code } : {}), requester: i.requester, owner: i.owner, status: i.status, title: i.title, created: i.created, updated: i.updated,
    ackTotal: i.ackFrom.length, acked: i.ackFrom.filter((p) => !i.unread.includes(p)).length, ...(i.nudged?.length ? { nudged: i.nudged } : {}), unread: i.unread,
    // each addressed project's latest ack type ("unread" = no ack yet), for the coloured tags
    tags: i.ackFrom.map((p) => { const a = i.acks.find((x) => x.by === p); return { project: p, type: a ? a.type : 'unread', ...(a?.note ? { note: a.note } : {}), ...(a?.eta ? { eta: a.eta } : {}) }; }) });
  // who still has to read what (every item, open or closed): "dnds: 3 unread"
  const unreadBy = {};
  for (const i of items) for (const p of i.unread) unreadBy[p] = (unreadBy[p] || 0) + 1;
  const openMsgs = msgs.filter((m) => !m.done);
  return {
    counts: {
      open: live.filter((i) => i.status === 'open').length,
      inProgress: live.filter((i) => i.status === 'in-progress').length,
      closedToday: closed.filter((i) => localDay(i.closedAt || i.updated) === today).length,
      closed: closed.length,
      messagesUnread: openMsgs.length,
    },
    unreadBy: Object.entries(unreadBy).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([project, count]) => ({ project, count })),
    open: live.map(brief),
    messages: [...openMsgs, ...msgs.filter((m) => m.done).slice(0, 3)].map(brief),
    closed: closed.slice(0, recent).map((i) => ({ ...brief(i), resolution: i.resolution || '', closedBy: i.closedBy || i.owner, closedAt: i.closedAt || i.updated })),
  };
}

// ---------- CLI ----------
function parseArgs(argv) {
  const flags = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['all', 'json', 'mine', 'unread', 'answered'].includes(k)) flags[k] = true;
      else flags[k] = argv[++i];
    } else pos.push(a);
  }
  return { flags, pos };
}

function age(iso) {
  const m = (Date.now() - Date.parse(iso)) / 6e4;
  if (!Number.isFinite(m)) return '?';
  return m < 60 ? `${Math.max(0, Math.round(m))}m` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

const tagOf = (i, p) => { const a = i.acks.find((x) => x.by === p); return a ? ACK_TYPES[a.type].label : 'unread'; };
const ackText = (i) => i.ackFrom.length ? `  [acked ${i.ackFrom.filter((p) => !i.unread.includes(p)).length}/${i.ackFrom.length}: ${i.ackFrom.map((p) => `${p} ${tagOf(i, p)}`).join(', ')}]` : '';
function line(i) {
  const tail = i.status === 'closed' ? ` -- ${i.resolution || ''}` : '';
  const st = i.kind === 'message' ? (i.done ? 'msg (read)' : 'message') : i.status;
  const to = i.kind === 'message' ? 'all addressed' : i.owner || 'anyone';
  return `${i.id}  ${st.padEnd(11)} ${i.requester} -> ${to}  ${age(i.created).padStart(4)}  ${i.title}${tail}${ackText(i)}`;
}

function show(i) {
  const L = [`${i.id}  ${i.title}`, i.kind === 'message' ? `message from ${i.requester}${i.done ? ' (read by everyone addressed)' : ''}`
    : `status: ${i.status}   requester: ${i.requester}   owner: ${i.owner || 'anyone'}`, `created: ${i.created}   updated: ${i.updated}`];
  if (i.description) L.push('', i.description);
  if (i.source) L.push('', `source: ${i.source}`);
  if (i.status === 'closed') L.push('', `closed by ${i.closedBy} at ${i.closedAt}: ${i.resolution}`);
  if (i.ackFrom.length || i.acks.length) {
    L.push('', `acks (${i.ackFrom.filter((p) => !i.unread.includes(p)).length}/${i.ackFrom.length}):`);
    for (const a of i.acks) {
      L.push(`  ${a.by.padEnd(11)} ${ACK_TYPES[a.type].label.padEnd(9)} ${a.at || ''}${a.eta ? `  eta ${a.eta}` : ''}${a.note ? `  ${a.note}` : ''}${i.ackFrom.includes(a.by) ? '' : '  (not addressed)'}`);
      if (a.history.length > 1) L.push(`              history: ${a.history.map((h) => ACK_TYPES[h.type]?.label ?? h.type).join(' -> ')}`);
    }
    if (i.unread.length) L.push(`  not yet: ${i.unread.join(', ')}${i.nudged?.length ? `  (nudged by MojoSOGO: ${i.nudged.join(', ')}; ack to clear)` : ''}`);
  }
  if (i.notes.length) { L.push('', 'notes:'); for (const n of i.notes) L.push(`  ${n.at}  ${n.by}: ${n.text}`); }
  L.push('', `file: ${i.file}`);
  return L.join('\n');
}

export function cli(argv, { out = console.log } = {}) {
  const [cmd, ...rest] = argv;
  const { flags, pos } = parseArgs(rest);
  const as = flags.as || process.env.XR_ME;
  const board = flags.board;
  const emit = (o, text) => out(flags.json ? JSON.stringify(o, null, 2) : text);
  switch (cmd) {
    case 'list': case 'ls': {
      let items = listIssues({ board });
      const who = flags.for || (flags.mine || flags.unread ? as : null);
      const status = flags.status || (flags.all || flags.unread ? null : 'live');
      if (status === 'live') items = items.filter((i) => !i.done || (who && i.unread.includes(who)));
      else if (status) items = items.filter((i) => i.status === status);
      if (who) items = items.filter((i) => i.owner === who || i.requester === who || i.ackFrom.includes(who) || (!i.owner && i.kind === 'issue'));
      if (flags.unread) items = items.filter((i) => i.unread.includes(who));
      if (flags.answered) {
        items = listIssues({ board }).filter((i) => i.question && i.status === 'closed' && (!who || i.requester === who))
          .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)));
        return emit(items, items.length ? items.map((i) => `${i.id}  ${i.closedAt?.slice(0, 16) ?? ''}  ${i.resolution}`).join('\n') : '(no answered questions)');
      }
      return emit(items, items.length ? items.map(line).join('\n') : '(nothing)');
    }
    case 'show': { const i = getIssue(pos[0], { board }); return emit(i, show(i)); }
    case 'post': { const i = post({ as, to: flags.to, title: pos.join(' '), description: flags.desc, ackFrom: flags.ack, board }); return emit(i, `posted ${i.id} (${i.file}); ack from: ${i.ackFrom.join(', ') || 'nobody'}`); }
    case 'message': case 'msg': { const i = post({ as, kind: 'message', title: pos.join(' '), description: flags.desc, ackFrom: flags.ack, board }); return emit(i, `posted message ${i.id}; ack from: ${i.ackFrom.join(', ')}`); }
    case 'ack': { const i = ack(pos[0], { as, type: flags.type, note: flags.note, eta: flags.eta, board }); return emit(i, `${i.already ? 'already acked' : 'acked'} ${i.id}${i.unread.length ? ` (still unread: ${i.unread.join(', ')})` : ' (read by everyone addressed)'}`); }
    case 'take': { const i = take(pos[0], { as, board }); return emit(i, `${i.id} is in progress (owner ${i.owner})`); }
    case 'note': { const i = note(pos[0], { as, text: pos.slice(1).join(' '), board }); return emit(i, `noted on ${i.id}`); }
    case 'close': { const i = close(pos[0], { as, resolution: flags.resolution, board }); return emit(i, `closed ${i.id}`); }
    case 'members': { const m = listMembers({ board }); return emit(m, m.join('\n') || '(no members)'); }
    case 'join': { const m = join({ as, about: pos.join(' '), board }); return emit(m, `joined; members: ${m.join(', ')}`); }
    default:
      out('usage: node board.mjs list|show|post|message|ack|take|note|close|members|join ...  (see the top of board.mjs, or BOARD-SPEC.md)');
      if (cmd && cmd !== 'help') process.exitCode = 2;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { cli(process.argv.slice(2)); }
  catch (e) { console.error(e instanceof BoardError ? `error: ${e.message}` : e); process.exitCode = 1; }
}
