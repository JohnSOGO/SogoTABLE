// Chinese Checkers over the real room API: lobby create/join + a bot, host
// start with cc_options, hidden simultaneous commits through the per-viewer
// projection (legal/stops trimmed, other seats' commits masked), stale round
// rejected loudly, duplicate ignored, then a scripted playout to completion.
import assert from "node:assert/strict";
import test from "node:test";
import { makeEnv, player, post, get, CHINESE_CHECKERS_GAME_ID } from "./helpers.js";
import { setChineseCheckersNow } from "../games/chinese-checkers/rules.js";

const dist = (a, b) => {
  const [aq, ar] = a.split(",").map(Number);
  const [bq, br] = b.split(",").map(Number);
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
};
const TIPS = ["-4,8", "-8,4", "-4,-4", "4,-8", "8,-4", "4,4"];

// Scripted human: the stop that gains the most toward the goal tip, with a
// path walked through the projected hops graph (exactly what the client does).
function bestMove(view, mark) {
  const seat = view.players.find((p) => p.mark === mark);
  const tip = TIPS[seat.goal_arm];
  let best = null;
  for (const [from, info] of Object.entries(view.legal[mark] || {})) {
    for (const to of view.stops[mark][from]) {
      const gain = dist(from, tip) - dist(to, tip);
      if (best && gain <= best.gain) continue;
      const path = info.steps.includes(to) ? [to] : hopPath(info.hops, from, to);
      if (path) best = { from, path, gain };
    }
  }
  return best;
}
function hopPath(hops, from, to) {
  const parent = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    if (node === to) break;
    for (const next of hops[node] || []) {
      if (!parent.has(next)) { parent.set(next, node); queue.push(next); }
    }
  }
  if (!parent.has(to)) return null;
  const path = [];
  for (let n = to; n !== from; n = parent.get(n)) path.unshift(n);
  return path;
}

test("Chinese Checkers plays end-to-end over the room API", async () => {
  const env = makeEnv();
  const host = player("cc-host", "Host");
  const guest = player("cc-guest", "Guest");
  await post(env, "/api/room/create", { game_id: "chinese_checkers", player: host, code: "STAR" });
  await post(env, "/api/room/join", { code: "STAR", player: guest });
  const bots = await get(env, "/api/bots?game_id=chinese_checkers");
  const joined = await post(env, "/api/room/join-bot", { code: "STAR", host_id: host.id, bot_id: bots.bots[2].id });
  assert.equal(joined.ok, true, joined.error);
  const started = await post(env, "/api/room/start", {
    code: "STAR", host_id: host.id,
    cc_options: { marbles: 6, jumps: "long", capture: "nope", end: "first" },
  });
  assert.equal(started.ok, true, started.error);
  let game = started.room.game;
  assert.equal(game.game_id, CHINESE_CHECKERS_GAME_ID);
  assert.equal(game.options.marbles, 6);
  assert.equal(game.options.jumps, "long");
  assert.equal(game.options.capture, "off", "clamped");
  assert.equal(game.cells.length, 121);
  assert.equal(Object.keys(game.marbles).length, 18);

  const markOf = (p) => started.room.players.find((s) => s.id === p.id).mark;
  const view = async (p) => (await get(env, `/api/room?code=STAR&player_id=${p.id}`)).room.game;
  const act = (p, action) => post(env, "/api/room/move", { code: "STAR", player_id: p.id, action });

  // Viewer trimming.
  const hostView = await view(host);
  assert.deepEqual(Object.keys(hostView.legal), [markOf(host)]);
  assert.deepEqual(Object.keys(hostView.stops), [markOf(host)]);

  // Stale round rejected loudly, nothing committed.
  const pick = bestMove(hostView, markOf(host));
  const stale = await act(host, { type: "MOVE", round: hostView.round + 3, from: pick.from, path: pick.path });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /round/);

  // Host commits; the guest sees "committed" but not the move.
  const ok = await act(host, { type: "MOVE", round: hostView.round, from: pick.from, path: pick.path });
  assert.equal(ok.ok, true, ok.error);
  const guestView = await view(guest);
  const hostSeat = guestView.players.find((s) => s.mark === markOf(host));
  assert.equal(hostSeat.committed, true);
  assert.equal(hostSeat.commit, null);
  assert.deepEqual((await view(host)).players.find((s) => s.mark === markOf(host)).commit, { from: pick.from, path: pick.path });
  // Duplicate commit is ignored (first commit wins).
  const dup = await act(host, { type: "PASS", round: hostView.round });
  assert.equal(dup.ok, true, dup.error);
  assert.deepEqual((await view(host)).players.find((s) => s.mark === markOf(host)).commit, { from: pick.from, path: pick.path });

  // Play out: both humans commit their best move each round (bot commits at close).
  let guard = 0;
  game = guestView;
  while (game.status !== "complete" && guard++ < 300) {
    for (const p of [guest, host]) {
      const g = await view(p);
      if (g.status === "complete") { game = g; break; }
      const seat = g.players.find((s) => s.mark === markOf(p));
      if (seat.committed || seat.finished) continue;
      const m = bestMove(g, markOf(p));
      const res = await act(p, m ? { type: "MOVE", round: g.round, from: m.from, path: m.path } : { type: "PASS", round: g.round });
      assert.equal(res.ok, true, res.error);
      game = res.room.game;
    }
  }
  assert.equal(game.status, "complete");
  assert.ok(game.winners.length >= 1);
  assert.equal(game.results.length, 3);
  assert.ok(game.events.some((e) => e.type === "end"));
});

test("Chinese Checkers blitz over the room API: deadline + server_now, immediate move, TICK closes the round", async () => {
  let clock = 5_000_000;
  setChineseCheckersNow(() => clock);
  try {
    const env = makeEnv();
    const host = player("ccb-host", "Host");
    const guest = player("ccb-guest", "Guest");
    await post(env, "/api/room/create", { game_id: "chinese_checkers", player: host, code: "BLTZ" });
    await post(env, "/api/room/join", { code: "BLTZ", player: guest });
    const started = await post(env, "/api/room/start", { code: "BLTZ", host_id: host.id, cc_options: { mode: "blitz", timer: 8 } });
    assert.equal(started.ok, true, started.error);
    const markOf = (p) => started.room.players.find((s) => s.id === p.id).mark;
    const view = async (p) => (await get(env, `/api/room?code=BLTZ&player_id=${p.id}`)).room.game;
    const act = (p, action) => post(env, "/api/room/move", { code: "BLTZ", player_id: p.id, action });
    let g = await view(host);
    assert.equal(g.options.mode, "blitz");
    assert.equal(g.deadline, 5_008_000);
    assert.equal(g.server_now, 5_000_000);
    const pick = bestMove(g, markOf(host));
    clock += 1000;
    const moved = await act(host, { type: "MOVE", round: g.round, from: pick.from, path: pick.path });
    assert.equal(moved.ok, true, moved.error);
    g = await view(guest);
    assert.equal(g.marbles[pick.path[pick.path.length - 1]], markOf(host), "applied immediately");
    assert.equal(g.players.find((p) => p.mark === markOf(host)).moved, true);
    assert.equal((await act(guest, { type: "TICK" })).ok, true, "early TICK is a no-op");
    assert.equal((await view(guest)).round, 1);
    clock = 5_008_000;
    const ticked = await act(guest, { type: "TICK" });
    assert.equal(ticked.ok, true, ticked.error);
    g = await view(guest);
    assert.equal(g.round, 2);
    assert.equal(g.deadline, 5_016_000);
    assert.ok(g.events.some((e) => e.type === "timeout" && e.mark === markOf(guest) && e.round === 1));
  } finally {
    setChineseCheckersNow(null);
  }
});
