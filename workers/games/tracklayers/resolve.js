// Tracklayers — barrier-close resolution and final scoring. Pure; every random
// draw goes through the `rng` passed in from rules.js (the one seam).
//
// Resolution order (fixed; PLAN.md "Resolution"), `priority_order` decides
// every contest — never arrival order:
//   1. TICKETS — each taker draws up to 3 → pending_tickets (bots keep now).
//   2. CLAIM   — re-checked against the board as earlier claims leave it; a
//                loser keeps its cards and draws ONE blind consolation card.
//   3. DRAW    — pick #1 for every drawer, refill; pick #2 for every drawer,
//                refill. A gone color → a blind card; a gone face-up wild →
//                two blind cards.
import { drawBlind, refillMarket, takeFromMarket, payCost } from "./cards.js";
import { ROUTE_BY_ID, TICKET_BY_ID, components, longestPath, ownedRoutes } from "./graph.js";
import { ROUTE_POINTS, LONGEST_BONUS, TICKETS_OFFERED, claimProblem, pushEvent, routeLabel } from "./legal.js";

function logger(game) {
  return (kind, text) => pushEvent(game, { kind, text });
}

export function dealTickets(game, mark, count, minKeep) {
  const seat = game.players[mark];
  const drawn = game.ticket_deck.splice(0, count);
  seat.pending_tickets = drawn;
  seat.min_keep = Math.min(minKeep, drawn.length);
  return drawn;
}

// Keep `keep` (validated by the caller) of the seat's pending tickets; the
// rest go to the bottom of the ticket pile.
export function keepTickets(game, mark, keep) {
  const seat = game.players[mark];
  const returned = seat.pending_tickets.filter((id) => !keep.includes(id));
  seat.tickets.push(...keep);
  game.ticket_deck.push(...returned);
  seat.pending_tickets = [];
  seat.min_keep = 1;
  pushEvent(game, { kind: "keep", mark, text: `${mark} kept ${keep.length} of ${keep.length + returned.length} tickets.` });
}

function resolveTickets(game, marks, botKeep) {
  marks.forEach((mark) => {
    const drawn = dealTickets(game, mark, TICKETS_OFFERED, 1);
    if (!drawn.length) {
      pushEvent(game, { kind: "tickets", mark, text: `${mark} reached for tickets but the pile was empty.` });
      return;
    }
    pushEvent(game, { kind: "tickets", mark, text: `${mark} drew ${drawn.length} destination ticket${drawn.length === 1 ? "" : "s"}.` });
    if (game.players[mark].is_bot) keepTickets(game, mark, botKeep(game, mark));
  });
}

// Returns how many routes were built.
function resolveClaims(game, claims, rng) {
  let built = 0;
  const thisRound = {}; // routeId -> mark, claims built during this resolution
  claims.forEach(({ mark, action }) => {
    const seat = game.players[mark];
    const route = ROUTE_BY_ID[action.route];
    const problem = claimProblem(game, mark, route, action.color);
    if (problem) {
      const card = drawBlind(game, rng, logger(game));
      if (card) seat.hand[card] += 1;
      const winner = thisRound[route.id] || (route.twin && thisRound[route.twin]) || null;
      const why = winner
        ? (thisRound[route.id] ? `${winner} had priority` : `${winner} built the double track first`)
        : problem.replace(/\.$/, "");
      pushEvent(game, {
        kind: "conflict", mark, route: route.id, winner,
        text: `${mark} wanted ${routeLabel(route)} but ${why} — ${mark} ${card ? "drew a card instead" : "got nothing (the deck is empty)"}.`,
      });
      return;
    }
    const paid = payCost(seat.hand, action.color, route.len);
    game.discard.push(...paid);
    seat.trains -= route.len;
    const points = ROUTE_POINTS[route.len] || 0;
    seat.score += points;
    game.routes[route.id] = mark;
    thisRound[route.id] = mark;
    built += 1;
    pushEvent(game, {
      kind: "claim", mark, route: route.id, points,
      text: `${mark} built ${routeLabel(route)} (${route.len} car${route.len === 1 ? "" : "s"}, +${points}).`,
    });
  });
  return built;
}

function resolveDraws(game, draws, rng) {
  const log = logger(game);
  const got = {}; // mark -> { face: [colors], blind: n }
  draws.forEach(({ mark }) => { got[mark] = { face: [], blind: 0 }; });
  const blind = (mark) => {
    const card = drawBlind(game, rng, log);
    if (card) { game.players[mark].hand[card] += 1; got[mark].blind += 1; }
  };
  for (let step = 0; step < 2; step += 1) {
    draws.forEach(({ mark, action }) => {
      const pick = action.picks.length === 1 ? (step === 0 ? action.picks[0] : "wild-gone-2") : action.picks[step];
      if (pick === "wild-gone-2") { if (got[mark].wildGone) blind(mark); return; }
      if (pick === "deck") { blind(mark); return; }
      if (takeFromMarket(game, pick)) {
        game.players[mark].hand[pick] += 1;
        got[mark].face.push(pick);
        return;
      }
      if (pick === "wild") got[mark].wildGone = true;
      pushEvent(game, {
        kind: "fallback", mark,
        text: pick === "wild"
          ? `${mark} wanted the face-up wild but it was gone — drew 2 blind cards instead.`
          : `${mark} wanted ${pick} but it was gone — drew a blind card instead.`,
      });
      blind(mark);
    });
    refillMarket(game, rng, log);
  }
  draws.forEach(({ mark }) => {
    const { face, blind: n } = got[mark];
    const parts = face.map((c) => (c === "wild" ? "a Lantern wild" : c));
    if (n) parts.push(n === 1 ? "a blind card" : `${n} blind cards`);
    pushEvent(game, { kind: "draw", mark, face: [...face], blind: n, text: parts.length ? `${mark} took ${parts.join(" + ")}.` : `${mark} found nothing left to draw.` });
  });
}

// Apply every committed action together. Returns { built } for the
// idle-round safety valve.
export function resolveRound(game, rng, botKeep) {
  const byType = { TICKETS: [], CLAIM: [], DRAW: [] };
  game.priority_order.forEach((mark) => {
    const seat = game.players[mark];
    if (!seat || seat.skipped || !seat.committed) return;
    const action = seat.committed;
    if (byType[action.type]) byType[action.type].push({ mark, action });
    game.move_count += 1;
  });
  resolveTickets(game, byType.TICKETS.map((c) => c.mark), botKeep);
  const built = resolveClaims(game, byType.CLAIM, rng);
  resolveDraws(game, byType.DRAW, rng);
  return { built };
}

// ---------- final scoring ----------

export function scoreSeat(game, mark) {
  const seat = game.players[mark];
  const comps = components(game.routes, mark);
  const ticketResults = seat.tickets.map((id) => {
    const t = TICKET_BY_ID[id];
    const done = comps[t.a] === comps[t.b];
    return { id, points: done ? t.points : -t.points, done };
  });
  const routePoints = ownedRoutes(game.routes, mark).reduce((sum, r) => sum + (ROUTE_POINTS[r.len] || 0), 0);
  return { ticketResults, routePoints, longest: longestPath(game.routes, mark) };
}

export function completeGame(game, reason) {
  const scored = {};
  game.seat_order.forEach((mark) => { scored[mark] = scoreSeat(game, mark); });
  const best = Math.max(0, ...game.seat_order.map((m) => scored[m].longest));
  game.results = game.seat_order.map((mark) => {
    const s = scored[mark];
    const seat = game.players[mark];
    const ticketPoints = s.ticketResults.reduce((sum, t) => sum + t.points, 0);
    const bonus = best > 0 && s.longest === best ? LONGEST_BONUS : 0;
    const total = s.routePoints + ticketPoints + bonus;
    seat.score = total;
    seat.ticket_results = s.ticketResults;
    seat.longest = s.longest;
    seat.pending_tickets = [];
    seat.committed = null;
    return {
      mark, total, route_points: s.routePoints, ticket_points: ticketPoints,
      tickets_done: s.ticketResults.filter((t) => t.done).length,
      tickets_failed: s.ticketResults.filter((t) => !t.done).length,
      longest: s.longest, longest_bonus: bonus,
    };
  });
  const order = game.seat_order;
  game.results.sort((a, b) => b.total - a.total || b.tickets_done - a.tickets_done || b.longest - a.longest
    || order.indexOf(a.mark) - order.indexOf(b.mark));
  game.winner = game.results.length ? game.results[0].mark : null;
  game.status = "complete";
  game.skip_votes = {};
  if (reason) pushEvent(game, { kind: "end", text: reason });
  game.results.forEach((r) => {
    pushEvent(game, {
      kind: "score", mark: r.mark,
      text: `${r.mark}: routes ${r.route_points}, tickets ${r.ticket_points >= 0 ? "+" : ""}${r.ticket_points} (${r.tickets_done} done, ${r.tickets_failed} missed)${r.longest_bonus ? `, Longest Line +${r.longest_bonus} (${r.longest} cars)` : ""} = ${r.total}.`,
    });
  });
  const top = game.results[0];
  if (top) pushEvent(game, { kind: "winner", mark: top.mark, text: `${top.mark} wins with ${top.total} points!` });
}

export function cardsLeft(game) {
  return game.deck.length + game.discard.length + game.market.length;
}
