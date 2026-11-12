// Tracklayers bot. Pure heuristic: it reads the public board, its OWN hand,
// tickets and trains, and the face-up market (never the deck order or other
// hands) and returns a COMMIT action; rules.js runs it through the SAME
// validateCommit a human commit takes. Depends on graph/legal/cards only,
// never on rules.js, so the rules → ai import stays one-directional.
//
// Levels (seat.level from the seat's bot_level): 1 easy, 2 medium, 3–4 hard.
//   • Plan: Dijkstra per incomplete ticket (own routes cost 0, free routes
//     cost len, others' routes and locked twins blocked) → needed routes.
//   • Claim the most valuable affordable needed route; else draw the market
//     colors those routes need (else the deck).
//   • All tickets done and trains > 12 (medium/hard) → draw TICKETS.
//   • Otherwise claim the longest affordable route.
//   • Easy: 40% of the time a random legal action.
// Cost per call: one Dijkstra per ticket (29 cities) + a scan of 76 routes.
import { ROUTES } from "./map.js";
import { COLORS, canPay } from "./cards.js";
import { ROUTE_BY_ID, TICKET_BY_ID, components, shortestPath } from "./graph.js";
import { ROUTE_POINTS, claimProblem, twinsLocked } from "./legal.js";

const tierOf = (level) => (level <= 1 ? 1 : level === 2 ? 2 : 3);

function pick(list, rng) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

// Route cost for planning `mark`'s paths.
function costFor(game, mark) {
  const locked = twinsLocked(game);
  return (r) => {
    const owner = game.routes[r.id];
    if (owner === mark) return 0;
    if (owner) return Infinity;
    if (r.twin) {
      const twinOwner = game.routes[r.twin];
      if (twinOwner === mark) return Infinity; // its twin (cost 0) already links these
      if (twinOwner && locked) return Infinity;
    }
    return r.len;
  };
}

function ticketPlan(game, mark, ticketId, cost) {
  const t = TICKET_BY_ID[ticketId];
  return t ? shortestPath(t.a, t.b, cost) : null;
}

// Best color to pay `route` with from `hand`, or null if unaffordable.
// Prefers the color that uses the fewest wilds.
export function payColor(hand, route) {
  if (route.color !== "gray") {
    if (canPay(hand, route.color, route.len)) return route.color;
    return canPay(hand, "wild", route.len) ? "wild" : null;
  }
  let best = null;
  COLORS.forEach((c) => {
    if (canPay(hand, c, route.len) && (best === null || hand[c] > hand[best])) best = c;
  });
  if (best && hand[best] > 0) return best;
  return canPay(hand, "wild", route.len) ? "wild" : best;
}

function affordable(game, mark, route) {
  const color = payColor(game.players[mark].hand, route);
  if (!color) return null;
  return claimProblem(game, mark, route, color) ? null : color;
}

// The color a still-unaffordable needed route wants us to collect.
function wantColor(hand, route) {
  if (route.color !== "gray") return route.color;
  let best = COLORS[0];
  COLORS.forEach((c) => { if (hand[c] > hand[best]) best = c; });
  return best;
}

function drawFor(game, wanted, tier, rng) {
  const market = [...game.market];
  const picks = [];
  for (let i = 0; i < 2; i += 1) {
    const color = wanted.find((c) => market.includes(c));
    if (color) { picks.push(color); market.splice(market.indexOf(color), 1); } else picks.push("deck");
  }
  if (picks[0] === "deck" && picks[1] === "deck" && tier === 3 && game.market.includes("wild") && rng() < 0.5) return { type: "DRAW", picks: ["wild"] };
  return { type: "DRAW", picks };
}

function randomAction(game, mark, rng) {
  const options = [];
  ROUTES.forEach((r) => {
    const color = affordable(game, mark, r);
    if (color) options.push({ type: "CLAIM", route: r.id, color });
  });
  const faceColors = game.market.filter((c) => c !== "wild");
  options.push({ type: "DRAW", picks: [faceColors.length ? pick(faceColors, rng) : "deck", "deck"] });
  options.push({ type: "DRAW", picks: ["deck", "deck"] });
  return pick(options, rng);
}

export function chooseTracklayersCommit(game, mark, rng) {
  const seat = game.players[mark];
  const tier = tierOf(seat.level);
  if (tier === 1 && rng() < 0.4) return randomAction(game, mark, rng);

  const cost = costFor(game, mark);
  const comps = components(game.routes, mark);
  const need = new Map(); // routeId -> weight
  seat.tickets.forEach((id) => {
    const t = TICKET_BY_ID[id];
    if (!t || comps[t.a] === comps[t.b]) return;
    const plan = ticketPlan(game, mark, id, cost);
    if (!plan || plan.cost > seat.trains + 2) return; // hopeless — don't chase it
    plan.routes.forEach((rid) => {
      if (game.routes[rid]) return;
      need.set(rid, (need.get(rid) || 0) + t.points);
    });
  });

  if (need.size) {
    let best = null;
    need.forEach((weight, rid) => {
      const route = ROUTE_BY_ID[rid];
      const color = affordable(game, mark, route);
      if (!color) return;
      const value = weight + ROUTE_POINTS[route.len] * 2;
      if (!best || value > best.value) best = { value, route, color };
    });
    if (best) return { type: "CLAIM", route: best.route.id, color: best.color };
    const wanted = [...need.keys()]
      .map((rid) => ROUTE_BY_ID[rid])
      .sort((a, b) => need.get(b.id) - need.get(a.id))
      .map((r) => wantColor(seat.hand, r));
    return drawFor(game, [...new Set(wanted)], tier, rng);
  }

  if (tier >= 2 && seat.trains > 12 && game.ticket_deck.length) return { type: "TICKETS" };

  // Nothing to chase: build the longest affordable route (more points per action).
  let longest = null;
  ROUTES.forEach((r) => {
    if (longest && r.len <= longest.route.len) return;
    const color = affordable(game, mark, r);
    if (color) longest = { route: r, color };
  });
  const minLen = tier === 3 && seat.trains > 6 ? 3 : 1;
  if (longest && longest.route.len >= Math.min(minLen, seat.trains)) return { type: "CLAIM", route: longest.route.id, color: longest.color };
  // Collect the color we hold most of, toward a long route.
  const mostHeld = [...COLORS].sort((a, b) => seat.hand[b] - seat.hand[a]);
  return drawFor(game, mostHeld.slice(0, 2), tier, rng);
}

// Which of `offered` tickets to keep (at least `minKeep`).
export function chooseTracklayersKeep(game, mark, offered, minKeep, rng) {
  const seat = game.players[mark];
  const tier = tierOf(seat.level);
  const cost = costFor(game, mark);
  const scored = offered.map((id) => {
    const plan = ticketPlan(game, mark, id, cost);
    const t = TICKET_BY_ID[id];
    return { id, cost: plan ? plan.cost : Infinity, points: t ? t.points : 0 };
  });
  if (tier === 1) {
    const shuffled = [...scored];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.max(minKeep, 1)).map((s) => s.id);
  }
  scored.sort((a, b) => a.cost - b.cost || b.points - a.points);
  const keep = scored.slice(0, minKeep);
  let budget = seat.trains - keep.reduce((sum, s) => sum + (Number.isFinite(s.cost) ? s.cost : 99), 0);
  const extras = tier === 3 ? 1 : 0;
  for (let i = minKeep; i < scored.length && keep.length < minKeep + extras; i += 1) {
    if (scored[i].cost <= 6 && scored[i].cost <= budget) { keep.push(scored[i]); budget -= scored[i].cost; }
  }
  return keep.map((s) => s.id);
}
