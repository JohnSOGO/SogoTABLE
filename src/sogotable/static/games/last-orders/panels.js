// Last Orders — HTML builders for the table: opponent seats, the bar top
// (reaction stack, countdown ring, gamble pot, tonight's event, last drink),
// my seat, the pick grid, the results list and the event ticker.
//
// Pure string builders over the view model render.js prepares; they show what
// the server projected and never decide legality. Output is deterministic for
// a given snapshot + view state (no clocks), so render.js can skip repainting
// a section whose markup is unchanged and running animations survive.
import { buzzIconSvg, cardArtSvg, coinSvg, drinkBackSvg, drinkSvg, gritIconSvg, mugIconSvg, portraitSvg } from "./art.js";
import { BARKEEP, KINDS, OUT_ICONS, PHASES, PRIMER, STATS, TICKER, UI, outText } from "./branding.js";
import { CARDS, CHARACTERS, DRINKS, EVENTS, PACKS } from "./content.js";
import { describe, describeLines, kindLabel, traitLines } from "./describe.js";

// ---------- art cache ----------
// art.js mints unique gradient ids per call; caching per (thing, theme,
// occurrence-in-this-paint) keeps markup stable between paints while two
// copies of one card on screen still get distinct ids.
const ART = new Map();
const OCC = new Map();
export function artBegin() { OCC.clear(); if (ART.size > 4000) ART.clear(); }
function art(kind, id, theme, build) {
  const base = `${kind}|${id}|${theme}`;
  const n = OCC.get(base) || 0;
  OCC.set(base, n + 1);
  const k = `${base}|${n}`;
  if (!ART.has(k)) ART.set(k, build());
  return ART.get(k);
}
export const portrait = (vm, id, size) => art(`p${size}`, id || "none", vm.theme, () => portraitSvg(id, { size, theme: vm.theme, label: (CHARACTERS[id] || {}).name }));
const cardArt = (vm, def) => art("c", def.id, vm.theme, () => (def.type === "drink" ? drinkSvg(def, DRINKS[def.id] || {}, { theme: vm.theme }) : cardArtSvg(def, CARDS[def.id] || {}, { theme: vm.theme })));
const icon = (vm, name) => art(`i-${name}`, "", vm.theme, () => ({ grit: gritIconSvg, buzz: buzzIconSvg, gold: coinSvg, mug: mugIconSvg }[name])({ size: 16, theme: vm.theme }));
const drinkBack = (vm) => art("db", "", vm.theme, () => drinkBackSvg({ theme: vm.theme }));

// ---------- content lookups ----------
export function entryOf(id) {
  return CARDS[id] || DRINKS[id] || EVENTS[id] || CHARACTERS[id] || null;
}
export function thingName(id) {
  const e = entryOf(id);
  if (e && e.name) return e.name;
  const tail = String(id || "").split(":").pop() || "?";
  return tail.replace(/-/g, " ");
}
export const patronName = (id) => (CHARACTERS[id] ? CHARACTERS[id].name : thingName(id));

// ---------- small pieces ----------
function meter(p) {
  const max = Math.max(1, Number(p.max_grit) || 20, Number(p.grit) || 0, Number(p.buzz) || 0);
  const g = Math.max(0, Math.min(100, ((Number(p.grit) || 0) / max) * 100));
  const b = Math.max(0, Math.min(100, ((Number(p.buzz) || 0) / max) * 100));
  const danger = (Number(p.grit) || 0) - (Number(p.buzz) || 0) <= 3 && !p.out;
  return `<div class="lo-meter${danger ? " lo-danger" : ""}" role="img" aria-label="${STATS.buzz.name} ${p.buzz} / ${STATS.grit.name} ${p.grit}">
      <i class="lo-meter-grit" style="width:${g.toFixed(1)}%"></i><i class="lo-meter-buzz" style="width:${b.toFixed(1)}%"></i>
    </div>`;
}

function stats(vm, p) {
  const chip = (stat, value) => `<span class="lo-stat lo-stat-${stat}" data-lo-stat="${vm.esc(p.mark)}:${stat}" title="${vm.esc(STATS[stat].name)}">${icon(vm, stat)}<b>${Number(value) || 0}</b></span>`;
  return `<div class="lo-stats">${chip("grit", p.grit)}${chip("buzz", p.buzz)}${chip("gold", p.gold)}</div>`;
}

function mugs(vm, n) {
  const k = Math.max(0, Math.min(5, Number(n) || 0));
  if (!k) return "";
  return `<span class="lo-mugs" title="${vm.esc(UI.lineCount(n))}">${Array.from({ length: k }, () => `<span class="lo-mug">${drinkBack(vm)}</span>`).join("")}${n > 5 ? `<em>+${n - 5}</em>` : ""}</span>`;
}

function outBadge(vm, p) {
  return p.out ? `<span class="lo-out-badge">${OUT_ICONS[p.out] || ""} ${vm.esc(outText(p.out))}</span>` : "";
}

// ---------- opponent strip ----------
export function oppsHtml(vm) {
  const opps = vm.players.filter((p) => p.mark !== vm.myMark);
  if (!opps.length) return "";
  return opps.map((p) => seatHtml(vm, p)).join("");
}

function seatHtml(vm, p) {
  const turn = vm.turnMark === p.mark && !p.out;
  const targetable = vm.targetables.includes(p.mark);
  const chosen = vm.chosenTarget === p.mark;
  const cls = ["lo-seat", turn ? "lo-turn" : "", p.out ? "lo-is-out" : "", targetable ? "lo-targetable" : "", chosen ? "lo-chosen" : ""].filter(Boolean).join(" ");
  const tags = [p.is_bot ? UI.bot : "", p.auto ? UI.auto : ""].filter(Boolean).map((t) => `<em>${vm.esc(t)}</em>`).join("");
  const attrs = targetable ? ` data-lo-act="target" data-v="${vm.esc(p.mark)}" role="button" tabindex="0"` : "";
  return `<div class="${cls}" data-lo-seat="${vm.esc(p.mark)}"${attrs} style="--lo-seat:${vm.esc(vm.colorOf(p.mark))}">
      <div class="lo-seat-face">${portrait(vm, p.character, 44)}</div>
      <div class="lo-seat-body">
        <div class="lo-seat-name"><span>${vm.esc(vm.nameOf(p.mark))}</span>${tags}</div>
        ${meter(p)}
        ${stats(vm, p)}
        <div class="lo-seat-misc"><span class="lo-handcount" title="${vm.esc(UI.handCount(p.hand_count))}">🂠 ${Number(p.hand_count) || 0}</span>${mugs(vm, p.line_count)}${outBadge(vm, p)}</div>
      </div>
    </div>`;
}

// ---------- my seat ----------
export function mineHtml(vm) {
  const p = vm.mySeat;
  if (!p) return `<div class="lo-myseat lo-myseat-empty">${vm.esc(UI.spectating)}</div>`;
  const turn = vm.turnMark === p.mark && !p.out;
  const ch = CHARACTERS[p.character] || {};
  return `<div class="lo-myseat${turn ? " lo-turn" : ""}${p.out ? " lo-is-out" : ""}" data-lo-seat="${vm.esc(p.mark)}" style="--lo-seat:${vm.esc(vm.colorOf(p.mark))}">
      <div class="lo-seat-face">${portrait(vm, p.character, 56)}</div>
      <div class="lo-seat-body">
        <div class="lo-seat-name"><span>${vm.esc(vm.nameOf(p.mark))}</span><em>${vm.esc(ch.name || "")}</em></div>
        ${meter(p)}
        <div class="lo-mine-row">${stats(vm, p)}${mugs(vm, p.line_count)}${outBadge(vm, p)}</div>
      </div>
    </div>`;
}

// ---------- stack cards ----------
function faceHtml(vm, def, opts = {}) {
  const entry = entryOf(def.id) || {};
  const kind = def.type === "drink" ? "drink" : def.kind;
  return `<span class="lo-face lo-k-${kind}">
      <span class="lo-face-art">${cardArt(vm, def)}</span>
      <span class="lo-face-kind">${vm.esc(kindLabel(def))}</span>
      <b class="lo-face-name">${vm.esc(entry.name || thingName(def.id))}</b>
      ${opts.text ? `<span class="lo-face-text">${vm.esc(describe(def, entry))}</span>` : ""}
    </span>`;
}

function whoLabel(vm, mark) {
  return mark ? vm.nameOf(mark) : BARKEEP;
}

function stackItemHtml(vm, it, i, n, negated) {
  const def = vm.defs[it.card] || { id: it.card, type: it.kind === "drink" ? "drink" : "card", kind: it.kind };
  const top = i === n - 1;
  const canceled = it.canceled || negated.has(it.uid);
  const by = it.kind === "drink" ? (it.by ? UI.boughtBy(vm.nameOf(it.by)) : UI.barkeepPour) : whoLabel(vm, it.by);
  const to = it.target ? vm.nameOf(it.target) : "";
  const label = it.kind === "drink"
    ? `${vm.esc(to)} <small>${vm.esc(by)}</small>`
    : `${vm.esc(by)}${to ? ` ${UI.arrow} ${vm.esc(to)}` : ""}`;
  const spikes = (it.spikes || []).map((s) => `<span class="lo-spike-chip">🧪 ${vm.esc(thingName(s))}</span>`).join("");
  return `<div class="lo-stack-card${top ? " lo-stack-top" : ""}${canceled ? " lo-canceled" : ""}" data-lo-item="${vm.esc(it.uid)}" style="--i:${i};--n:${n}">
      ${faceHtml(vm, def, { text: top && vm.prefs.tips })}
      <span class="lo-stack-who">${label}</span>
      ${spikes ? `<span class="lo-spikes">${spikes}</span>` : ""}
      ${it.soften ? `<span class="lo-soften">${vm.esc(UI.softened(it.soften))}</span>` : ""}
      ${canceled ? `<span class="lo-x" aria-label="${vm.esc(UI.canceled)}"></span>` : ""}
    </div>`;
}

function ringHtml(vm) {
  const w = vm.reaction;
  if (!w) return "";
  const total = Math.max(1, Number(vm.game.options && vm.game.options.react_seconds) || 8) * 1000;
  return `<div class="lo-ring-wrap" aria-hidden="true">
      <svg class="lo-ring" viewBox="0 0 40 40"><circle class="lo-ring-bg" cx="20" cy="20" r="17"/><circle class="lo-ring-fg" cx="20" cy="20" r="17" pathLength="100" data-lo-ring="${Number(w.closes_at) || 0}" data-total="${total}"/></svg>
      <span class="lo-ring-num" data-lo-count="${Number(w.closes_at) || 0}"></span>
    </div>`;
}

function potHtml(vm) {
  const g = vm.gamble;
  if (!g) return "";
  const n = Math.max(1, Math.min(8, Number(g.pot) || 0));
  const pile = Array.from({ length: n }, (_, i) => `<span class="lo-pot-coin" style="left:${4 + (i % 3) * 9}px;bottom:${i * 3}px">${icon(vm, "gold")}</span>`).join("");
  const leader = vm.players.find((p) => p.mark === g.leader);
  return `<div class="lo-pot" data-lo-pot>
      <div class="lo-pot-pile">${pile}</div>
      <div class="lo-pot-text"><b>${vm.esc(UI.potLabel)} ${Number(g.pot) || 0}</b>
        <span>${leader ? `${portrait(vm, leader.character, 22)} ` : ""}${vm.esc(UI.leads(vm.nameOf(g.leader)))}</span></div>
    </div>`;
}

function eventHtml(vm) {
  const id = vm.game.event;
  if (!id) return "";
  const def = vm.defs[id] || { id, type: "event" };
  const e = EVENTS[id] || {};
  return `<div class="lo-event"><span class="lo-event-tag">${vm.esc(UI.eventNow)}</span><b>${vm.esc(e.name || thingName(id))}</b><span>${vm.esc(describe(def, e))}</span></div>`;
}

function lastDrinkHtml(vm) {
  const d = vm.game.last_drink;
  if (!d || !d.drink) return "";
  const def = vm.defs[d.drink] || { id: d.drink, type: "drink" };
  const e = DRINKS[d.drink] || {};
  const spikes = (d.spikes || []).length ? ` · ${UI.spiked}` : "";
  return `<div class="lo-lastdrink${d.canceled ? " lo-canceled" : ""}">
      <span class="lo-lastdrink-art">${cardArt(vm, def)}</span>
      <span class="lo-lastdrink-text"><small>${vm.esc(UI.lastDrink)}</small><b>${vm.esc(e.name || thingName(d.drink))}</b>
      <span>${vm.esc(UI.drankBy(vm.nameOf(d.target)))}${d.canceled ? ` — ${vm.esc(UI.refused)}` : ""}${vm.esc(spikes)}</span></span>
    </div>`;
}

export function barHtml(vm) {
  const w = vm.reaction;
  const ghost = !w && vm.ghost ? vm.ghost : null;
  const stack = w ? w.stack : ghost ? ghost.stack : [];
  const negated = ghost ? ghost.negated : new Set();
  let center;
  if (stack.length) {
    center = `<div class="lo-stack${ghost ? " lo-resolving" : ""}" style="--n:${stack.length}">${stack.map((it, i) => stackItemHtml(vm, it, i, stack.length, negated)).join("")}</div>`;
  } else if (w && w.kind === "gamble") {
    center = `<div class="lo-stack-empty lo-gamble-call">🎲 ${vm.esc(UI.gamblePrompt(vm.nameOf(vm.gamble ? vm.gamble.leader : ""), vm.gamble ? vm.gamble.pot : 0))}</div>`;
  } else {
    center = `<div class="lo-stack-empty">${vm.esc(UI.quiet)}</div>`;
  }
  const chips = [
    vm.game.round ? `<span class="lo-chip">${vm.esc(UI.round(vm.game.round))}</span>` : "",
    vm.game.escalation ? `<span class="lo-chip lo-chip-hot" title="${vm.esc(UI.closingHint)}">⏰ ${vm.esc(UI.closing(vm.game.escalation))}</span>` : "",
    `<span class="lo-chip lo-chip-deck">${drinkBack(vm)} ${Number(vm.game.drink_deck_count) || 0}</span>`,
  ].join("");
  return `<div class="lo-bar-head">${chips}${ringHtml(vm)}</div>
    <div class="lo-bar-main">${center}</div>
    <div class="lo-bar-side">${potHtml(vm)}${eventHtml(vm)}${lastDrinkHtml(vm)}</div>`;
}

// ---------- pick ----------
export function pickHtml(vm) {
  const takenBy = new Map();
  vm.players.forEach((p) => { if (p.character) takenBy.set(p.character, p.mark); });
  const mine = vm.mySeat && vm.mySeat.character;
  const list = Array.isArray(vm.game.characters) ? vm.game.characters : [];
  const cards = list.map((c) => {
    const e = CHARACTERS[c.id] || {};
    const who = takenBy.get(c.id);
    const isMine = who && who === vm.myMark;
    const disabled = Boolean(who) || Boolean(mine) || vm.sending || !vm.mySeat;
    const trait = e.traitText || traitLines(c.trait).join(" ");
    const pack = PACKS[c.pack] ? PACKS[c.pack].name : c.pack;
    return `<button type="button" class="lo-patron${who ? " lo-taken" : ""}${isMine ? " lo-mine-pick" : ""}" data-lo-act="pick" data-v="${vm.esc(c.id)}" ${disabled ? "disabled" : ""}>
        <span class="lo-patron-face">${portrait(vm, c.id, 72)}</span>
        <span class="lo-patron-body">
          <b>${vm.esc(e.name || thingName(c.id))}</b>
          <small>${vm.esc(e.title || "")}</small>
          <span class="lo-patron-blurb">${vm.esc(e.blurb || "")}</span>
          <span class="lo-patron-trait">✦ ${vm.esc(trait)}</span>
          <span class="lo-patron-foot"><span class="lo-pack-badge">${vm.esc(pack || "")}</span>${c.deck_size ? `<span>${vm.esc(UI.deckSize(c.deck_size))}</span>` : ""}</span>
          ${who ? `<span class="lo-taken-by">${vm.esc(isMine ? UI.pickYours : UI.pickTaken(vm.nameOf(who)))}</span>` : ""}
        </span>
      </button>`;
  }).join("");
  const chips = vm.players.map((p) => {
    const skip = vm.skip && vm.skip.target === p.mark ? skipButton(vm) : "";
    return `<span class="lo-wait-chip${p.picked ? " lo-done" : ""}"><span class="lo-dot" style="background:${vm.esc(vm.colorOf(p.mark))}"></span>${vm.esc(vm.nameOf(p.mark))} · ${vm.esc(p.picked ? UI.pickDone : UI.pickWaiting)}${skip}</span>`;
  }).join("");
  const status = mine ? UI.pickedWait : vm.sending ? UI.pickSending : UI.pickHint;
  return `<div class="lo-pick-head"><h3>${vm.esc(UI.pickTitle)}</h3><p>${vm.esc(status)}</p></div>
    <div class="lo-wait-chips">${chips}</div>
    <div class="lo-patrons">${cards}</div>`;
}

export function skipButton(vm) {
  const s = vm.skip;
  if (!s) return "";
  return `<button type="button" class="lo-skip${s.mine ? " lo-on" : ""}" data-lo-act="skip" data-v="${vm.esc(s.target)}" ${vm.sending ? "disabled" : ""}>⏭ ${vm.esc(UI.skipBtn)} <small>${vm.esc(UI.skipVotes(s.votes, s.needed))}</small></button>`;
}

// ---------- results ----------
export function resultsHtml(vm) {
  const rows = (Array.isArray(vm.game.results) ? vm.game.results : []).map((r) => {
    const win = r.place === 1;
    const why = win ? UI.winner : outText(r.out);
    return `<li class="lo-result${win ? " lo-win" : ""}${r.mark === vm.myMark ? " lo-me" : ""}" data-lo-seat="${vm.esc(r.mark)}">
        <span class="lo-place">${vm.esc(UI.place(r.place))}</span>
        <span class="lo-result-face">${portrait(vm, r.character, 40)}</span>
        <span class="lo-result-name"><b>${vm.esc(vm.nameOf(r.mark))}</b><small>${vm.esc(patronName(r.character))}</small></span>
        <span class="lo-result-why">${win ? "🏆" : OUT_ICONS[r.out] || ""} ${vm.esc(why)}</span>
      </li>`;
  }).join("");
  return `<h3 class="lo-results-title">🍻 ${vm.esc(UI.resultsTitle)}</h3><ol class="lo-results-list">${rows}</ol>`;
}

// ---------- primer ----------
export function primerHtml(vm) {
  if (!vm.prefs.primer) return "";
  const open = vm.primerOpen;
  return `<button type="button" class="lo-primer-toggle" data-lo-act="primer" aria-expanded="${open}">📜 ${vm.esc(PRIMER.title)} <span>${open ? "▴" : "▾"}</span></button>
    ${open ? `<ul class="lo-primer-list">${PRIMER.lines.map((l) => `<li>${vm.esc(l)}</li>`).join("")}</ul>` : ""}`;
}

// ---------- ticker ----------
function eventLine(vm, e) {
  const n = (m) => (m ? vm.nameOf(m) : BARKEEP);
  switch (e.type) {
    case "turn": return TICKER.turn(n(e.mark));
    case "round": return TICKER.round(e.round, e.escalation);
    case "pick": return TICKER.pick(n(e.mark), patronName(e.character));
    case "discard": return TICKER.discard(n(e.mark), Number(e.n) || 0);
    case "play": return e.kind === "drink" ? TICKER.drinkUp(n(e.target), thingName(e.card)) : TICKER.play(n(e.mark), thingName(e.card), e.target ? n(e.target) : "");
    case "react": return TICKER.react(n(e.mark), thingName(e.card));
    case "negated": return TICKER.negated(thingName(e.card));
    case "redirect": return TICKER.redirect(thingName(e.card), n(e.to));
    case "grit": return TICKER.grit(n(e.mark), Number(e.n) || 0);
    case "buzz": return TICKER.buzz(n(e.mark), Number(e.n) || 0);
    case "gold": return TICKER.gold(n(e.mark), Number(e.n) || 0);
    case "draw": return e.source ? TICKER.draw(n(e.mark), Number(e.n) || 0) : "";
    case "order": return TICKER.order(n(e.by), n(e.mark), e.spiked);
    case "drink": return TICKER.drink(n(e.mark), thingName(e.drink), e.house);
    case "gamble_start": return TICKER.gambleStart(n(e.mark), e.pot);
    case "gamble_lead": return TICKER.gambleLead(n(e.mark), e.pot);
    case "gamble_win": return TICKER.gambleWin(n(e.mark), e.pot);
    case "out": return TICKER.out(n(e.mark), outText(e.why));
    case "event_flip": return TICKER.eventFlip(thingName(e.event));
    case "win": return e.mark ? TICKER.win(n(e.mark)) : "";
    case "skip": return TICKER.skip(n(e.mark));
    default: return "";
  }
}

export function tickerHtml(vm) {
  const events = Array.isArray(vm.game.events) ? [...vm.game.events].sort((a, b) => a.seq - b.seq) : [];
  const lines = [];
  for (let i = events.length - 1; i >= 0 && lines.length < 6; i -= 1) {
    const text = eventLine(vm, events[i]);
    if (text) lines.push({ seq: events[i].seq, text, type: events[i].type });
  }
  if (!lines.length) return "";
  return `<ol class="lo-log">${lines.reverse().map((l) => `<li class="lo-log-${vm.esc(l.type)}" data-seq="${l.seq}">${vm.esc(l.text)}</li>`).join("")}</ol>`;
}

// ---------- hand card (used by hand.js) ----------
export function handCardHtml(vm, card, state) {
  const def = vm.defs[card.id] || { id: card.id, type: "card", kind: "action" };
  const entry = CARDS[card.id] || {};
  const lines = describeLines(def, entry);
  const cls = ["lo-card", `lo-k-${def.kind || "action"}`, state.glow ? "lo-playable" : "", state.sel ? "lo-sel" : "", state.discard ? "lo-discard" : "", state.spike ? "lo-spiking" : "", state.dim ? "lo-dim" : ""].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" data-lo-act="card" data-v="${vm.esc(card.uid)}" aria-pressed="${Boolean(state.sel || state.discard || state.spike)}" ${vm.sending ? "disabled" : ""}>
      <span class="lo-card-art">${cardArt(vm, def)}</span>
      <span class="lo-card-kind">${vm.esc(KINDS[def.kind] || "")}</span>
      <b class="lo-card-name">${vm.esc(entry.name || thingName(card.id))}</b>
      ${vm.prefs.tips ? `<span class="lo-card-text">${vm.esc(lines.join(" "))}</span>` : ""}
      ${state.discard ? `<span class="lo-card-mark">✕</span>` : state.spike ? `<span class="lo-card-mark">🧪</span>` : ""}
    </button>`;
}

export const phaseName = (phase) => PHASES[phase] || "";
