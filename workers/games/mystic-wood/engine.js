// The Mystic Wood — pure game mechanics (no DOM, no I/O, no timers).
// Board generation, movement/adjacency, the denizen deck, derived stats, and the
// synchronous resolution of encounters, spells, and powers. All randomness flows
// through one swappable module seam so tests can inject a deterministic RNG.
// The turn machine + platform contract live in rules.js; the bot in ai.js.
import {
  KNIGHTS, THINGS, DEN, DEN_TALES, DEN_INTRO, DECK_IDS, COMP_P, ROWS, COLS, POWER_LIMIT,
  NAMED_TILES,
} from "./data.js";

/* ------------------------------- RNG seam ------------------------------- */
let mysticWoodRandom = Math.random;
export function setMysticWoodRandom(fn) { mysticWoodRandom = typeof fn === "function" ? fn : Math.random; }
export function rng() { return mysticWoodRandom(); }
const rnd = (n) => Math.floor(rng() * n);
const d6 = () => rnd(6) + 1;
export function rollDie() { return d6(); }
export function pickIndex(n) { return rnd(n); }
export function shuffle(a) { for (let i = a.length - 1; i > 0; i -= 1) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ------------------------------- logging -------------------------------- */
// Retained history. Deep enough to audit a long game (the chronicle IS the audit log, and the
// bug-report snapshot draws from it), still bounded so room state / the projection stay a
// reasonable size on a phone. See docs/observability-and-debug.md (Slice 1).
const LOG_CAP = 300;
export function logEvent(game, text, cls = "") {
  if (!game.log) game.log = [];
  // `t` = turn counter at write time — a debug anchor (not shown to players) so a snapshot's chronicle reads turn-by-turn.
  game.log.push({ text, cls, t: game.turn_seq || 0 });
  game.log_n = (game.log_n || 0) + 1;
  if (game.log.length > LOG_CAP) game.log.splice(0, game.log.length - LOG_CAP);
}
// An encounter narrates itself by reading back the lines its own resolution logged. An INDEX into
// game.log cannot do that: once the log reaches LOG_CAP the trim drops the front, so the index a
// resolution captured before it ran still points at the end afterwards and the read comes back
// empty — the result modal then falls through to "the Merlin reacts." mid-game, and only mid-game.
// `log_n` counts every event ever logged and never shrinks, so the read stays anchored.
function logMark(game) { return game.log_n || 0; }
function logSince(game, mark) {
  const n = (game.log_n || 0) - mark;
  return n > 0 ? game.log.slice(-n).map((e) => e.text).join("<br>") : "";
}

/* ------------------------------- board ---------------------------------- */
const DIR_DELTA = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
const DIR_WORD = { N: "north", S: "south", E: "east", W: "west" };
export function cellAt(board, r, c) {
  return (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? board[r * COLS + c] : null;
}
export function buildBoard() {
  const board = [];
  let seed = 1;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const half = r <= 3 ? "ench" : (r === 4 ? (c < 3 ? "ench" : "earth") : "earth");
      const n = NAMED_TILES[`${r},${c}`];
      board.push({
        r, c, half: n ? n.half : half, seed: seed++,
        open: n ? (n.open || { N: 1, E: 1, S: 1, W: 1 }) : { N: 1, E: 1, S: 1, W: 1 },
        name: n ? n.name : null, label: n ? n.label : null, fixed: !!(n && n.fixed),
        _openSet: !!n, revealed: !!(n && n.fixed), card: null, card2: null,
      });
    }
  }
  return board;
}
// Generic tiles are ONLY T-junctions (3 open edges) or crossroads (4). When reached by exploration
// we keep the entry edge open (you "place the tile to connect"), so the maze never dead-ends.
export function assignOpenings(tile, mustOpen) {
  if (tile._openSet) return;
  tile.open = { N: 1, E: 1, S: 1, W: 1 };
  if (rng() < 0.7) {
    const cand = ["N", "E", "S", "W"].filter((s) => s !== mustOpen);
    tile.open[cand[rnd(cand.length)]] = 0;
  }
  tile._openSet = true;
}
export function revealTile(tile, mustOpen) { if (!tile) return; tile.revealed = true; assignOpenings(tile, mustOpen); }

/* ----------------------------- adjacency -------------------------------- */
export function edgeBetween(from, to) {
  if (to.r === from.r - 1) return ["N", "S"];
  if (to.r === from.r + 1) return ["S", "N"];
  if (to.c === from.c + 1) return ["E", "W"];
  if (to.c === from.c - 1) return ["W", "E"];
  return null;
}
export function neighborsOf(board, t) {
  return [cellAt(board, t.r - 1, t.c), cellAt(board, t.r + 1, t.c), cellAt(board, t.r, t.c - 1), cellAt(board, t.r, t.c + 1)].filter(Boolean);
}
export function reachableFrom(board, seat, tile) {
  if (tile.storm) return [];                                     // a storm bars NORMAL movement out of the area (§18.11)
  return neighborsOf(board, tile).filter((n) => {
    const e = edgeBetween(tile, n);
    if (!e) return false;
    if (!tile.open[e[0]]) return false;
    if (n.revealed && !n.open[e[1]]) return false;               // explored & no matching road
    if (n.revealed && n.name === "cave" && !hasThing(seat, "golden_bough")) return false; // Cave needs the Golden Bough
    if (n.storm) return false;                                   // ...and bars normal movement INTO a stormy area
    return true;
  });
}

/* ------------------------------- deck ----------------------------------- */
export function refillDeck(game) {
  if (!game.deck.length && game.discard.length) {
    game.deck = shuffle(game.discard.slice());
    game.discard = [];
    logEvent(game, "The wood stirs — its denizens roam anew.", "muted");
  }
}
// A denizen leaves a tile. recycle=true → it wanders back into the deck later (keeps encounters coming
// on the ~60-tile board). Unique slain bosses (Dragon/King) don't recycle.
export function clearCard(game, tile, recycle = true) {
  // Clears ONLY the active denizen. In a two-card area (Palace/Altar §9) the second waits in `card2`
  // until it becomes the active card (see rules.js openEncounter) — clearing the first must never
  // discard the second unencountered.
  if (tile.card) { if (recycle) game.discard.push(tile.card); tile.card = null; }
}
export function drawCardFor(game, tile) {
  if (tile.fixed) return;
  const n = (tile.name === "palace" || tile.name === "altar") ? 2 : 1;
  for (let i = 0; i < n; i += 1) {
    refillDeck(game);
    if (!game.deck.length) break;
    const id = game.deck.pop();
    if (DEN[id].cls === "spell") tile.pendingSpell = id;
    else if (!tile.card) tile.card = id;
    else tile.card2 = id;
  }
}

/* --------------------------- derived stats ------------------------------ */
export function knightOf(seat) { return KNIGHTS[seat.knight]; }
export function hasThing(seat, thing) { return seat.things.includes(thing); }
export function totalP(seat) {
  const k = knightOf(seat);
  return k.P
    + seat.prowess.reduce((a, x) => a + (x.P || 1), 0)
    + seat.things.reduce((a, t) => a + (THINGS[t] ? (THINGS[t].P || 0) : 0), 0)
    + seat.companions.reduce((a, cid) => a + (COMP_P[cid] || 0), 0);
}
export function totalS(seat) {
  const k = knightOf(seat);
  return k.S
    + seat.things.reduce((a, t) => a + (THINGS[t] ? (THINGS[t].S || 0) : 0), 0)
    + (seat.horse ? 2 : 0)
    + (seat.companions.includes("grail") ? 1 : 0);
}
// Power-limit total EXCLUDES the one-shot aids (Prince & Sage don't count toward 10).
export function capTotal(seat) { return totalP(seat) + totalS(seat) - (seat.companions.includes("sage") ? 2 : 0); }
// The Princess won't aid vs the King — her +1 Prowess is withheld in that fight only.
export function princessVsKing(seat, den) { return (den && den.king && seat.companions.includes("princess")) ? 1 : 0; }
export function enforcePower(game, seat) {
  // Never shed a quest-critical Thing (Guyon's Golden Bough, needed to enter the Cave) while it's still
  // needed — that could strand the quest. Shed a sparable Thing, then a prowess card, and only as a last
  // resort the quest item itself. (§14 lets the player choose which cards to surrender; this auto-picks.)
  const questCritical = (t) => t === "golden_bough" && seat.q === "cave" && !seat.questDone;
  let guard = 0;
  while (capTotal(seat) > POWER_LIMIT && guard++ < 12) {
    let i = seat.things.length - 1;
    while (i >= 0 && questCritical(seat.things[i])) i -= 1;
    if (i >= 0) { const t = seat.things.splice(i, 1)[0]; logEvent(game, `${seat.name} sheds the ${THINGS[t].name} (power limit).`); }
    else if (seat.prowess.length) { seat.prowess.pop(); logEvent(game, `${seat.name} sheds a prowess card (power limit).`); }
    else if (seat.things.length) { const t = seat.things.pop(); logEvent(game, `${seat.name} sheds the ${THINGS[t].name} (power limit).`); }
    else break;
  }
}

/* ----------------------------- relocation ------------------------------- */
export function relocate(game, seat, r, c) {
  const d = cellAt(game.board, r, c);
  if (!d) return null;
  // First-time reveal of a partner tile draws its card, exactly like exploring into it
  // (§11 "cards are drawn when an area is first revealed"). Without this, a knight
  // transported onto a fresh tile flipped it face-up with its denizen/spell silently
  // skipped. Already-revealed tiles keep whatever card lingers on them.
  if (!d.revealed) { revealTile(d); drawCardFor(game, d); }
  seat.r = d.r; seat.c = d.c;
  seat.arrivedByTransport = true;   // §8: you cannot withdraw from a denizen you were transported onto
  // §5.3/§8: a denizen already in the destination must be approached — on your NEXT turn if you were
  // transported here (the caller ends the turn), before any normal move. Cleared once approached.
  if (d.card) seat.mustApproach = true;
  return d;
}
// Sent to the Tower. Losing a FIGHT costs you your companions — but they return to the wood (recycle
// into the deck) so quest companions (Grail/Prince/Princess) can't be permanently locked away by the
// wrong knight. Being sent by the Rogue/Queen keeps your companions (loseCompanions=false).
export function toTower(game, seat, loseCompanions = true) {
  seat.tower = true; seat.towerTries = 0; seat.r = 4; seat.c = 3;
  if (loseCompanions && seat.companions.length) {
    seat.companions.forEach((c) => game.discard.push(c));
    seat.companions = [];
  }
}
export function anyKing(game) { return game.seat_order.some((m) => game.players[m].isKing); }
export function tileNameAt(game, seat) { const t = cellAt(game.board, seat.r, seat.c); return t ? t.name : null; }
// Reveal (orient to the entry road) + draw a card on first exploration, and settle the mover onto the tile.
export function applyMoveTo(game, seat, from, to) {
  if (!to.revealed) { const e = edgeBetween(from, to); revealTile(to, e ? e[1] : undefined); drawCardFor(game, to); }
  seat.r = to.r; seat.c = to.c; seat.moved = true;
}

/* ------------------------------- spells --------------------------------- */
// The scatter is a discrete, one-shot presentation event (like a roll): the client tours the tokens
// across the wood exactly once, keyed off the seq. A re-render, a reconnect, or a reload must never
// replay it, so the seq only ever advances — it is never cleared.
function recordHorn(game, byName, scattered) {
  game.horn_seq = (game.horn_seq || 0) + 1;
  game.horn = {
    seq: game.horn_seq, byName,
    marks: scattered.map((s) => s.mark),
    tour: scattered.map((s) => [s.r, s.c]),
  };
}
// A tile-turn to animate: record which cells spun + bump the seq so the renderer spins those tiles 180°
// once (§18.12 Fog / the Wand's single-tile turn — bug mrgkf242).
function recordRotation(game, cells) {
  if (!cells.length) return;
  game.rotation = { seq: (game.rotation_seq = (game.rotation_seq || 0) + 1), cells: cells.map((t) => [t.r, t.c]) };
}
// Returns { endTurn } — Mystic Horn ends the drawer's turn.
export function resolveSpell(game, seat, tile, spellId) {
  const name = seat.name;
  if (spellId === "fog") {
    // §18.12: every face-up arrow area rotates 180°. Fixed areas (Gates/Tower) don't turn.
    const spun = [];
    for (const t of game.board) if (t.revealed && !t.fixed) { const o = t.open; t.open = { N: o.S, S: o.N, E: o.W, W: o.E }; spun.push(t); }
    recordRotation(game, spun);
    const n = spun.length;
    logEvent(game, `Mystic Fog rolls through — ${n} area${n === 1 ? "" : "s"} of the wood turn about.`);
    return {};
  }
  if (spellId === "wind") {
    // §18.14: sweeps every Thing HELD by a Knight (not Companions, not the Grail, not the mount Horse).
    let swept = 0;
    for (const m of game.seat_order) { const q = game.players[m]; swept += q.things.length; q.things = []; }
    logEvent(game, swept ? "Mystic Wind blows — every Thing held by the knights is swept away!" : "Mystic Wind blows, but no knight holds a Thing to lose.", swept ? "r" : "");
    return {};
  }
  if (spellId === "horn") {
    logEvent(game, `Mystic Horn sounds — the knights are scattered!`, "a");
    const scattered = [];
    game.seat_order.forEach((m) => {
      const q = game.players[m];
      if (q.tower || q.captured) return;          // the imprisoned and the bound never hear the horn
      relocate(game, q, 8 - q.r, 6 - q.c);
      scattered.push({ mark: m, r: q.r, c: q.c });
    });
    recordHorn(game, name, scattered);
    return { endTurn: true };
  }
  return {};
}

/* ----------------------------- reactions -------------------------------- */
// A short "what did this Thing do to me" note for the result card / chronicle: the stat/power it grants
// and the seat's resulting totals, so a player sees the buff and their updated stats when they receive it.
const POWER_NOTE = { cave: "lets you enter the Cave", key: "escapes the Tower once", wand: "rotates your tile", scry: "scries the deck" };
function thingEffect(seat, id) {
  const t = THINGS[id] || {}; const parts = [];
  if (t.S) parts.push(`+${t.S} Strength`);
  if (t.P) parts.push(`+${t.P} Prowess`);
  if (t.power) parts.push(POWER_NOTE[t.power] || "a special power");
  return `${parts.join(", ") || "no bonus"} (now S ${totalS(seat)} · P ${totalP(seat)})`;
}
// "the Merlin" reads as a typo: he is a person, not a species. `proper` denizens take no article.
export function denPhrase(id) {
  const den = DEN[id];
  if (!den) return "the denizen";
  return den.proper ? den.name : `the ${den.name}`;
}
// The story a reaction tells, with the knight written into it. Falls back to plain narration.
function tale(id, act, name) {
  const t = DEN_TALES[id] && DEN_TALES[id][act];
  return t ? t.replace(/\{k\}/g, name) : null;
}
// The first-sight line for an encountered denizen, the knight written in. Falls back to a plain
// meeting so a denizen with no written intro still says who {k} has come upon.
export function denIntro(id, name) {
  const t = DEN_INTRO[id];
  return t ? t.replace(/\{k\}/g, name) : `${name} comes upon ${denPhrase(id)}.`;
}
// Apply a greeted denizen's reaction. Returns { endTurn, befriended }.
export function applyReaction(game, seat, tile, act) {
  const name = seat.name;
  const id = tile.card;
  if (act === "remains") { tile.remains = true; logEvent(game, tale(id, act, name) || `${denPhrase(id)} remains, ignoring ${name}.`); return {}; }
  if (act === "transport") { logEvent(game, tale(id, act, name) || `${denPhrase(id)} transports away.`); clearCard(game, tile); return {}; }
  if (act === "transportYou") { logEvent(game, tale(id, act, name) || `The Arch-Mage transports ${name}!`, "a"); relocate(game, seat, 8 - seat.r, 6 - seat.c); return {}; }
  if (act === "befriend") return befriend(game, seat, tile, id);
  if (act === "tower") { logEvent(game, tale(id, act, name) || `The Rogue betrays ${name} — to the Tower!`, "r"); toTower(game, seat, false); return { endTurn: true }; } // Rogue: keep companions
  if (act && act.startsWith("give:")) {
    const th = act.slice(5);
    seat.things.push(th);
    clearCard(game, tile); enforcePower(game, seat);
    // The tale first, then the bookkeeping — the player wants the scene, and then the numbers.
    logEvent(game, tale(id, act, name) || `${denPhrase(id)} gives ${name} the ${THINGS[th].name}.`, "a");
    logEvent(game, `${name} takes the ${THINGS[th].name} — ${thingEffect(seat, th)}.`, "a");
    return {};
  }
  if (act && act.startsWith("run")) {
    const dir = act.slice(3);
    const dest = horseRunsTo(game, tile, dir);
    if (dest) {
      tile.card = null; tile.remains = false;             // it moves — it does NOT leave play
      if (!dest.card) dest.card = id; else dest.card2 = id;
      logEvent(game, tale(id, "run", name) || "The Horse gallops off.");
      logEvent(game, `The Horse bolts ${DIR_WORD[dir]} into the next glade — give chase.`, "muted");
    } else {
      seat.horse = true;
      clearCard(game, tile, false);                       // caught: the Horse is held, not reshuffled
      logEvent(game, tale(id, "catch", name) || `${name} catches the Horse!`, "a");
      logEvent(game, `${name} rides the Horse — +2 Strength.`, "a");
      enforcePower(game, seat);                           // the Horse counts toward the Power Limit
    }
    return {};
  }
  return {};
}
// The Horse runs along a road (1,2→N · 3,4→S · 5→E · 6→W) into the neighbouring glade, where it can be
// chased and greeted again. Only when no road leads that way — or the glade beyond has no room for it —
// does it stay to be caught (rulebook: "if a road leads that way; else it befriends").
export function horseRunsTo(game, tile, dir) {
  const d = DIR_DELTA[dir];
  if (!d || !tile.open[dir]) return null;
  const nb = cellAt(game.board, tile.r + d[0], tile.c + d[1]);
  return nb && (!nb.card || !nb.card2) ? nb : null;
}
export function befriend(game, seat, tile, id) {
  seat.companions.push(id);
  logEvent(game, `The ${DEN[id].name} befriends ${seat.name}!`, "a");
  const q = seat.q;
  if ((q === "princess" && id === "princess") || (q === "prince" && id === "prince")) {
    seat.questDone = true;
    logEvent(game, `${seat.name}'s quest companion is won — now leave by the Enchanted Gate!`, "g");
  }
  clearCard(game, tile, false); enforcePower(game, seat);
  return { befriended: true };
}
export function takeGrail(game, seat, tile) {
  seat.companions.push("grail");
  logEvent(game, `${seat.name} takes up the Holy Grail!`, "a");
  if (seat.q === "grail") { seat.questDone = true; logEvent(game, `${seat.name} bears the Grail — reach the Enchanted Gate to win!`, "g"); }
  clearCard(game, tile, false);
}

// Record a seat's most recent roll under its OWN mark, so a following bot turn (in the same makeMove
// call) can't clobber the human's result before it reaches the client.
function recordRoll(game, mark, data) {
  game.roll_seq = (game.roll_seq || 0) + 1;
  if (!game.results) game.results = {};
  game.results[mark] = { seq: game.roll_seq, mark, ...data };
}

/* ------------------------- imprisoned escape ---------------------------- */
// The escape rule as a single face predicate, shared by the odds preview and the resolution so the
// two can never drift. Tower: a 5 or 6 frees you, and the fourth attempt frees you no matter the die
// (the rulebook's auto-release on the 4th turn). Enchantress: only a 6 breaks her song.
export function escapeFrees(mode, face, tries) {
  return mode === "capture" ? face === 6 : (face >= 5 || tries >= 4);
}
// Preview the imprisoned-escape roll as a "pick one of six": mark each face free/held so the client can
// show "2 free you · 4 held" and let the captive tap one. Pure — the shuffled faceMap stays server-side.
export function escapeOutcomes(mode, tries) {
  const free = mode === "capture" ? "you break free of the Enchantress" : "you slip free of the Tower";
  const held = mode === "capture" ? "the Enchantress holds you fast" : "the Tower bars hold";
  const f = [1, 2, 3, 4, 5, 6].filter((x) => escapeFrees(mode, x, tries)).length;
  const groups = [];
  if (f) groups.push({ key: "free", label: free, count: f });
  if (6 - f) groups.push({ key: "held", label: held, count: 6 - f });
  return { mode, tries, groups };
}
// Resolve a picked escape attempt: apply the rule, free the seat on success, and record the roll under
// the seat's OWN mark so the client pops its result modal (a following bot turn records elsewhere and
// can't clobber it). `tries` is the attempt count already reflected in the pending projection.
export function resolveEscape(game, seat, face, mode, tries) {
  const name = seat.name;
  const freed = escapeFrees(mode, face, tries);
  if (mode === "capture") {
    if (freed) { seat.captured = false; logEvent(game, `${name} breaks free of the Enchantress!`, "g"); }
    else logEvent(game, `${name} struggles against the Enchantress's song.`);
  } else if (freed) {
    seat.tower = false;
    logEvent(game, tries >= 4 && face < 5 ? `${name} slips free of the Tower — the fourth dawn opens the door.` : `${name} escapes the Tower!`, "g");
  } else {
    logEvent(game, `${name} rattles the Tower bars — they hold.`);
  }
  recordRoll(game, seat.mark, { escape: true, mode, freed, tries });
  return { freed };
}

/* ------------------------------- combat --------------------------------- */
function princeAids(seat, den) {
  // Britomart never spends her quest-companion Prince as a mere fighter (using his help loses him, §18.15).
  return seat.companions.includes("prince") && !seat._princeUsed && seat.q !== "prince" && !den.king && !(den.dragon && seat.q === "dragon");
}
function useSage(game, seat) {
  if (seat.companions.includes("sage")) { seat.companions = seat.companions.filter((c) => c !== "sage"); logEvent(game, "The Sage's counsel is spent — he departs.", "a"); }
}
function usePrince(game, seat) {
  // §18.15: "After giving his help, Prince transports himself." He LEAVES the knight (no longer counts
  // for the power limit or Britomart's quest) and returns to the wood to be greeted again.
  if (seat.companions.includes("prince") && seat._princeAiding) {
    seat._princeAiding = false; seat._princeUsed = true;
    seat.companions = seat.companions.filter((c) => c !== "prince");
    const spots = game.board.filter((t) => t.revealed && !t.card && t.name !== "tower"
      && !game.seat_order.some((m) => game.players[m].r === t.r && game.players[m].c === t.c));
    if (spots.length) spots[rnd(spots.length)].card = "prince";
    logEvent(game, "The Prince has lent his arm; he transports himself back into the wood.", "a");
  }
}
// The "6 vs 4" preview shown to the player before a challenge (same bonuses as the fight, minus the dice).
export function combatPreview(seat, tile) {
  const den = DEN[tile.card];
  if (!den) return null;
  let mine = 0, foe = 0;
  if (den.cls === "beast" || den.cls === "warrior") mine += totalS(seat);
  if (den.cls === "magic" || den.cls === "warrior") mine += totalP(seat) - princessVsKing(seat, den);
  if (tile.name === "chapel" && (den.cls === "magic" || den.cls === "warrior")) mine += 1;
  if (princeAids(seat, den)) {
    if (den.cls === "beast" || den.cls === "warrior") mine += DEN.prince.S;
    if (den.cls === "magic" || den.cls === "warrior") mine += DEN.prince.P;
  }
  foe += (den.S || 0) + (den.P || 0);
  if (tile.name === "castle" && den.S) foe += 2;
  if (tile.name === "grove" && den.P) foe += 1;
  const label = den.cls === "beast" ? "Strength" : den.cls === "magic" ? "Prowess" : "Strength + Prowess";
  return { label, mine, foe };
}
// Preview a combat as "pick one of six": roll the foe's (red) die now, then mark each of the
// player's six white faces win / lose / tie, so the client can show "2 win, 4 lose" and let the
// player tap one. Pure over the seat/tile except for the one red roll it returns. Ties reroll
// (handled at pick time). Mirrors resolveChallenge's bonus math via combatPreview.
export function combatOutcomes(game, seat, tile) {
  const den = DEN[tile.card];
  if (!den) return null;
  const pv = combatPreview(seat, tile);        // { label, mine:mineBonus, foe:foeBonus } — no side effects
  const red = d6();
  const foeTotal = red + pv.foe;
  const faces = [];
  for (let f = 1; f <= 6; f += 1) {
    const mine = f + pv.mine;
    faces.push({ face: f, result: mine > foeTotal ? "win" : (mine === foeTotal ? "tie" : "lose") });
  }
  const labels = { win: "you win", lose: "you lose", tie: "a tie — reroll" };
  const groups = [];
  for (const key of ["win", "lose", "tie"]) {
    const count = faces.filter((x) => x.result === key).length;
    if (count) groups.push({ key, label: labels[key], count });
  }
  return { card: tile.card, red, foeTotal, mineBonus: pv.mine, label: pv.label, faces, groups };
}
// Resolve a Challenge. Returns { result: 'win'|'lose'|'captured', endTurn:true }.
// forcedWhite/forcedRed (1-6) let a combat pick drive the dice instead of rolling; the caller
// guarantees they don't tie (a tie is rerolled at pick time).
export function resolveChallenge(game, seat, tile, forcedWhite, forcedRed) {
  const den = DEN[tile.card];
  const id = tile.card;
  const mineParts = [], foeParts = [];
  if (den.cls === "beast" || den.cls === "warrior") mineParts.push({ l: "Strength", v: totalS(seat) });
  if (den.cls === "magic" || den.cls === "warrior") mineParts.push({ l: "Prowess", v: totalP(seat) - princessVsKing(seat, den) });
  if (tile.name === "chapel" && (den.cls === "magic" || den.cls === "warrior")) mineParts.push({ l: "Chapel", v: 1 }); // §17.2: +1 Prowess in a challenge/greeting here
  if (princeAids(seat, den)) {
    seat._princeAiding = true;
    if (den.cls === "beast" || den.cls === "warrior") mineParts.push({ l: "Prince", v: DEN.prince.S });
    if (den.cls === "magic" || den.cls === "warrior") mineParts.push({ l: "Prince", v: DEN.prince.P });
    logEvent(game, "The Prince lends his arm to this fight.", "a");
  }
  if (den.S) foeParts.push({ l: "Strength", v: den.S });
  if (den.P) foeParts.push({ l: "Prowess", v: den.P });
  if (tile.name === "castle" && den.S) foeParts.push({ l: "Castle", v: 2 });
  if (tile.name === "grove" && den.P) foeParts.push({ l: "Grove", v: 1 });
  const mineBonus = mineParts.reduce((a, x) => a + x.v, 0), foeBonus = foeParts.reduce((a, x) => a + x.v, 0);

  let white, red, mine, foe, guard = 0;
  if (forcedWhite != null && forcedRed != null) {
    white = forcedWhite; red = forcedRed; mine = white + mineBonus; foe = red + foeBonus;
  } else {
    do { white = d6(); red = d6(); mine = white + mineBonus; foe = red + foeBonus; } while (mine === foe && guard++ < 50);
  }

  // Resolve first, then record: the consequences of the fight (the Dragon slain, a Thing taken, the crown
  // claimed, a companion spent) are logged by the branches below, and the result modal must show them —
  // "Victory! 9 vs 7" alone leaves the player guessing what they actually won.
  let result;
  const outcome = mine > foe ? "win" : "lose";
  // §8 exception / §18.7: the Enchantress never imprisons — vanquished by her, you REMAIN in her area
  // (she ignores you until you leave); every other foe sends you to the Tower.
  const bound = outcome === "lose" && den.captures;
  if (outcome === "win") logEvent(game, `${seat.name} vanquishes the ${den.name}! (${mine} vs ${foe})`, "g");
  else if (bound) logEvent(game, `The Enchantress overpowers ${seat.name} (${mine} vs ${foe}) — you remain in her glade, ensnared.`, "r");
  else logEvent(game, `${seat.name} is vanquished by the ${den.name} (${mine} vs ${foe}) — away to the Tower!`, "r");
  const before = logMark(game);   // headline is already on the modal; capture only what follows

  if (outcome === "win") {
    applyWin(game, seat, tile, den, id);
    useSage(game, seat); usePrince(game, seat); enforcePower(game, seat);
    result = "win";
  } else {
    useSage(game, seat); usePrince(game, seat);
    result = "lose";
    if (bound) {
      // §8: her song scatters your Companions — they become independent. You stay put (no Tower).
      if (seat.companions.length) { seat.companions.forEach((c) => game.discard.push(c)); seat.companions = []; logEvent(game, "Her song scatters the knight's companions — they wander free.", "a"); }
    } else { toTower(game, seat); }   // fight loss → the Tower; companions lost (they return to the wood)
  }
  // Record the decisive roll so the client can show the dice-reveal modal.
  recordRoll(game, seat.mark, { white, red, mine, foe, mineParts, foeParts, foeName: den.name, outcome, bound,
    picked: forcedWhite != null, detail: logSince(game, before) });
  return { result, endTurn: true };
}
function applyWin(game, seat, tile, den, id) {
  if (den.dragon) {
    if (seat.q === "dragon") { seat.questDone = true; logEvent(game, `The Dragon is SLAIN — ${seat.name}'s quest is done! Reach the Enchanted Gate to win.`, "g"); clearCard(game, tile, false); }
    else { logEvent(game, "The Dragon flees to the far wood."); clearCard(game, tile, true); } // stays in play so George's quest remains possible
  } else if (den.slay) {
    // §18.15: no prowess is gained for a Prince-assisted kill, and the slain denizen is removed (no recycle).
    if (seat._princeAiding) { logEvent(game, `The ${den.name} falls to the Prince's arm — no glory won.`, "muted"); clearCard(game, tile, false); }
    else { seat.prowess.push({ name: den.slay, P: 1 }); logEvent(game, `${seat.name} gains ${den.slay} (+1 Prowess).`, "g"); clearCard(game, tile); }
  }
  else if (den.gives) { seat.things.push(den.gives); logEvent(game, `${seat.name} takes the ${THINGS[den.gives].name}.`, "g"); clearCard(game, tile); }
  else if (den.king) { becomeKing(game, seat); clearCard(game, tile, false); }
  else if (id === "wizard") { seat.things.push("lance"); logEvent(game, `${seat.name} takes the Lance (+1 Strength).`, "g"); clearCard(game, tile); }
  else if (id === "illusion") { sendIllusion(game, tile); }
  else clearCard(game, tile);
}
export function becomeKing(game, seat) {
  if (seat.knight === "britomart") { logEvent(game, "Britomart will not seize the crown."); return; }
  seat.isKing = true; seat.q = "king";
  // §15: a King is no longer bound by chivalry — any Save Boy / Rescue Damsel card is set aside.
  if (game.chivalry) for (const t of ["boy", "damsel"]) if (game.chivalry[t] === seat.mark) game.chivalry[t] = null;
  logEvent(game, `${seat.name} strikes down the King and claims the crown!`, "g");
}

/* ------------------------------ chivalry -------------------------------- */
// §15: merely SEEING a Boy or Damsel (revealed in an area you enter) lays the obligation of rescue on
// you — you take the Save Boy / Rescue Damsel card, whether or not you can greet them this turn. The
// card passes to the LAST knight to see them; game.chivalry holds the current bearer's mark.
export function takeChivalry(game, seat, tile) {
  if (!game.chivalry) game.chivalry = { boy: null, damsel: null };
  for (const id of [tile.card, tile.card2]) {
    const c = id && DEN[id] && DEN[id].chivalry;
    if (c && !seat.isKing && game.chivalry[c] !== seat.mark) {
      game.chivalry[c] = seat.mark;
      logEvent(game, `The sight of the ${DEN[id].name} lays the obligation of rescue on ${seat.name}.`, "a");
    }
  }
}
// §15 delivery (destinations per MojoSOGO): the Damsel is rescued in the Queen's area (wherever the
// Queen card currently is); the Boy is rescued at the Earthly Gate. Greeting the Queen is optional, so
// delivery is by arrival, not by a boon. The reward VALUE is still undefined in the rulebook, so none
// is invented — a rescue is logged, the obligation cleared, and a tally kept (mechanical reward TBD).
export function deliverRescue(game, seat, tile) {
  const deliveries = [];
  if (seat.companions.includes("damsel") && (tile.card === "queen" || tile.card2 === "queen")) deliveries.push(["damsel", "the Queen"]);
  if (seat.companions.includes("boy") && tile.name === "egate") deliveries.push(["boy", "the Earthly Gate"]);
  for (const [id, where] of deliveries) {
    seat.companions = seat.companions.filter((c) => c !== id);   // the card no longer functions as a companion
    if (game.chivalry) game.chivalry[id] = null;
    seat.saved = seat.saved || {}; seat.saved[id] = true;        // permanent Boy-saver / Damsel-rescuer status — the reward is the honour, no stat (per the rulebook)
    logEvent(game, `${seat.name} delivers the ${DEN[id].name} safely to ${where} — ${id === "boy" ? "Boy-saver" : "Damsel-rescuer"}, chivalry fulfilled!`, "g");
  }
}

/* -------------------------------- greet --------------------------------- */
// A greeting only rolls when the die can change the outcome. The Sage always befriends, the Bishop
// always starts a prayer, and a denizen whose reaction table holds a single effect (Dwarf → Armour,
// Nymph → Crystal) always gives it. Rolling there is theatre, and reads as a bug: no die is rolled
// and none is shown.
function greetNeedsDie(den, id) {
  if (den.befriendAlways || id === "bishop") return false;
  if (id === "queen" || den.cls === "companion") return true;   // queen's boon, Grail/Princess/Prince
  if (!den.tbl) return false;
  return new Set(Object.values(den.tbl)).size > 1;
}
// Preview what each of the six greet faces would do, WITHOUT applying anything — this
// is the shell game's odds. Returns null for denizens that never roll (Sage/Bishop,
// single-effect tables — they resolve at once). Otherwise a per-face list plus the
// grouped counts the client shows ("2 give a Potion, 2 ignore you, 2 transport away").
// It mirrors resolveGreet's branching exactly; the parity test pins them together.
export function greetOutcomes(game, seat, tile, useGuyon = true) {
  const den = DEN[tile.card];
  const id = tile.card;
  if (!greetNeedsDie(den, id)) return null;
  const guyon = (useGuyon && seat.knight === "guyon") ? 1 : 0;   // §8.2: Guyon may decline his +1
  const chapel = tile.name === "chapel" ? 1 : 0;
  const isPComp = den.cls === "companion" && (den.grail || id === "princess" || id === "prince");
  const faces = [];
  for (let f = 1; f <= 6; f += 1) faces.push({ face: f, ...greetFaceOutcome(game, seat, tile, den, id, f, guyon, chapel, isPComp) });
  const groups = [];
  for (const o of faces) {
    const g = groups.find((x) => x.key === o.key);
    if (g) g.count += 1; else groups.push({ key: o.key, label: o.label, count: 1 });
  }
  return { card: id, faces, groups };
}
function greetFaceOutcome(game, seat, tile, den, id, face, guyon, chapel, isPComp) {
  if (isPComp) {
    const total = face + totalP(seat) + guyon + chapel;
    if (den.grail) return total >= 9 ? { key: "grail", label: "you take up the Grail" } : { key: "flee", label: "the Grail slips away" };
    if (id === "princess") return total >= 9 ? { key: "befriend", label: "she befriends you" } : { key: "flee", label: "she flees to the far Gate" };
    return total >= 8 ? { key: "befriend", label: "he befriends you" } : { key: "attack", label: "he attacks you (a fight)" };
  }
  if (id === "queen") return face >= 5 ? { key: "imprison", label: "she imprisons a rival" } : { key: "nothing", label: "she grants nothing" };
  const idx = Math.min(6, Math.max(1, face + guyon));
  const act = (den.tbl && den.tbl[idx]) || "remains";
  if (act === "remains") return { key: "remains", label: "ignores you" };
  if (act === "transport") return { key: "transport", label: "transports away" };
  if (act === "transportYou") return { key: "transportYou", label: "transports you" };
  if (act === "befriend") return { key: "befriend", label: "befriends you" };
  if (act === "tower") return { key: "tower", label: "sends you to the Tower" };
  if (act.startsWith("give:")) { const th = act.slice(5); return { key: act, label: `gives the ${THINGS[th].name}` }; }
  if (act.startsWith("run")) return horseRunsTo(game, tile, act.slice(3)) ? { key: "run", label: "the Horse bolts to the next glade" } : { key: "catch", label: "you catch the Horse (+2 S)" };
  return { key: "remains", label: "ignores you" };
}
// Resolve a Greet. Returns { endTurn:true } (a greeting always ends the turn, like the standalone).
// forcedDie (1-6) lets a shell pick drive the face instead of an internal d6 roll.
export function resolveGreet(game, seat, tile, forcedDie, useGuyon = true) {
  const den = DEN[tile.card];
  const id = tile.card;
  const before = logMark(game);        // capture the outcome lines for the result card
  const die = forcedDie != null ? forcedDie : (greetNeedsDie(den, id) ? d6() : null);
  if (den.befriendAlways) { befriend(game, seat, tile, id); } // Sage / Boy / Damsel
  else {
    const guyon = (useGuyon && seat.knight === "guyon") ? 1 : 0;   // §8.2: Guyon may decline his +1 after seeing the roll
    const isPComp = den.cls === "companion" && (den.grail || id === "princess" || id === "prince");
    if (isPComp) {
      const total = die + totalP(seat) + guyon + (tile.name === "chapel" ? 1 : 0);
      if (den.grail) {
        if (total >= 9) takeGrail(game, seat, tile);
        else { logEvent(game, "The Grail slips away."); clearCard(game, tile); }
      } else if (id === "princess") {
        if (total >= 9) befriend(game, seat, tile, id);
        else { logEvent(game, "The Princess flees to the far Gate."); clearCard(game, tile); }
      } else { // prince — 8+ befriends, 2-7 he ATTACKS (vanquish → he yields & joins)
        if (total >= 8) befriend(game, seat, tile, id);
        else princeAttack(game, seat, tile);
      }
      useSage(game, seat);   // §18.19: the Sage aids ONE approach — a challenge OR a greeting — then departs
    } else if (id === "bishop") {
      startPrayer(game, seat, tile);            // pray 3 full turns → Ring (counted at turn start)
    } else if (id === "queen") {
      queenBoon(game, seat, die);               // 5-6 casts a rival into the Tower
    } else {
      const idx = die == null ? 1 : Math.min(6, Math.max(1, die + guyon));   // no die → every row is the same row
      const act = (den.tbl && den.tbl[idx]) || "remains";
      applyReaction(game, seat, tile, act);
    }
  }
  recordRoll(game, seat.mark, { greet: true, die, picked: forcedDie != null, foeName: den.name,
    foePhrase: denPhrase(id), result: logSince(game, before) || `${denPhrase(id)} reacts.` });
  return { endTurn: true };
}

// Prince attacks on a low greet: a S+P fight. Vanquish him → he yields and joins; lose → the Tower.
function princeAttack(game, seat, tile) {
  const name = seat.name;
  let white, red, mine, foe, guard = 0;
  do { white = d6(); red = d6(); mine = white + totalS(seat) + totalP(seat); foe = red + DEN.prince.S + DEN.prince.P; } while (mine === foe && guard++ < 50);
  logEvent(game, `The Prince attacks — ${mine} vs ${foe}.`, "a");
  if (mine > foe) { logEvent(game, `${name} unhorses the Prince, who yields and joins!`, "g"); befriend(game, seat, tile, "prince"); }
  else { logEvent(game, `The Prince strikes ${name} down — away to the Tower!`, "r"); toTower(game, seat); }
}
// Bishop: kneel to pray; 3 full turns on the tile earns the Ring (counted in beginSeatTurn).
function startPrayer(game, seat) {
  seat.praying = true; seat.prayerTurns = 0;
  logEvent(game, `${seat.name} kneels to pray before the Bishop (0/3).`);
}
// Queen: on a 5-6 she casts the leading free rival into the Tower (she keeps her seat). One-boon-per-game
// and a player-chosen target are documented fast-follows.
function queenBoon(game, seat, die) {
  logEvent(game, `${seat.name} kneels before the Queen (rolled ${die}).`);
  if (die < 5) { logEvent(game, "The Queen grants no boon this time."); return; }
  const rivals = game.seat_order.map((m) => game.players[m]).filter((p) => p.mark !== seat.mark && !p.tower && !p.captured && !p.won && tileNameAt(game, p) !== "tower");
  if (!rivals.length) { logEvent(game, "The Queen offers a boon, but no rival is within reach."); return; }
  rivals.sort((a, b) => (Number(b.questDone) - Number(a.questDone)) || ((totalS(b) + totalP(b)) - (totalS(a) + totalP(a))));
  const t = rivals[0];
  logEvent(game, `The Queen grants a boon — ${t.name} is cast into the Tower!`, "a");
  toTower(game, t, false);
}
// Illusion "does your bidding": relocate its card to a random revealed, unoccupied, non-Tower glade.
function sendIllusion(game, tile) {
  const id = tile.card; tile.card = null;
  const spots = game.board.filter((t) => t.revealed && !t.card && t.name !== "tower" && !game.seat_order.some((m) => game.players[m].r === t.r && game.players[m].c === t.c));
  if (spots.length) { spots[rnd(spots.length)].card = id; logEvent(game, "The Illusion does your bidding and drifts off to another glade."); }
  else logEvent(game, "The Illusion does your bidding and fades away.");
}

/* ------------------------------- joust ---------------------------------- */
// The contest only: both knights add full S+P + a die; ties reroll. Records the roll for the
// challenger so they see the result, and returns who won. The prize is applied separately.
export function resolveJoust(game, ch, def) {
  const cName = ch.name, dName = def.name;
  let cw, dw, guard = 0;
  do { cw = d6() + totalS(ch) + totalP(ch); dw = d6() + totalS(def) + totalP(def); } while (cw === dw && guard++ < 50);
  const chWon = cw > dw;
  logEvent(game, `${cName} jousts ${dName} — ${cw} vs ${dw}. ${chWon ? cName : dName} prevails!`, "a");
  recordRoll(game, ch.mark, { joust: true, cw, dw, cName, dName, winnerName: chWon ? cName : dName, chWon });
  return { chWon };
}
// Whether the loser has anything worth taking (so the client only offers valid prizes).
export function joustSpoils(loser) {
  return {
    things: (loser.things.length > 0 || loser.horse),
    prowess: loser.prowess.length > 0,           // §12: a prowess card is a valid spoil
    companions: loser.companions.length > 0,
  };
}
// Apply the winner's chosen prize. "tower" imprisons the loser (keeps cards); "thing" takes their
// best Thing/Horse; "companion" takes one companion. Falls back to Tower if the picked spoil is gone.
export function joustPrize(game, winner, loser, prize) {
  const wn = winner.name, ln = loser.name;
  if (prize === "thing") {
    if (loser.horse && !winner.horse) { loser.horse = false; winner.horse = true; logEvent(game, `${wn} wins ${ln}'s Horse (+2 Strength).`, "g"); enforcePower(game, winner); return; }
    if (loser.things.length) {
      loser.things.sort((a, b) => ((THINGS[b].S || 0) + (THINGS[b].P || 0)) - ((THINGS[a].S || 0) + (THINGS[a].P || 0)));
      const t = loser.things.shift(); winner.things.push(t); logEvent(game, `${wn} takes ${ln}'s ${THINGS[t].name}.`, "g"); enforcePower(game, winner); return;
    }
  }
  if (prize === "prowess" && loser.prowess.length) {   // §12: take one extra prowess card
    loser.prowess.sort((a, b) => (b.P || 1) - (a.P || 1));
    const pc = loser.prowess.shift(); winner.prowess.push(pc);
    logEvent(game, `${wn} takes ${ln}'s ${pc.name} (+${pc.P || 1} Prowess).`, "g"); enforcePower(game, winner); return;
  }
  if (prize === "companion" && loser.companions.length) { joustTakeCompanion(game, winner, loser); return; }
  logEvent(game, `${wn} unhorses ${ln} — away to the Tower!`, "r");
  toTower(game, loser, false);   // sent by a joust → keeps all cards
}
// §12: Sage (and Boy/Damsel) come outright; every other Companion must be APPROACHED with a die roll —
// "remains" leaves them loyal to the foe, and the Prince fights back (winning, he stays and jails you).
function joustTakeCompanion(game, winner, loser) {
  const wn = winner.name, ln = loser.name, cid = loser.companions[0];
  const take = () => {
    loser.companions.shift(); winner.companions.push(cid);
    logEvent(game, `${wn} wins ${ln}'s ${DEN[cid].name}.`, "g");
    if ((winner.q === "princess" && cid === "princess") || (winner.q === "prince" && cid === "prince")) { winner.questDone = true; logEvent(game, `${wn}'s quest companion is won — leave by the Enchanted Gate!`, "g"); }
    enforcePower(game, winner);
  };
  if (cid === "sage") { take(); return; }
  if (cid === "prince") {
    let cw, pw, guard = 0;
    do { cw = d6() + totalS(winner) + totalP(winner); pw = d6() + DEN.prince.S + DEN.prince.P; } while (cw === pw && guard++ < 50);
    logEvent(game, `The Prince fights ${wn} for his loyalty — ${cw} vs ${pw}.`, "a");
    if (cw > pw) take();
    else { logEvent(game, `The Prince stays loyal to ${ln} and strikes ${wn} down — away to the Tower!`, "r"); toTower(game, winner, false); }
    return;
  }
  const need = (cid === "grail" || cid === "princess") ? 9 : 8, roll = d6() + totalP(winner);
  logEvent(game, `${wn} approaches ${ln}'s ${DEN[cid].name} — ${roll} (need ${need}).`, "a");
  if (roll >= need) take();
  else logEvent(game, `The ${DEN[cid].name} remains loyal to ${ln}.`);
}

/* ------------------------------- powers --------------------------------- */
export function powerScry(game, seat) {
  refillDeck(game);
  if (!game.deck.length) { logEvent(game, "The Crystal clouds over — the deck is empty.", "a"); return { next: null }; }
  const id = game.deck[game.deck.length - 1];
  logEvent(game, `${seat.name} scries the Crystal — next card: ${DEN[id].name}.`, "a");
  return { next: id };
}
export function powerRotate(game, seat) {
  const t = cellAt(game.board, seat.r, seat.c);
  const o = t.open;
  t.open = { N: o.S, S: o.N, E: o.W, W: o.E };
  recordRotation(game, [t]);
  logEvent(game, `${seat.name} raises the Wand — the tile turns about.`, "a");
}
/* ------------------------------- storm ---------------------------------- */
// Magician companion (rulebook §18.11): on your turn you may raise a storm over any area — never from
// or at the Tower. For the three full turns AFTER this one, no one may enter or leave it by NORMAL
// movement; magical movement (transport / horn / relocate, which bypass reachableFrom) still passes.
// `fresh` skips the first decay so the creating turn itself doesn't count against the three.
function stormWhere(t) { return t.label || (t.name ? t.name : "the glade"); }
export function raiseStorm(game, seat, tile) {
  tile.storm = { turns: 3, fresh: true };
  logEvent(game, `${seat.name} calls up the Magician's storm over ${stormWhere(tile)} — none may enter or leave it for three turns.`, "a");
}
// Age every active storm once per turn (called from advanceTurn). The creating turn is free (`fresh`).
export function decayStorms(game) {
  for (const t of game.board) {
    if (!t.storm) continue;
    if (t.storm.fresh) { t.storm.fresh = false; continue; }
    t.storm.turns -= 1;
    if (t.storm.turns <= 0) { t.storm = null; logEvent(game, `The storm over ${stormWhere(t)} blows itself out.`, "muted"); }
  }
}

// Fountain: 1–2 Tower · 3–4 Earthly Gate · 5–6 Enchanted Gate. Ends the turn.
export function powerDrink(game, seat, tile) {
  tile._used = true;
  const r = d6();
  const dest = r <= 2 ? [4, 3] : r <= 4 ? [8, 3] : [0, 3];
  const where = r <= 2 ? "the Tower" : r <= 4 ? "the Earthly Gate" : "the Enchanted Gate";
  logEvent(game, `${seat.name} drinks — the waters sweep them to ${where}. (rolled ${r})`, "a");
  relocate(game, seat, dest[0], dest[1]);
  return { endTurn: true };
}
