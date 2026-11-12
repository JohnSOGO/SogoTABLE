// Tracklayers — route-graph queries over the Lantern Isles map. Pure: reads
// map.js data and an owner map `{ [routeId]: mark }`, never mutates.
//   • ticketDone      — are a ticket's two cities joined by one seat's routes?
//   • longestPath     — longest continuous line of one seat's routes (edges
//                       can't repeat, cities can) — exhaustive edge-unique DFS.
//   • shortestPath    — Dijkstra with a caller cost per route (bots).
import { CITIES, ROUTES, TICKETS } from "./map.js";

export const ROUTE_BY_ID = Object.freeze(Object.fromEntries(ROUTES.map((r) => [r.id, r])));
export const CITY_BY_ID = Object.freeze(Object.fromEntries(CITIES.map((c) => [c.id, c])));
export const TICKET_BY_ID = Object.freeze(Object.fromEntries(TICKETS.map((t) => [t.id, t])));

// city id → [routes touching it]
const ADJ = (() => {
  const adj = {};
  CITIES.forEach((c) => { adj[c.id] = []; });
  ROUTES.forEach((r) => { adj[r.a].push(r); adj[r.b].push(r); });
  return adj;
})();

export const other = (route, city) => (route.a === city ? route.b : route.a);

export function ownedRoutes(owners, mark) {
  return ROUTES.filter((r) => owners[r.id] === mark);
}

// Union-find components of one seat's network: city → root.
export function components(owners, mark) {
  const parent = {};
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  CITIES.forEach((c) => { parent[c.id] = c.id; });
  ownedRoutes(owners, mark).forEach((r) => { parent[find(r.a)] = find(r.b); });
  const out = {};
  CITIES.forEach((c) => { out[c.id] = find(c.id); });
  return out;
}

export function ticketDone(owners, mark, ticketId, comps = null) {
  const t = TICKET_BY_ID[ticketId];
  if (!t) return false;
  const c = comps || components(owners, mark);
  return c[t.a] === c[t.b];
}

// Longest edge-unique walk through a seat's routes, in cars. Exhaustive DFS
// from every endpoint; a seat owns at most ~20 routes so this stays cheap.
export function longestPath(owners, mark) {
  const mine = ownedRoutes(owners, mark);
  if (!mine.length) return 0;
  const adj = {};
  mine.forEach((r, i) => {
    (adj[r.a] = adj[r.a] || []).push(i);
    (adj[r.b] = adj[r.b] || []).push(i);
  });
  const used = new Array(mine.length).fill(false);
  let best = 0;
  const dfs = (city, length) => {
    if (length > best) best = length;
    for (const i of adj[city]) {
      if (used[i]) continue;
      used[i] = true;
      dfs(other(mine[i], city), length + mine[i].len);
      used[i] = false;
    }
  };
  Object.keys(adj).forEach((city) => dfs(city, 0));
  return best;
}

// Dijkstra from city `from` to `to`. `costOf(route)` returns a non-negative
// number, or Infinity to block the route. Returns { cost, routes: [ids] } or
// null when unreachable. 29 cities — a linear-scan queue is plenty.
export function shortestPath(from, to, costOf) {
  if (!ADJ[from] || !ADJ[to]) return null;
  const dist = { [from]: 0 };
  const via = {};
  const done = new Set();
  for (;;) {
    let city = null;
    let d = Infinity;
    for (const c of Object.keys(dist)) {
      if (!done.has(c) && dist[c] < d) { d = dist[c]; city = c; }
    }
    if (city === null) return null;
    if (city === to) break;
    done.add(city);
    for (const r of ADJ[city]) {
      const cost = costOf(r);
      if (!(cost < Infinity)) continue;
      const next = other(r, city);
      const nd = d + cost;
      if (dist[next] === undefined || nd < dist[next]) { dist[next] = nd; via[next] = r.id; }
    }
  }
  const routes = [];
  let at = to;
  while (at !== from) {
    const r = ROUTE_BY_ID[via[at]];
    routes.push(r.id);
    at = other(r, at);
  }
  return { cost: dist[to], routes: routes.reverse() };
}
