// The Mystic Wood — bot turns. Runs the SAME rules path as humans (no bot-only shortcuts):
// it moves through reachable tiles and resolves encounters via the shared engine, immediately
// (no pending-choice pause). Called in-process by the turn machine (resolvesBotsInternally).
import { DEN } from "./data.js";
import {
  cellAt, reachableFrom, applyMoveTo, resolveSpell, resolveChallenge, resolveGreet,
  anyKing, pickIndex,
} from "./engine.js";

// Play one bot seat's whole turn. Turn-start rolls/win-checks already ran in beginSeatTurn.
export function playBotTurn(game, seat) {
  const from = cellAt(game.board, seat.r, seat.c);
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

// Mirror of the turn machine's enterTile, but resolves any encounter immediately.
function botEnter(game, seat, tile) {
  if (tile.pendingSpell) { const sp = tile.pendingSpell; tile.pendingSpell = null; resolveSpell(game, seat, tile, sp); }
  if (tile.name === "xgate" && seat.questDone && !seat.atGate) seat.atGate = true;
  if (tile.name === "cave" && seat.q === "cave") { seat.caveTurns += 1; if (seat.caveTurns >= 3) seat.questDone = true; }
  if (tile.card && DEN[tile.card].king && seat.knight === "britomart" && !anyKing(game)) return; // Britomart ignores the King
  if (!tile.card) return;
  const den = DEN[tile.card];
  const combat = den.cls === "beast" || den.cls === "warrior" || den.cls === "magic";
  if (combat) resolveChallenge(game, seat, tile);
  else resolveGreet(game, seat, tile);
}
