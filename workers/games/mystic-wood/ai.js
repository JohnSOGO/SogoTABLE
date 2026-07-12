// The Mystic Wood — bot turns. Runs the SAME rules path as humans (no bot-only shortcuts):
// it moves through reachable tiles and resolves encounters via the shared engine, immediately
// (no pending-choice pause). Called in-process by the turn machine (resolvesBotsInternally).
import { DEN } from "./data.js";
import {
  cellAt, reachableFrom, applyMoveTo, resolveChallenge, resolveGreet,
  anyKing, pickIndex, takeChivalry, deliverRescue, snubbedBy,
} from "./engine.js";
import { resolveSpell } from "./spells.js";

// Play one bot seat's whole turn. Turn-start rolls/win-checks already ran in beginSeatTurn.
export function playBotTurn(game, seat) {
  const from = cellAt(game.board, seat.r, seat.c);
  // §5.3/§8: a denizen you were transported onto must be approached first, and you cannot move after.
  if (seat.mustApproach) {
    seat.mustApproach = false;
    if (from.card && !(DEN[from.card].king && seat.knight === "britomart" && !anyKing(game))) {
      const den = DEN[from.card];
      if (den.cls === "beast" || den.cls === "warrior" || den.cls === "magic") resolveChallenge(game, seat, from);
      else resolveGreet(game, seat, from);
      return;
    }
  }
  // Sit tight on a winning square (hold the Gate/Castle to win next turn).
  if ((seat.questDone && from.name === "xgate") || (seat.isKing && from.name === "castle")) return;
  // Hold position to accrue a multi-turn objective (Cave vigil / Bishop prayer).
  if ((seat.q === "cave" && from.name === "cave" && !seat.questDone) || (seat.praying && from.card === "bishop")) return;
  const opts = reachableFrom(game.board, seat, from);
  if (!opts.length) return;
  let target = null;
  if (seat.questDone) { const g = opts.find((o) => o.name === "xgate"); if (g) target = g; }
  if (!target) { const unexp = opts.filter((o) => !o.revealed); if (unexp.length) target = unexp[pickIndex(unexp.length)]; }
  if (!target) target = opts[pickIndex(opts.length)];
  applyMoveTo(game, seat, from, target);
  botEnter(game, seat, target);
}

// Mirror of the turn machine's enterTile, but resolves any encounter immediately. Exported so the bot's
// arrival can be driven directly in tests — it is where bot/human rule parity is won or lost.
export function botEnter(game, seat, tile) {
  if (tile.pendingSpell) { const sp = tile.pendingSpell; tile.pendingSpell = null; resolveSpell(game, seat, tile, sp); }
  if (tile.name === "xgate" && seat.questDone && !seat.atGate) seat.atGate = true;
  if (tile.name === "cave" && seat.q === "cave") { seat.caveTurns += 1; if (seat.caveTurns >= 3) seat.questDone = true; }
  botMeet(game, seat, tile);
}
// Approach the denizens of this area. §9: "you must approach all Denizens individually, and your turn is not
// over until you have done so or have been sent to another place" — the human path loops this in rules.js
// afterEncounter, but the bot met only the FIRST card and walked away from the second. Bots run the human
// rules or they run different rules; there is no third option. Loops until the area is met or the knight is
// carried out of it (Tower / transport), so a bot can never quietly skip a card a human is bound to face.
function botMeet(game, seat, tile, guard = 0) {
  if (!tile.card && tile.card2) { tile.card = tile.card2; tile.card2 = null; }   // the second of a two-card area (§9)
  takeChivalry(game, seat, tile); deliverRescue(game, seat, tile);   // §15 obligation / delivery
  if (tile.card && DEN[tile.card].king && seat.knight === "britomart" && !anyKing(game)) return; // Britomart ignores the King
  if (!tile.card) return;
  // §8.2.1: a denizen who has already ignored THIS knight goes on ignoring it — the same bar the human
  // path enforces in openEncounter. Bots run the human rules or they run different rules; there is no
  // third option, and a bot quietly re-rolling a denizen a human may not is exactly that.
  if (snubbedBy(seat, tile.card)) {
    if (!tile.card2) return;                                             // pass freely through
    const held = tile.card; tile.card = tile.card2; tile.card2 = held;   // …but still meet the OTHER denizen here
  }
  const den = DEN[tile.card];
  const combat = den.cls === "beast" || den.cls === "warrior" || den.cls === "magic";
  if (combat) resolveChallenge(game, seat, tile);
  else resolveGreet(game, seat, tile);
  // Still standing in the area with a card left to meet → meet it. Being sent away (Tower) or transported
  // ends the obligation, exactly as §9's "or have been sent to another place" says.
  const here = seat.r === tile.r && seat.c === tile.c && !seat.tower && !seat.out && !seat.won;
  if (here && !tile.card && tile.card2 && guard < 2) botMeet(game, seat, tile, guard + 1);
}
