// Last Orders — the end-of-my-turn summary card (pure view; decides nothing).
//
// Rounds are global and turns are local, so the card answers "how did I do
// since my last turn ended?": when the turn passes off me, my Grit, Buzz and
// Coins (from the projected public stats) are compared with the snapshot taken
// at the end of my previous turn (or when I first sat down to play), and a
// small, cheerful card pops up with the three changes counting up.
//
// The baseline is kept per room + epoch + mark in sessionStorage, and the
// very first look only primes it, so a reload, reconnect or second tab never
// shows a fake card. The card floats over the table; only the card itself
// takes taps (a tap dismisses it), and it gets out of the way at once when a
// reaction I can answer opens.
import { STATS, TURN_SUMMARY } from "./branding.js";

const SHOW_MS = 5200;
const COUNT_MS = 900;
const KEYS = ["grit", "buzz", "gold"];
// Which way is good for me: more Grit and Coins, less Buzz.
const GOOD = { grit: 1, buzz: -1, gold: 1 };

let T = { key: "", store: "", snaps: {}, lastMark: null, card: null, timer: null };

const storeKey = (key) => `lo.turnsum.${key}`;
function load(key) {
  try { const raw = sessionStorage.getItem(storeKey(key)); return raw ? JSON.parse(raw) || {} : {}; } catch { return {}; }
}
function save() {
  try { sessionStorage.setItem(T.store, JSON.stringify(T.snaps)); } catch { /* private mode: memory only */ }
}

export function turnSummaryReset(key) {
  if (T.key === key) return;
  clearTimeout(T.timer);
  T = { key, store: storeKey(key), snaps: load(key), lastMark: null, card: null, timer: null };
}

const statsOf = (p) => ({ grit: Number(p.grit) || 0, buzz: Number(p.buzz) || 0, gold: Number(p.gold) || 0 });

// Pure: the three changes, and a mood from how the night is going for me.
export function turnDelta(before, after) {
  const d = {};
  KEYS.forEach((k) => { d[k] = (Number(after[k]) || 0) - (Number(before[k]) || 0); });
  const score = KEYS.reduce((sum, k) => sum + Math.sign(d[k]) * GOOD[k], 0);
  const mood = score > 0 ? "good" : score < 0 ? "rough" : KEYS.some((k) => d[k]) ? "mixed" : "steady";
  return { d, mood };
}

function slot(root) {
  let el = root.querySelector(":scope > .lo-turnsum");
  if (!el) {
    el = document.createElement("div");
    el.className = "lo-turnsum";
    el.setAttribute("aria-live", "polite");
    root.prepend(el);
  }
  return el;
}

function cardHtml(card, esc) {
  const { before, after, d, mood } = card;
  const rows = KEYS.map((k, i) => {
    const n = d[k];
    const tone = !n ? "lo-ts-same" : Math.sign(n) === GOOD[k] ? "lo-ts-up" : "lo-ts-down";
    const chip = n ? `${n > 0 ? "+" : "−"}${Math.abs(n)}` : "±0";
    return `<div class="lo-ts-stat ${tone}" style="--i:${i}">
        <span class="lo-ts-icon" aria-hidden="true">${STATS[k].icon}</span>
        <span class="lo-ts-name">${esc(STATS[k].name)}</span>
        <span class="lo-ts-num"><s>${before[k]}</s> <b data-lo-ts-from="${before[k]}" data-lo-ts-to="${after[k]}">${after[k]}</b></span>
        <span class="lo-ts-chip">${esc(chip)}</span>
      </div>`;
  }).join("");
  return `<div class="lo-ts lo-ts-${mood}" role="status" data-lo-ts-card>
      <div class="lo-ts-head"><span class="lo-ts-face" aria-hidden="true">${TURN_SUMMARY.face[mood]}</span>
        <span><b>${esc(TURN_SUMMARY.title)}</b><small>${esc(TURN_SUMMARY.mood[mood])}</small></span></div>
      <div class="lo-ts-stats">${rows}</div>
      <div class="lo-ts-foot">${esc(TURN_SUMMARY.since)}</div>
    </div>`;
}

function countUp(el, reduced) {
  if (reduced || typeof requestAnimationFrame !== "function") return;
  const t0 = performance.now();
  el.querySelectorAll("[data-lo-ts-to]").forEach((b) => {
    const from = Number(b.getAttribute("data-lo-ts-from"));
    const to = Number(b.getAttribute("data-lo-ts-to"));
    if (from === to) return;
    const step = (t) => {
      if (!b.isConnected) return;
      const k = Math.min(1, (t - t0 - 350) / COUNT_MS);
      b.textContent = String(Math.round(from + (to - from) * Math.max(0, k)));
      if (k < 1) requestAnimationFrame(step);
    };
    b.textContent = String(from);
    requestAnimationFrame(step);
  });
}

function hide(getRoot) {
  clearTimeout(T.timer);
  T.timer = null;
  T.card = null;
  const root = getRoot();
  const el = root && root.querySelector(":scope > .lo-turnsum");
  if (el) el.innerHTML = "";
}

function show(getRoot, card, view) {
  const root = getRoot();
  if (!root) return;
  T.card = card;
  const el = slot(root);
  el.innerHTML = cardHtml(card, view.esc);
  const box = el.firstElementChild;
  box.addEventListener("click", () => hide(getRoot));
  countUp(box, view.reduced);
  clearTimeout(T.timer);
  T.timer = setTimeout(() => hide(getRoot), SHOW_MS);
}

// After every paint. view: { myMark, me, players, esc, reduced }.
export function turnSummaryFeed(getRoot, game, view) {
  const root = getRoot();
  if (!root) return;
  const mark = view.myMark;
  const seat = mark ? (view.players || []).find((p) => p.mark === mark) : null;
  if (game.status !== "playing" || !seat || seat.is_bot || game.phase !== "play") {
    if (T.card) hide(getRoot);
    T.lastMark = null;
    return;
  }
  // The skeleton was rebuilt under us: put the card back.
  if (T.card && !root.querySelector(":scope > .lo-turnsum > .lo-ts")) show(getRoot, T.card, view);
  // A reaction I can answer wants the screen: get out of the way.
  const w = game.reaction;
  if (T.card && w && view.me && (view.me.playable || []).length && (w.eligible || []).includes(mark) && !(w.passed || []).includes(mark)) hide(getRoot);

  const now = statsOf(seat);
  if (!T.snaps[mark]) { T.snaps[mark] = now; save(); } // prime only: never a card on first sight
  const turnMark = game.turn ? game.turn.mark : null;
  const ended = T.lastMark === mark && turnMark !== mark;
  T.lastMark = turnMark;
  if (!ended) return;
  const before = T.snaps[mark];
  T.snaps[mark] = now;
  save();
  if (seat.out) return; // the results / out banner says it better
  show(getRoot, { before, after: now, ...turnDelta(before, now) }, view);
}
