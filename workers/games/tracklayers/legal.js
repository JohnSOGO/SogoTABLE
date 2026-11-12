// Tracklayers — shared rule constants, event log, and commit validation. Pure.
// Owned here (not in rules.js) so the resolver (resolve.js) and the bot
// (ai.js) check legality through exactly the same code a human commit runs:
// "bots run the human path".
import { COLORS, isCardKind, canPay } from "./cards.js";
import { CITY_BY_ID, ROUTE_BY_ID } from "./graph.js";

export const ROUTE_POINTS = Object.freeze({ 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 });
export const LONGEST_BONUS = 10;
export const EVENT_CAP = 60;
export const TICKETS_OFFERED = 3;

export const twinsLocked = (game) => game.seat_order.length <= 3;

export function routeLabel(route) {
  const a = CITY_BY_ID[route.a];
  const b = CITY_BY_ID[route.b];
  return `${a ? a.name : route.a}–${b ? b.name : route.b}`;
}

export function pushEvent(game, event) {
  game.event_seq = (Number(game.event_seq) || 0) + 1;
  game.events.push({ seq: game.event_seq, round: game.round, ...event });
  if (game.events.length > EVENT_CAP) game.events.splice(0, game.events.length - EVENT_CAP);
}

// Why `mark` can't build `route` with `color` right now, or null if it can.
// Checks only the board, the seat's own trains and hand — so the same check
// serves commit time and (re-run) barrier close.
export function claimProblem(game, mark, route, color) {
  if (!route) return "That route isn't on the map.";
  const seat = game.players[mark];
  const label = routeLabel(route);
  if (game.routes[route.id]) {
    return game.routes[route.id] === mark ? `You already own ${label}.` : `${label} is already taken.`;
  }
  if (route.twin && game.routes[route.twin]) {
    if (game.routes[route.twin] === mark) return `You already own the other track between ${label} — one seat can't own both.`;
    if (twinsLocked(game)) return `With 3 or fewer players only one track of a double route can be built (${label} is taken).`;
  }
  if (seat.trains < route.len) return `${label} needs ${route.len} trains — you have ${seat.trains}.`;
  if (color !== "wild" && !COLORS.includes(color)) return "Pick which card color to pay with.";
  if (route.color !== "gray" && color !== "wild" && color !== route.color) {
    return `${label} is a ${route.color} route — pay with ${route.color} cards (wilds fill in).`;
  }
  if (!canPay(seat.hand, color, route.len)) {
    return color === "wild"
      ? `${label} needs ${route.len} wilds — you have ${seat.hand.wild}.`
      : `${label} needs ${route.len} ${color} cards (wilds fill in) — you have ${seat.hand[color]} ${color} + ${seat.hand.wild} wild.`;
  }
  return null;
}

// Normalize + validate one COMMIT payload's `action` for `mark` against the
// state as it stands now. Returns plain data to store as seat.committed;
// throws a player-readable Error when illegal. Contested outcomes (a market
// card someone else takes first, a route someone with priority builds) are
// NOT errors here — the resolver settles them at barrier close.
export function validateCommit(game, mark, raw) {
  const action = raw && typeof raw === "object" ? raw : {};
  const type = String(action.type || "").trim().toUpperCase();
  if (type === "DRAW") {
    const picks = (Array.isArray(action.picks) ? action.picks : []).map((p) => String(p || "").trim().toLowerCase());
    if (!picks.length || picks.length > 2) throw new Error("Draw two cards: each pick is the deck or a face-up color.");
    picks.forEach((p) => {
      if (p !== "deck" && !isCardKind(p)) throw new Error(`"${p}" isn't a card you can draw.`);
    });
    if (picks.includes("wild")) {
      if (picks.length !== 1) throw new Error("A face-up Lantern wild is your whole draw — take it on its own.");
      if (!game.market.includes("wild")) throw new Error("There is no face-up wild to take.");
      return { type: "DRAW", picks: ["wild"] };
    }
    if (picks.length !== 2) throw new Error("Draw two cards: each pick is the deck or a face-up color.");
    picks.forEach((p) => {
      if (p !== "deck" && !game.market.includes(p)) throw new Error(`There is no face-up ${p} card to take.`);
    });
    return { type: "DRAW", picks };
  }
  if (type === "CLAIM") {
    const route = ROUTE_BY_ID[String(action.route || "")] || null;
    const color = String(action.color || (route && route.color !== "gray" ? route.color : "")).trim().toLowerCase();
    const problem = claimProblem(game, mark, route, color);
    if (problem) throw new Error(problem);
    return { type: "CLAIM", route: route.id, color };
  }
  if (type === "TICKETS") {
    if (!game.ticket_deck.length) throw new Error("The ticket pile is empty — draw cards or build instead.");
    return { type: "TICKETS" };
  }
  throw new Error("Choose an action: DRAW cards, CLAIM a route, or draw TICKETS.");
}
