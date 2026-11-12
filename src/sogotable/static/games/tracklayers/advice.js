// Tracklayers — client-side ADVICE only (pure; no DOM). Everything here is a
// display hint computed from the projected game: which routes look claimable,
// which colours could pay, whether a ticket already looks connected, and a
// suggested shortest path. None of it is authoritative — the server
// re-validates every COMMIT and decides tickets at the end. A wrong hint costs
// a rejected move with the server's reason, never a hidden rule change.

export const routesOf = (game) => (game && game.map && Array.isArray(game.map.routes) ? game.map.routes : []);
export const citiesOf = (game) => (game && game.map && Array.isArray(game.map.cities) ? game.map.cities : []);
const ownersOf = (game) => (game && game.routes && typeof game.routes === "object" ? game.routes : {});

export function routeById(game, id) {
  return routesOf(game).find((r) => r.id === id) || null;
}

// "free" | "owned" | "twinMine" | "twinLocked" — from my seat's point of view.
export function routeState(game, route, myMark) {
  const owners = ownersOf(game);
  if (owners[route.id]) return "owned";
  if (route.twin && owners[route.twin]) {
    if (owners[route.twin] === myMark) return "twinMine";
    if (game.twins_locked) return "twinLocked";
  }
  return "free";
}

// Ways to pay for a route from a hand (wilds fill the gap automatically).
// Each option is { color, own, wilds } where `color` is what COMMIT sends.
export function payOptions(game, hand, route) {
  if (!hand || !route) return [];
  const wild = Number(hand.wild) || 0;
  const len = route.len;
  const options = [];
  const colors = Array.isArray(game.colors) ? game.colors : [];
  const candidates = route.color === "gray" ? colors : [route.color];
  candidates.forEach((c) => {
    const own = Math.min(Number(hand[c]) || 0, len);
    if (own > 0 && own + wild >= len) options.push({ color: c, own, wilds: len - own });
  });
  if (wild >= len && !options.some((o) => o.wilds === len)) options.push({ color: "wild", own: 0, wilds: len });
  return options;
}

// Why I can't claim (null = looks claimable).
export function claimBlocker(game, seat, route, myMark) {
  const state = routeState(game, route, myMark);
  if (state !== "free") return state;
  if (!seat || (Number(seat.trains) || 0) < route.len) return "trains";
  if (!payOptions(game, seat.hand, route).length) return "cards";
  return null;
}

export function affordableRoutes(game, seat, myMark) {
  if (!seat || !seat.hand) return new Set();
  return new Set(routesOf(game).filter((r) => !claimBlocker(game, seat, r, myMark)).map((r) => r.id));
}

// Union-find over the routes a seat owns.
function components(game, mark) {
  const parent = {};
  const find = (x) => { while (parent[x] && parent[x] !== x) x = parent[x]; return x; };
  const owners = ownersOf(game);
  routesOf(game).forEach((r) => {
    if (owners[r.id] !== mark) return;
    parent[r.a] = parent[r.a] || r.a; parent[r.b] = parent[r.b] || r.b;
    const ra = find(r.a); const rb = find(r.b);
    if (ra !== rb) parent[ra] = rb;
  });
  return (city) => (parent[city] ? find(city) : null);
}

export function ticketsConnected(game, mark, ticketIds) {
  const catalog = game.tickets_catalog || {};
  const root = components(game, mark);
  const out = {};
  (ticketIds || []).forEach((id) => {
    const t = catalog[id];
    if (!t) return;
    const a = root(t.a); const b = root(t.b);
    out[id] = Boolean(a && a === b);
  });
  return out;
}

// Dijkstra from `from` to `to`: my routes cost 0, free routes cost their
// length, anything else is blocked. Returns the route ids on the path or null.
function shortestPath(game, mark, from, to) {
  const edges = {};
  routesOf(game).forEach((r) => {
    const state = routeState(game, r, mark);
    const owner = ownersOf(game)[r.id];
    let cost = null;
    if (owner === mark) cost = 0;
    else if (state === "free") cost = r.len;
    if (cost === null) return;
    (edges[r.a] = edges[r.a] || []).push({ to: r.b, cost, id: r.id });
    (edges[r.b] = edges[r.b] || []).push({ to: r.a, cost, id: r.id });
  });
  const dist = { [from]: 0 };
  const prev = {};
  const open = new Set([from]);
  const done = new Set();
  while (open.size) {
    let cur = null;
    open.forEach((c) => { if (cur === null || dist[c] < dist[cur]) cur = c; });
    open.delete(cur);
    if (cur === to) break;
    done.add(cur);
    (edges[cur] || []).forEach((e) => {
      if (done.has(e.to)) return;
      const d = dist[cur] + e.cost;
      if (dist[e.to] === undefined || d < dist[e.to]) { dist[e.to] = d; prev[e.to] = { city: cur, id: e.id }; open.add(e.to); }
    });
  }
  if (dist[to] === undefined) return null;
  const ids = [];
  for (let c = to; c !== from; c = prev[c].city) ids.push(prev[c].id);
  return ids;
}

// Suggested routes still to claim for my unfinished tickets (+ their cities).
export function suggestedPlan(game, mark, ticketIds) {
  const catalog = game.tickets_catalog || {};
  const owners = ownersOf(game);
  const routes = new Set();
  const cities = new Set();
  (ticketIds || []).forEach((id) => {
    const t = catalog[id];
    if (!t) return;
    cities.add(t.a); cities.add(t.b);
    const path = shortestPath(game, mark, t.a, t.b);
    if (path) path.forEach((rid) => { if (owners[rid] !== mark) routes.add(rid); });
  });
  return { routes, cities };
}
