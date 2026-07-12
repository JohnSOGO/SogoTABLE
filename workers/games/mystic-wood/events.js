// The Mystic Wood — seq'd board-event descriptors the client heralds (no rules, no I/O).
// A one-shot presentation event (a tile-turn, a horn scatter) is recorded on the game state as a
// descriptor with a monotonically increasing seq. The renderer plays each seq exactly once and keys
// its animation off it, so a re-render, a reconnect, or a reload can never replay one — which is why
// a seq only ever ADVANCES and is never cleared. These writers decide nothing: the rules have already
// resolved the effect; this module only announces what happened, for the client to show.
// A pure leaf: it imports nothing (engine.js and spells.js import IT — never the other way round).

// A tile-turn to animate: record which cells spun + bump the seq so the renderer spins those tiles 180°
// once (§18.12 Fog / the Wand's single-tile turn — bug mrgkf242). Shared by resolveSpell (spells.js)
// and the Wand power (powerRotate, engine.js) — the one seq the renderer keys the spin off.
// `by` (the knight who caused it) and `cause` ("fog" | "wand") ride along so the client's herald can say
// WHO turned the wood and WHY — a silent spin read as the board glitching (bug mrh97d6q).
export function recordRotation(game, cells, by = null, cause = "fog") {
  if (!cells.length) return;
  game.rotation = { seq: (game.rotation_seq = (game.rotation_seq || 0) + 1), cells: cells.map((t) => [t.r, t.c]), by, cause };
}

// Mystic Wind (§18.14): the Things are already swept; this only announces it. The one board-wide spell
// with nothing to animate, so before this it landed as a log line alone and no one saw their kit vanish.
export function recordWind(game, by, swept) {
  game.wind = { seq: (game.wind_seq = (game.wind_seq || 0) + 1), by, swept };
}

// The Mystic Horn's scatter: the client tours the tokens across the wood exactly once, keyed off the
// seq — the marks that were swept and the landing places they tour through, in seat order.
export function recordHorn(game, byName, scattered) {
  game.horn_seq = (game.horn_seq || 0) + 1;
  game.horn = {
    seq: game.horn_seq, byName,
    marks: scattered.map((s) => s.mark),
    tour: scattered.map((s) => [s.r, s.c]),
  };
}
