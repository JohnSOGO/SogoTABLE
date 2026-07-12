// The Mystic Wood — spells & storms (pure: no DOM, no I/O, no timers).
// The three Mystic spell cards (Fog / Wind / Horn) resolve on arrival, and the
// Magician companion's storm bars an area. Extracted from engine.js to keep it
// under the god-file cap. relocate flows in from engine.js; the chronicle (logEvent)
// from the pure narration.js leaf; the seq'd board-event descriptors the client heralds
// (recordRotation / recordHorn) from the pure events.js leaf. Neither leaf imports back.
import { relocate, recordRoll } from "./engine.js";
import { logEvent } from "./narration.js";
import { recordRotation, recordHorn, recordWind } from "./events.js";
import { THINGS } from "./data.js";

/* ------------------------------- spells --------------------------------- */
// Returns { endTurn } — Mystic Horn ends the drawer's turn.
export function resolveSpell(game, seat, tile, spellId) {
  const name = seat.name;
  if (spellId === "fog") {
    // §18.12: every face-up arrow area rotates 180°. Fixed areas (Gates/Tower) don't turn.
    const spun = [];
    for (const t of game.board) if (t.revealed && !t.fixed) { const o = t.open; t.open = { N: o.S, S: o.N, E: o.W, W: o.E }; spun.push(t); }
    recordRotation(game, spun, name, "fog");
    const n = spun.length;
    // Name the knight who drew it: the wood turns on someone ELSE's turn too, and an unattributed spin
    // read as the board glitching (bug mrh97d6q).
    logEvent(game, `${name} draws the Mystic Fog — it rolls through, and ${n} area${n === 1 ? "" : "s"} of the wood turn about.`);
    return {};
  }
  if (spellId === "wind") {
    // §18.14: sweeps every Thing HELD by a Knight (not Companions, not the Grail, not the mount Horse).
    let swept = 0;
    for (const m of game.seat_order) {
      const q = game.players[m];
      if (!q.things.length) continue;
      const lost = q.things.map((t) => (THINGS[t] ? THINGS[t].name : t));
      swept += q.things.length;
      q.things = [];
      // Informed Consent (forced change): an EXTERNAL force — a rival's spell, on THEIR turn — stripped
      // this knight's Things. The shared herald says only "N swept"; it never says what YOU lost. Tell the
      // victim what left their character, so a forced change never lives only in a chronicle they can't see
      // (humans only — a bot has no screen). Off-turn: results[mark] holds it until the victim next renders.
      if (!q.is_bot) {
        const listed = lost.length === 1 ? lost[0] : `${lost.slice(0, -1).join(", ")} and ${lost[lost.length - 1]}`;
        recordRoll(game, q.mark, { notice: {
          tag: "Mystic Wind", emoji: "🌬️",
          head: `The Mystic Wind sweeps your ${lost.length === 1 ? "Thing" : "Things"} away.`,
          body: `<b>${listed}</b> — lost on the wind (§18.14). Your companions and the Grail are untouched; only Things blow away.`,
        } });
      }
    }
    recordWind(game, name, swept);
    logEvent(game, swept ? `${name} draws the Mystic Wind — it blows, and every Thing held by the knights is swept away!` : `${name} draws the Mystic Wind, but no knight holds a Thing to lose.`, swept ? "r" : "");
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
