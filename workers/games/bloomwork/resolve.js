// Bloomwork — contested-pick resolution for one simultaneous pick step.
//
// Every seat committed { source, flower, row } against the same displays.
// They resolve one at a time in this step's PRIORITY ORDER (rotates one seat
// every pick, and the Early Bird holder leads each round), so two players
// reaching for the same stall is settled by a rule written on the table,
// never by phone speed:
//
//   1. Your stall still holds your flower → take every one of them; the rest
//      of that stall slides into the middle (the "Square").
//   2. Your stall was already cleared by a higher-priority player → you take
//      your flower from the Square instead, if any is there (it often is: the
//      leftovers of the stall you wanted just slid in).
//   3. None of your flower is left anywhere you can reach → you miss this pick
//      (no flowers, no compost). The event says who beat you to it.
//
// The first seat to take from the Square also takes the Early Bird: it goes
// to their compost heap (costs a slot) and they lead next round.
//
// Pure: mutates only the game blob it is given; no I/O, no randomness.
import { BIRD, COMPOST_SLOTS, bedColumnFor, canPlant, rowCapacity } from "./board.js";

// Put `count` of `flower` into planter row `row` (or straight to compost when
// row is -1 or no longer legal). Overflow beyond the row spills to compost;
// compost beyond its slots goes to the discard lid. Returns what happened.
export function plantInto(seat, row, flower, count, lid) {
  let placed = 0;
  let target = row;
  if (target >= 0 && !canPlant(seat.rows, seat.bed, target, flower)) target = -1;
  if (target >= 0) {
    const line = seat.rows[target];
    placed = Math.min(count, rowCapacity(target) - line.count);
    line.flower = flower;
    line.count += placed;
  }
  const spill = count - placed;
  let composted = 0;
  for (let i = 0; i < spill; i += 1) {
    if (seat.compost.length < COMPOST_SLOTS) { seat.compost.push(flower); composted += 1; } else lid.push(flower);
  }
  return { row: target, placed, composted, lidded: spill - composted };
}

function takeBird(game, seat) {
  game.bird_in_center = false;
  seat.compost.unshift(BIRD);
  if (seat.compost.length > COMPOST_SLOTS) {
    const dropped = seat.compost.pop();
    if (dropped !== BIRD) game.lid.push(dropped);
  }
}

export function resolveBloomworkPick(game, order, pushEvent) {
  const takenFrom = {}; // stall index -> mark that cleared it this step
  let birdTaker = null;
  order.forEach((mark) => {
    const seat = game.players[mark];
    const pick = seat && seat.committed;
    if (!pick) return;
    let source = pick.source;
    let fallback = false;
    let count = 0;
    if (source !== "center") {
      const stall = game.stalls[source] || [];
      count = stall.filter((f) => f === pick.flower).length;
      if (count > 0) {
        game.center.push(...stall.filter((f) => f !== pick.flower));
        game.stalls[source] = [];
        takenFrom[source] = mark;
      } else {
        fallback = true;
        source = "center";
      }
    }
    if (source === "center") {
      count = game.center.filter((f) => f === pick.flower).length;
      if (count > 0) game.center = game.center.filter((f) => f !== pick.flower);
    }
    if (!count) {
      pushEvent({ type: "missed", mark, flower: pick.flower, stall: pick.source, by: takenFrom[pick.source] || null });
      return;
    }
    const tookBird = source === "center" && game.bird_in_center;
    if (tookBird) { takeBird(game, seat); birdTaker = mark; }
    const result = plantInto(seat, pick.row, pick.flower, count, game.lid);
    pushEvent({
      type: "take", mark, flower: pick.flower, count, source,
      wanted: pick.source, bumped_by: fallback ? (takenFrom[pick.source] || null) : null,
      row: result.row, placed: result.placed, composted: result.composted + result.lidded, bird: tookBird,
    });
  });
  return { birdTaker };
}

// Column a full planter row plants into (re-exported for rules.js tiling).
export { bedColumnFor };
