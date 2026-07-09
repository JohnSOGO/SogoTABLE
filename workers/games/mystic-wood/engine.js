// The Mystic Wood — pure game mechanics (no DOM, no I/O, no timers).
// Board generation, movement/adjacency, the denizen deck, derived stats, and the
// synchronous resolution of encounters, spells, and powers. All randomness flows
// through one swappable module seam so tests can inject a deterministic RNG.
// The turn machine + platform contract live in rules.js; the bot in ai.js.
import {
  KNIGHTS, THINGS, DEN, DECK_IDS, COMP_P, ROWS, COLS, POWER_LIMIT,
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
const LOG_CAP = 80;
export function logEvent(game, text, cls = "") {
  if (!game.log) game.log = [];
  game.log.push({ text, cls });
  if (game.log.length > LOG_CAP) game.log.splice(0, game.log.length - LOG_CAP);
}

/* ------------------------------- board ---------------------------------- */
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
  return neighborsOf(board, tile).filter((n) => {
    const e = edgeBetween(tile, n);
    if (!e) return false;
    if (!tile.open[e[0]]) return false;
    if (n.revealed && !n.open[e[1]]) return false;               // explored & no matching road
    if (n.revealed && n.name === "cave" && !hasThing(seat, "golden_bough")) return false; // Cave needs the Golden Bough
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
  if (tile.card) { if (recycle) game.discard.push(tile.card); tile.card = null; }
  if (tile.card2) { if (recycle) game.discard.push(tile.card2); tile.card2 = null; }
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
  let guard = 0;
  while (capTotal(seat) > POWER_LIMIT && guard++ < 12) {
    if (seat.things.length) { const t = seat.things.pop(); logEvent(game, `${knightOf(seat).name} sheds the ${THINGS[t].name} (power limit).`); }
    else if (seat.prowess.length) { seat.prowess.pop(); logEvent(game, `${knightOf(seat).name} sheds a prowess card (power limit).`); }
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
// Returns { endTurn } — Mystic Horn ends the drawer's turn.
export function resolveSpell(game, seat, tile, spellId) {
  const name = knightOf(seat).name;
  if (spellId === "fog") { logEvent(game, "Mystic Fog rolls through — the wood shifts."); return {}; }
  if (spellId === "wind") { logEvent(game, "Mystic Wind blows — loose Things are swept away."); return {}; }
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
// Apply a greeted denizen's reaction. Returns { endTurn, befriended }.
export function applyReaction(game, seat, tile, den, act) {
  const name = knightOf(seat).name;
  if (act === "remains") { tile.remains = true; logEvent(game, `The ${den.name} remains, ignoring ${name}.`); return {}; }
  if (act === "transport") { logEvent(game, `The ${den.name} transports away.`); clearCard(game, tile); return {}; }
  if (act === "transportYou") { logEvent(game, `The Arch-Mage transports ${name}!`, "a"); relocate(game, seat, 8 - seat.r, 6 - seat.c); return {}; }
  if (act === "befriend") return befriend(game, seat, tile, tile.card);
  if (act === "tower") { logEvent(game, `The Rogue betrays ${name} — to the Tower!`, "r"); toTower(game, seat, false); return { endTurn: true }; } // Rogue: keep companions
  if (act && act.startsWith("give:")) {
    const th = act.slice(5);
    seat.things.push(th);
    clearCard(game, tile); enforcePower(game, seat);
    logEvent(game, `${name} receives the ${THINGS[th].name} — ${thingEffect(seat, th)}.`, "a");
    return {};
  }
  if (act && act.startsWith("run")) {
    const dir = act.slice(3);
    const nb = { N: cellAt(game.board, tile.r - 1, tile.c), S: cellAt(game.board, tile.r + 1, tile.c), E: cellAt(game.board, tile.r, tile.c + 1), W: cellAt(game.board, tile.r, tile.c - 1) }[dir];
    if (tile.open[dir] && nb) { logEvent(game, `The Horse gallops off.`); clearCard(game, tile); }
    else { seat.horse = true; logEvent(game, `${name} catches the Horse! +2 Strength.`, "a"); clearCard(game, tile); }
    return {};
  }
  return {};
}
export function befriend(game, seat, tile, id) {
  seat.companions.push(id);
  logEvent(game, `The ${DEN[id].name} befriends ${knightOf(seat).name}!`, "a");
  const q = seat.q;
  if ((q === "princess" && id === "princess") || (q === "prince" && id === "prince")) {
    seat.questDone = true;
    logEvent(game, `${knightOf(seat).name}'s quest companion is won — now leave by the Enchanted Gate!`, "g");
  }
  clearCard(game, tile, false); enforcePower(game, seat);
  return { befriended: true };
}
export function takeGrail(game, seat, tile) {
  seat.companions.push("grail");
  logEvent(game, `${knightOf(seat).name} takes up the Holy Grail!`, "a");
  if (seat.q === "grail") { seat.questDone = true; logEvent(game, `${knightOf(seat).name} bears the Grail — reach the Enchanted Gate to win!`, "g"); }
  clearCard(game, tile, false);
}

// Record a seat's most recent roll under its OWN mark, so a following bot turn (in the same makeMove
// call) can't clobber the human's result before it reaches the client.
function recordRoll(game, mark, data) {
  game.roll_seq = (game.roll_seq || 0) + 1;
  if (!game.results) game.results = {};
  game.results[mark] = { seq: game.roll_seq, mark, ...data };
}

/* ------------------------------- combat --------------------------------- */
function princeAids(seat, den) {
  return seat.companions.includes("prince") && !seat._princeUsed && !den.king && !(den.dragon && seat.q === "dragon");
}
function useSage(game, seat) {
  if (seat.companions.includes("sage")) { seat.companions = seat.companions.filter((c) => c !== "sage"); logEvent(game, "The Sage's counsel is spent — he departs.", "a"); }
}
function usePrince(game, seat) {
  if (seat.companions.includes("prince") && seat._princeAiding) { seat._princeAiding = false; seat._princeUsed = true; logEvent(game, "The Prince has lent his arm; he fights no more, but travels on.", "a"); }
}
// The "6 vs 4" preview shown to the player before a challenge (same bonuses as the fight, minus the dice).
export function combatPreview(seat, tile) {
  const den = DEN[tile.card];
  if (!den) return null;
  let mine = 0, foe = 0;
  if (den.cls === "beast" || den.cls === "warrior") mine += totalS(seat);
  if (den.cls === "magic" || den.cls === "warrior") mine += totalP(seat) - princessVsKing(seat, den);
  if (tile.name === "chapel" && (den.cls === "magic" || den.cls === "warrior")) mine += 2;
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
// Resolve a Challenge. Returns { result: 'win'|'lose'|'captured', endTurn:true }.
export function resolveChallenge(game, seat, tile) {
  const den = DEN[tile.card];
  const id = tile.card;
  const k = knightOf(seat);
  const mineParts = [], foeParts = [];
  if (den.cls === "beast" || den.cls === "warrior") mineParts.push({ l: "Strength", v: totalS(seat) });
  if (den.cls === "magic" || den.cls === "warrior") mineParts.push({ l: "Prowess", v: totalP(seat) - princessVsKing(seat, den) });
  if (tile.name === "chapel" && (den.cls === "magic" || den.cls === "warrior")) mineParts.push({ l: "Chapel", v: 2 }); // +2 Prowess only
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
  do { white = d6(); red = d6(); mine = white + mineBonus; foe = red + foeBonus; } while (mine === foe && guard++ < 50);

  // Resolve first, then record: the consequences of the fight (the Dragon slain, a Thing taken, the crown
  // claimed, a companion spent) are logged by the branches below, and the result modal must show them —
  // "Victory! 9 vs 7" alone leaves the player guessing what they actually won.
  let result;
  const outcome = mine > foe ? "win" : (den.captures ? "captured" : "lose");
  if (outcome === "win") logEvent(game, `${k.name} vanquishes the ${den.name}! (${mine} vs ${foe})`, "g");
  else if (outcome === "captured") logEvent(game, `The Enchantress captures ${k.name}! (escape on a 6) — ${mine} vs ${foe}`, "r");
  else logEvent(game, `${k.name} is vanquished by the ${den.name} (${mine} vs ${foe}) — away to the Tower!`, "r");
  const before = game.log.length;   // headline is already on the modal; capture only what follows

  if (outcome === "win") {
    applyWin(game, seat, tile, den, id);
    useSage(game, seat); usePrince(game, seat); enforcePower(game, seat);
    result = "win";
  } else {
    useSage(game, seat); usePrince(game, seat);
    if (outcome === "captured") { seat.captured = true; result = "captured"; }
    else { toTower(game, seat); result = "lose"; }   // fight loss → companions lost (they return to the wood)
  }
  // Record the decisive roll so the client can show the dice-reveal modal.
  recordRoll(game, seat.mark, { white, red, mine, foe, mineParts, foeParts, foeName: den.name, outcome,
    detail: game.log.slice(before).map((e) => e.text).join("<br>") });
  return { result, endTurn: true };
}
function applyWin(game, seat, tile, den, id) {
  const k = knightOf(seat);
  if (den.dragon) {
    if (seat.q === "dragon") { seat.questDone = true; logEvent(game, `The Dragon is SLAIN — ${k.name}'s quest is done! Reach the Enchanted Gate to win.`, "g"); clearCard(game, tile, false); }
    else { logEvent(game, "The Dragon flees to the far wood."); clearCard(game, tile, true); } // stays in play so George's quest remains possible
  } else if (den.slay) { seat.prowess.push({ name: den.slay, P: 1 }); logEvent(game, `${k.name} gains ${den.slay} (+1 Prowess).`, "g"); clearCard(game, tile); }
  else if (den.gives) { seat.things.push(den.gives); logEvent(game, `${k.name} takes the ${THINGS[den.gives].name}.`, "g"); clearCard(game, tile); }
  else if (den.king) { becomeKing(game, seat); clearCard(game, tile, false); }
  else if (id === "wizard") { seat.things.push("lance"); logEvent(game, `${k.name} takes the Lance (+1 Strength).`, "g"); clearCard(game, tile); }
  else if (id === "illusion") { sendIllusion(game, tile); }
  else clearCard(game, tile);
}
export function becomeKing(game, seat) {
  if (seat.knight === "britomart") { logEvent(game, "Britomart will not seize the crown."); return; }
  seat.isKing = true; seat.q = "king";
  logEvent(game, `${knightOf(seat).name} strikes down the King and claims the crown!`, "g");
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
// Resolve a Greet. Returns { endTurn:true } (a greeting always ends the turn, like the standalone).
export function resolveGreet(game, seat, tile) {
  const den = DEN[tile.card];
  const id = tile.card;
  const before = game.log.length;      // capture the outcome lines for the result card
  const die = greetNeedsDie(den, id) ? d6() : null;
  if (den.befriendAlways) { befriend(game, seat, tile, id); } // Sage
  else {
    const guyon = seat.knight === "guyon" ? 1 : 0;
    const isPComp = den.cls === "companion" && (den.grail || id === "princess" || id === "prince");
    if (isPComp) {
      const total = die + totalP(seat) + guyon + (tile.name === "chapel" ? 2 : 0);
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
    } else if (id === "bishop") {
      startPrayer(game, seat, tile);            // pray 3 full turns → Ring (counted at turn start)
    } else if (id === "queen") {
      queenBoon(game, seat, die);               // 5-6 casts a rival into the Tower
    } else {
      const idx = die == null ? 1 : Math.min(6, Math.max(1, die + guyon));   // no die → every row is the same row
      const act = (den.tbl && den.tbl[idx]) || "remains";
      applyReaction(game, seat, tile, den, act);
    }
  }
  recordRoll(game, seat.mark, { greet: true, die, foeName: den.name,
    result: game.log.slice(before).map((e) => e.text).join("<br>") || `The ${den.name} reacts.` });
  return { endTurn: true };
}

// Prince attacks on a low greet: a S+P fight. Vanquish him → he yields and joins; lose → the Tower.
function princeAttack(game, seat, tile) {
  const name = knightOf(seat).name;
  let white, red, mine, foe, guard = 0;
  do { white = d6(); red = d6(); mine = white + totalS(seat) + totalP(seat); foe = red + DEN.prince.S + DEN.prince.P; } while (mine === foe && guard++ < 50);
  logEvent(game, `The Prince attacks — ${mine} vs ${foe}.`, "a");
  if (mine > foe) { logEvent(game, `${name} unhorses the Prince, who yields and joins!`, "g"); befriend(game, seat, tile, "prince"); }
  else { logEvent(game, `The Prince strikes ${name} down — away to the Tower!`, "r"); toTower(game, seat); }
}
// Bishop: kneel to pray; 3 full turns on the tile earns the Ring (counted in beginSeatTurn).
function startPrayer(game, seat, tile) {
  seat.praying = true; seat.prayerTurns = 0;
  logEvent(game, `${knightOf(seat).name} kneels to pray before the Bishop (0/3).`);
}
// Queen: on a 5-6 she casts a rival into the Tower (auto-picks the leading free opponent — she keeps
// her seat). One-boon-per-game and player-chosen target are documented fast-follows.
function queenBoon(game, seat, die) {
  logEvent(game, `${knightOf(seat).name} kneels before the Queen (rolled ${die}).`);
  if (die < 5) { logEvent(game, "The Queen grants no boon this time."); return; }
  const rivals = game.seat_order.map((m) => game.players[m])
    .filter((p) => p.mark !== seat.mark && !p.tower && !p.captured && !p.won && tileNameAt(game, p) !== "tower");
  if (!rivals.length) { logEvent(game, "The Queen offers a boon, but no rival is within reach."); return; }
  rivals.sort((a, b) => (Number(b.questDone) - Number(a.questDone)) || ((totalS(b) + totalP(b)) - (totalS(a) + totalP(a))));
  const t = rivals[0];
  logEvent(game, `The Queen grants a boon — ${knightOf(t).name} is cast into the Tower!`, "a");
  toTower(game, t, false);
}
// Illusion "does your bidding": relocate its card to a random revealed, unoccupied, non-Tower glade.
function sendIllusion(game, tile) {
  const id = tile.card; tile.card = null;
  const spots = game.board.filter((t) => t.revealed && !t.card && t.name !== "tower"
    && !game.seat_order.some((m) => game.players[m].r === t.r && game.players[m].c === t.c));
  if (spots.length) { spots[rnd(spots.length)].card = id; logEvent(game, "The Illusion does your bidding and drifts off to another glade."); }
  else logEvent(game, "The Illusion does your bidding and fades away.");
}

/* ------------------------------- joust ---------------------------------- */
// The contest only: both knights add full S+P + a die; ties reroll. Records the roll for the
// challenger so they see the result, and returns who won. The prize is applied separately.
export function resolveJoust(game, ch, def) {
  const cName = knightOf(ch).name, dName = knightOf(def).name;
  let cw, dw, guard = 0;
  do { cw = d6() + totalS(ch) + totalP(ch); dw = d6() + totalS(def) + totalP(def); } while (cw === dw && guard++ < 50);
  const chWon = cw > dw;
  logEvent(game, `${cName} jousts ${dName} — ${cw} vs ${dw}. ${chWon ? cName : dName} prevails!`, "a");
  recordRoll(game, ch.mark, { joust: true, cw, dw, cName, dName, winnerName: chWon ? cName : dName, chWon });
  return { chWon };
}
// Whether the loser has anything worth taking (so the client only offers valid prizes).
export function joustSpoils(loser) {
  return { things: (loser.things.length > 0 || loser.horse), companions: loser.companions.length > 0 };
}
// Apply the winner's chosen prize. "tower" imprisons the loser (keeps cards); "thing" takes their
// best Thing/Horse; "companion" takes one companion. Falls back to Tower if the picked spoil is gone.
export function joustPrize(game, winner, loser, prize) {
  const wn = knightOf(winner).name, ln = knightOf(loser).name;
  if (prize === "thing") {
    if (loser.horse && !winner.horse) { loser.horse = false; winner.horse = true; logEvent(game, `${wn} wins ${ln}'s Horse (+2 Strength).`, "g"); enforcePower(game, winner); return; }
    if (loser.things.length) {
      loser.things.sort((a, b) => ((THINGS[b].S || 0) + (THINGS[b].P || 0)) - ((THINGS[a].S || 0) + (THINGS[a].P || 0)));
      const t = loser.things.shift(); winner.things.push(t); logEvent(game, `${wn} takes ${ln}'s ${THINGS[t].name}.`, "g"); enforcePower(game, winner); return;
    }
  }
  if (prize === "companion" && loser.companions.length) {
    const c = loser.companions.shift(); winner.companions.push(c);
    logEvent(game, `${wn} wins ${ln}'s ${DEN[c].name}.`, "g");
    if ((winner.q === "princess" && c === "princess") || (winner.q === "prince" && c === "prince")) { winner.questDone = true; logEvent(game, `${wn}'s quest companion is won — leave by the Enchanted Gate!`, "g"); }
    enforcePower(game, winner); return;
  }
  logEvent(game, `${wn} unhorses ${ln} — away to the Tower!`, "r");
  toTower(game, loser, false);   // sent by a joust → keeps all cards
}

/* ------------------------------- powers --------------------------------- */
export function powerScry(game, seat) {
  refillDeck(game);
  if (!game.deck.length) { logEvent(game, "The Crystal clouds over — the deck is empty.", "a"); return { next: null }; }
  const id = game.deck[game.deck.length - 1];
  logEvent(game, `${knightOf(seat).name} scries the Crystal — next card: ${DEN[id].name}.`, "a");
  return { next: id };
}
export function powerRotate(game, seat) {
  const t = cellAt(game.board, seat.r, seat.c);
  const o = t.open;
  t.open = { N: o.S, S: o.N, E: o.W, W: o.E };
  logEvent(game, `${knightOf(seat).name} raises the Wand — the tile turns about.`, "a");
}
// Fountain: 1–2 Tower · 3–4 Earthly Gate · 5–6 Enchanted Gate. Ends the turn.
export function powerDrink(game, seat, tile) {
  tile._used = true;
  const r = d6();
  const dest = r <= 2 ? [4, 3] : r <= 4 ? [8, 3] : [0, 3];
  const where = r <= 2 ? "the Tower" : r <= 4 ? "the Earthly Gate" : "the Enchanted Gate";
  logEvent(game, `${knightOf(seat).name} drinks — the waters sweep them to ${where}. (rolled ${r})`, "a");
  relocate(game, seat, dest[0], dest[1]);
  return { endTurn: true };
}
