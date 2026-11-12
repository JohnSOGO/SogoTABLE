// Asset Review: the admin-only screen for judging generated assets (sound
// files, alternate takes, synth fallbacks, pictures). Loaded lazily by app.js
// when the Sogo admin opens it, so none of this is on a family's boot path.
//
// Orchestration only: catalog.js builds the list, render.js draws it,
// waveform.js measures and plays files, and the Worker (workers/asset-reviews.js)
// stores the verdicts. The client gate is cosmetic; every route checks the
// Sogo passcode. Nothing here changes a shipped file: a picked take or a
// regenerate request is carried out later from the export.
import * as sound from "../../sound.js";
import { SOUND_FILES } from "../../sound-files.js";
import { GAME_IDS, GAME_REGISTRY } from "../../games/registry.js";
import { showToast } from "../../controllers/toast.js";
import { buildCatalog, filterEntries, progressOf } from "./catalog.js";
import { TAKES, SOURCES, PICTURE_SOURCE } from "./takes.js";
import { reviewsToJson, reviewsToMarkdown } from "./report.js";
import { renderList, renderShortcuts, renderToolbar } from "./render.js";
import { analyse, drawWaveform, playBuffer } from "./waveform.js";
import { ASSET_REVIEW_CSS } from "./styles.js";

// Every game folder with an assets.js. Add a row when a new game gets one.
const GAME_MODULES = [
  ["battleship", "battleship", () => Promise.all([import("../../games/battleship/assets.js"), import("../../games/battleship/sfx.js")])],
  ["bloomwork", "bloomwork", () => Promise.all([import("../../games/bloomwork/assets.js"), import("../../games/bloomwork/sfx.js")])],
  ["chinese-checkers", "chineseCheckers", () => Promise.all([import("../../games/chinese-checkers/assets.js"), import("../../games/chinese-checkers/sfx.js")])],
  ["hidden-isles", "hiddenIsles", () => Promise.all([import("../../games/hidden-isles/assets.js"), import("../../games/hidden-isles/sfx.js")])],
  ["last-orders", "lastOrders", () => Promise.all([import("../../games/last-orders/assets.js"), import("../../games/last-orders/sfx.js")])],
  ["realmwright", "realmwright", () => Promise.all([import("../../games/realmwright/assets.js"), import("../../games/realmwright/sfx.js")])],
  ["reefkeepers", "reefkeepers", () => Promise.all([import("../../games/reefkeepers/assets.js"), import("../../games/reefkeepers/sfx.js")])],
  ["tracklayers", "tracklayers", () => Promise.all([import("../../games/tracklayers/assets.js"), import("../../games/tracklayers/sfx.js")])],
  ["tradewinds", "tradewinds", () => Promise.all([import("../../games/tradewinds/assets.js"), import("../../games/tradewinds/sfx.js")])],
];

const GLOBAL_PLAY = {
  invite: "playInviteReceived", playerJoined: "playPlayerJoined", roomCreated: "playRoomCreated",
  win: "playWin", lose: "playLose", diceRoll: "playDiceRoll", scorePick: "playScorePick", bank: "playBank",
  farkle: "playFarkle", cardDeal: "playCardDeal", cardPlay: "playCardPlay", trickTake: "playTrickTake",
  heartsBroken: "playHeartsBroken", queenSpades: "playQueenSpades", mysticHorn: "playMysticHorn", moonShot: "playMoonShot",
};
const UI_PLAY = { click: "playClick", confirm: "playConfirm", cancel: "playCancel", invalidMove: "playInvalidMove", turnChanged: "playTurnChanged" };
const MATCH_DB = -20; // RMS target when "Match loudness" is on
const PREFS_KEY = "sogotable.assetReview.prefs";

let shell = { api: async () => ({}), passcode: async () => "", reviewer: () => "" };
let entries = [];
let games = [];
let gameModules = {};
let reviews = {};
let loaded = null;
let filters = { kind: "all", game: "all", status: "all", text: "" };
let selectedKey = "";
let ui = freshUi();
let volume = 0.6;
let matchLoudness = false;
let showShortcuts = false;
let saving = 0;
let saveError = "";
let current = null; // the playing buffer handle
const noteTimers = new Map();

function freshUi(entry) {
  const first = entry && entry.sources[0];
  return { source: first ? first.id : "", a: "", b: "", analysis: null, playing: "", backdrop: "dark", picture: null };
}

function root() {
  return document.querySelector("#assetReview .asset-review-root");
}

function readPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    if (prefs.filters) filters = { ...filters, ...prefs.filters, text: "" };
    if (Number.isFinite(prefs.volume)) volume = prefs.volume;
    matchLoudness = Boolean(prefs.matchLoudness);
  } catch { /* storage blocked: defaults are fine */ }
}

function writePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ filters: { ...filters, text: "" }, volume, matchLoudness }));
  } catch { /* storage blocked */ }
}

async function load() {
  if (!document.getElementById("assetReviewStyles")) {
    const style = document.createElement("style");
    style.id = "assetReviewStyles";
    style.textContent = ASSET_REVIEW_CSS;
    document.head.appendChild(style);
  }
  readPrefs();
  const nameOf = (registryKey, fallback) => (GAME_REGISTRY.find((g) => g.id === GAME_IDS[registryKey]) || {}).name || fallback;
  const modules = await Promise.all(GAME_MODULES.map(async ([id, registryKey, loader]) => {
    const [assets, sfx] = await loader();
    return { id, name: nameOf(registryKey, id), assets: assets.ASSETS, sfx };
  }));
  gameModules = Object.fromEntries(modules.map((m) => [m.id, m]));
  games = [{ id: "global", name: "All games" }, { id: "ui", name: "UI ticks" }, ...modules.map(({ id, name }) => ({ id, name }))];
  entries = buildCatalog({ soundFiles: SOUND_FILES, games: modules, takes: TAKES, sources: SOURCES, pictureSource: PICTURE_SOURCE });
  await refreshReviews();
}

async function refreshReviews() {
  try {
    const passcode = await shell.passcode();
    if (!passcode) throw new Error("The Sogo passcode is needed to load reviews.");
    const data = await shell.api("/api/asset-reviews/list", { passcode });
    reviews = Object.fromEntries((data.reviews || []).map((r) => [r.key, r]));
    saveError = "";
  } catch (error) {
    saveError = error.message || "Could not load reviews.";
  }
}

function visible() {
  return filterEntries(entries, reviews, filters);
}

function entryByKey(key) {
  return entries.find((e) => e.key === key);
}

function render() {
  const host = root();
  if (!host) return;
  const list = visible();
  // Async renders (playback ending, a file measured) must not steal the caret
  // from the note or search box, or the next keystrokes become shortcuts.
  const active = document.activeElement;
  const refocus = active && host.contains(active) && (active.matches("[data-ar-note]") ? "[data-ar-note]" : active.matches('[data-ar-filter="text"]') ? '[data-ar-filter="text"]' : "");
  const caret = refocus ? [active.selectionStart, active.selectionEnd] : null;
  host.innerHTML = `${renderToolbar({ progress: progressOf(entries, reviews), filters, games, volume, matchLoudness, soundOn: sound.isSoundEnabled(), saving: saving > 0, error: saveError })}
    ${showShortcuts ? renderShortcuts() : ""}
    <div class="ar-list">${renderList(list, reviews, selectedKey, ui)}</div>`;
  const again = refocus && host.querySelector(refocus);
  if (again) { again.focus(); again.setSelectionRange(caret[0], caret[1]); }
  paintSelected();
}

// Repaint only the toolbar's save state, so typing a note never re-renders.
function renderSaveState() {
  const el = root() && root().querySelector(".ar-save-state");
  if (el) el.innerHTML = saveError ? `<span class="ar-error">${saveError.replace(/</g, "&lt;")}</span>` : saving ? "Saving…" : "All saved";
}

function paintSelected() {
  const host = root();
  const entry = entryByKey(selectedKey);
  if (!host || !entry) return;
  const canvas = host.querySelector("[data-ar-wave]");
  if (canvas && ui.analysis && !ui.analysis.error) drawWaveform(canvas, ui.analysis, current && ui.playing === ui.source ? current.progress() : 0);
  const pic = host.querySelector("[data-ar-picture]");
  if (pic && !ui.picture) {
    const done = () => {
      ui.picture = { width: pic.naturalWidth, height: pic.naturalHeight, bytes: 0 };
      fetch(entry.url).then((r) => r.blob()).then((b) => { ui.picture.bytes = b.size; if (selectedKey === entry.key) render(); }).catch(() => {});
    };
    if (pic.complete && pic.naturalWidth) done(); else pic.addEventListener("load", done, { once: true });
  }
}

function measureSelected() {
  const entry = entryByKey(selectedKey);
  const src = entry && entry.sources.find((s) => s.id === ui.source);
  if (!src || src.synth || entry.kind !== "sound") return;
  const want = src.id;
  analyse(src.url).then((analysis) => {
    if (selectedKey === entry.key && ui.source === want) { ui.analysis = analysis; render(); }
  }, (error) => {
    if (selectedKey === entry.key && ui.source === want) { ui.analysis = { error: error.message || "Could not decode this file." }; render(); }
  });
}

function select(key, { scroll = false } = {}) {
  stopPlayback();
  selectedKey = selectedKey === key && !scroll ? "" : key;
  ui = freshUi(entryByKey(selectedKey));
  render();
  measureSelected();
  if (scroll && selectedKey) {
    const row = root().querySelector(`[data-ar-key="${CSS.escape(selectedKey)}"]`);
    if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function move(step) {
  const list = visible();
  if (!list.length) return;
  const at = list.findIndex((e) => e.key === selectedKey);
  const next = list[Math.max(0, Math.min(list.length - 1, at < 0 ? 0 : at + step))];
  select(next.key, { scroll: true });
}

function nextUnreviewed() {
  const list = visible();
  const at = list.findIndex((e) => e.key === selectedKey);
  const ordered = [...list.slice(at + 1), ...list.slice(0, at + 1)];
  const next = ordered.find((e) => !reviews[e.key] || reviews[e.key].status === "pending");
  if (next) select(next.key, { scroll: true });
  else showToast("Everything here has a verdict.");
}

// --- playback -------------------------------------------------------------

function stopPlayback() {
  if (current) current.stop();
  current = null;
  ui.playing = "";
}

// Run fn with one file override removed, so the real cue code plays its synth.
function withoutFile(map, key, fn) {
  const saved = map[key];
  map[key] = null;
  try { fn(); } finally { map[key] = saved; }
}

function playInGame(entry, { synth = false } = {}) {
  sound.unlockAudio();
  if (!sound.isSoundEnabled()) { showToast("Game sound is off on this device."); return; }
  const p = entry.play;
  if (p.scope === "ui") { sound[UI_PLAY[p.cue]](); return; }
  if (p.scope === "global") {
    const run = () => sound[GLOBAL_PLAY[p.cue]]();
    if (synth) withoutFile(SOUND_FILES, p.cue, run); else run();
    return;
  }
  const mod = gameModules[p.game];
  if (!mod) return;
  const run = () => mod.sfx.playCue(p.cue);
  if (synth) withoutFile(mod.assets.sounds, p.cue, run); else run();
}

async function playSource(entry, sourceId) {
  const src = entry.sources.find((s) => s.id === sourceId);
  if (!src) return;
  stopPlayback();
  ui.source = sourceId;
  if (src.synth) {
    ui.analysis = null;
    render();
    playInGame(entry, { synth: true });
    return;
  }
  try {
    const analysis = await analyse(src.url);
    ui.analysis = analysis;
    ui.playing = sourceId;
    const handle = playBuffer(analysis, {
      gain: volume,
      matchDb: matchLoudness ? MATCH_DB : null,
      onEnd: () => { if (current === handle) { current = null; ui.playing = ""; render(); } },
    });
    current = handle;
    render();
    const tick = () => {
      if (current !== handle) return;
      paintSelected();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return new Promise((resolve) => setTimeout(resolve, analysis.duration * 1000 + 350));
  } catch (error) {
    ui.analysis = { error: error.message || "Could not play this file." };
    render();
  }
}

async function playAB(entry) {
  if (!ui.a || !ui.b) return;
  await playSource(entry, ui.a);
  await playSource(entry, ui.b);
}

// --- saving ---------------------------------------------------------------

async function save(entry, patch) {
  const before = reviews[entry.key] || { status: "pending", note: "", chosen_take: "", regenerate: false };
  const next = { ...before, ...patch, key: entry.key, updated_at: Date.now(), reviewer: shell.reviewer() };
  reviews[entry.key] = next;
  saving += 1;
  renderSaveState();
  try {
    const passcode = await shell.passcode();
    if (!passcode) throw new Error("Sogo passcode needed to save.");
    const data = await shell.api("/api/asset-reviews/upsert", {
      passcode,
      key: entry.key, kind: entry.kind, game: entry.game, label: entry.label, path: entry.path, source: entry.source,
      status: next.status, note: next.note, chosen_take: next.chosen_take, regenerate: next.regenerate, reviewer: next.reviewer,
    });
    if (data.review) reviews[entry.key] = { ...data.review, note: reviews[entry.key].note };
    saveError = "";
  } catch (error) {
    saveError = `Not saved: ${error.message || "network error"}`;
  } finally {
    saving -= 1;
    renderSaveState();
  }
}

function setStatus(entry, status) {
  save(entry, { status });
  render();
  if (status !== "pending" && filters.status === "unreviewed") setTimeout(nextUnreviewed, 150);
}

function setNote(entry, note) {
  reviews[entry.key] = { ...(reviews[entry.key] || { status: "pending", chosen_take: "", regenerate: false }), key: entry.key, note };
  clearTimeout(noteTimers.get(entry.key));
  noteTimers.set(entry.key, setTimeout(() => save(entry, { note }), 700));
}

// --- export ---------------------------------------------------------------

function download(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportReviews(kind) {
  const records = Object.values(reviews);
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === "json") return download(`asset-review-${stamp}.json`, "application/json", reviewsToJson(records));
  const md = reviewsToMarkdown(records);
  if (kind === "copy") {
    navigator.clipboard.writeText(md).then(() => showToast("Review copied as Markdown."), () => showToast("Copy failed. Use the Markdown download."));
    return;
  }
  download(`asset-review-${stamp}.md`, "text/markdown", md);
}

// --- events ---------------------------------------------------------------

function onClick(event) {
  sound.unlockAudio();
  const t = event.target.closest("button, a, input");
  if (!t) return;
  const entry = entryByKey(selectedKey);
  if (t.dataset.arSelect) return select(t.dataset.arSelect);
  if (t.dataset.arKind) { filters.kind = t.dataset.arKind; writePrefs(); return render(); }
  if (t.dataset.arSource && entry) return playSource(entry, t.dataset.arSource).then(measureSelected);
  if (t.dataset.arStatus && entry) return setStatus(entry, t.dataset.arStatus);
  if (t.dataset.arBackdrop) { ui.backdrop = t.dataset.arBackdrop; return render(); }
  const action = t.dataset.arAction;
  if (!action) return;
  if (action === "next-unreviewed") return nextUnreviewed();
  if (action === "export-md") return exportReviews("md");
  if (action === "export-json") return exportReviews("json");
  if (action === "copy-md") return exportReviews("copy");
  if (action === "shortcuts") { showShortcuts = !showShortcuts; return render(); }
  if (action === "sound-on") { sound.setSoundEnabled(true); sound.unlockAudio(); return render(); }
  if (!entry) return;
  if (action === "play") return playSource(entry, ui.source);
  if (action === "in-game") return playInGame(entry);
  if (action === "set-a") { ui.a = ui.source; return render(); }
  if (action === "set-b") { ui.b = ui.source; return render(); }
  if (action === "ab") return playAB(entry);
  if (action === "pick") { save(entry, { chosen_take: ui.source }); return render(); }
}

function onInput(event) {
  const t = event.target;
  const entry = entryByKey(selectedKey);
  if (t.matches("[data-ar-note]") && entry) return setNote(entry, t.value);
  if (t.matches("[data-ar-volume]")) { volume = Number(t.value) / 100; writePrefs(); return; }
  if (t.dataset.arFilter === "text") {
    filters.text = t.value;
    render();
  }
}

function onChange(event) {
  const t = event.target;
  const entry = entryByKey(selectedKey);
  if (t.dataset.arFilter === "game" || t.dataset.arFilter === "status") { filters[t.dataset.arFilter] = t.value; writePrefs(); return render(); }
  if (t.matches("[data-ar-match]")) { matchLoudness = t.checked; writePrefs(); return; }
  if (t.matches("[data-ar-regen]") && entry) { save(entry, { regenerate: t.checked }); return render(); }
  if (t.matches("[data-ar-note]") && entry) { clearTimeout(noteTimers.get(entry.key)); save(entry, { note: t.value }); }
}

function onKey(event) {
  const section = document.getElementById("assetReview");
  if (!section || !section.classList.contains("active") || event.metaKey || event.ctrlKey || event.altKey) return;
  const typing = event.target.matches && event.target.matches("textarea, input[type=search], select");
  if (typing) {
    if (event.key === "Escape") event.target.blur();
    return;
  }
  const entry = entryByKey(selectedKey);
  const key = event.key;
  const handled = () => event.preventDefault();
  if (key === "j" || key === "ArrowDown") { handled(); return move(1); }
  if (key === "k" || key === "ArrowUp") { handled(); return move(-1); }
  if (key === ".") { handled(); return nextUnreviewed(); }
  if (key === "?") { handled(); showShortcuts = !showShortcuts; return render(); }
  if (!entry) return;
  sound.unlockAudio();
  if (key === " ") { handled(); return entry.kind === "sound" ? playSource(entry, ui.source) : undefined; }
  if (/^[1-9]$/.test(key) && entry.kind === "sound") {
    const src = entry.sources[Number(key) - 1];
    if (src) { handled(); playSource(entry, src.id).then(measureSelected); }
    return;
  }
  if (key === "g" && entry.kind === "sound") return playInGame(entry);
  if (key === "a") { ui.a = ui.source; return render(); }
  if (key === "b") { ui.b = ui.source; return render(); }
  if (key === "x") return playAB(entry);
  if (key === "p") { save(entry, { chosen_take: ui.source }); return render(); }
  if (key === "y") return setStatus(entry, "approved");
  if (key === "n") return setStatus(entry, "rejected");
  if (key === "u") return setStatus(entry, "pending");
  if (key === "r") { save(entry, { regenerate: !(reviews[entry.key] && reviews[entry.key].regenerate) }); return render(); }
  if (key === "e" || key === "/") {
    const note = root().querySelector("[data-ar-note]");
    if (note) { handled(); note.focus(); }
  }
}

let wired = false;

// shellCtx: { api(url, payload), passcode(): Promise<string>, reviewer(): string }
export function wireAssetReview(shellCtx) {
  shell = { ...shell, ...(shellCtx || {}) };
  if (wired) return;
  wired = true;
  const section = document.getElementById("assetReview");
  const host = root();
  if (!section || !host) return;
  host.addEventListener("click", onClick);
  host.addEventListener("input", onInput);
  host.addEventListener("change", onChange);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", () => paintSelected());
}

// Called each time the screen opens: load once, refresh verdicts after.
export async function openAssetReview() {
  const host = root();
  if (!host) return;
  if (!loaded) {
    host.innerHTML = `<p class="ar-muted ar-empty">Loading every asset…</p>`;
    loaded = load().catch((error) => {
      loaded = null;
      host.innerHTML = `<p class="ar-error ar-empty">${String(error.message || error).replace(/</g, "&lt;")}</p>`;
      throw error;
    });
    await loaded;
  } else {
    await loaded;
    await refreshReviews();
  }
  render();
  measureSelected();
}
