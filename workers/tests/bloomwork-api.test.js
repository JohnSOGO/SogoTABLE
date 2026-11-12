// Bloomwork over the real room API: lobby create/join + a bot, host start
// with bloom_options, simultaneous PICK commits through the per-viewer
// projection (other seats' picks masked), stale picks rejected, full playout
// to a completed game with stats-ready scores.
import assert from "node:assert/strict";
import test from "node:test";
import { makeEnv, player, post, get } from "./helpers.js";

const BLOOMWORK_GAME_ID = "9e962268ca5f";

test("Bloomwork plays end-to-end over the room API", async () => {
  const env = makeEnv();
  const host = player("bw-host", "Host");
  const guest = player("bw-guest", "Guest");
  await post(env, "/api/room/create", { game_id: "bloomwork", player: host, code: "BLMW" });
  await post(env, "/api/room/join", { code: "BLMW", player: guest });
  const started = await post(env, "/api/room/start", { code: "BLMW", host_id: host.id, bloom_options: { length: "quick", helps: "off" } });
  assert.equal(started.ok, true, started.error);
  let game = started.room.game;
  assert.equal(game.game_id, BLOOMWORK_GAME_ID);
  assert.deepEqual(game.options, { length: "quick", helps: false });
  assert.equal(game.bag, undefined, "bag order never leaves the Worker");
  assert.equal(game.stalls.length, 5);

  const markOf = (p) => started.room.players.find((s) => s.id === p.id).mark;
  const view = async (p) => (await get(env, `/api/room?code=BLMW&player_id=${p.id}`)).room.game;
  const pick = (p, action) => post(env, "/api/room/move", { code: "BLMW", player_id: p.id, action: { type: "PICK", ...action } });
  const firstPick = (g) => {
    const i = g.stalls.findIndex((s) => s.length);
    const source = i >= 0 ? i : "center";
    return { round: g.round, pick: g.pick, source, flower: (i >= 0 ? g.stalls[i] : g.center)[0], row: -1 };
  };

  const stale = await pick(host, { ...firstPick(game), round: game.round + 3 });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /Refresh to catch up/);

  const hostPick = await pick(host, firstPick(game));
  assert.equal(hostPick.ok, true, hostPick.error);
  const guestView = await view(guest);
  const hostSeat = guestView.players.find((s) => s.mark === markOf(host));
  assert.equal(hostSeat.has_committed, true);
  assert.equal(hostSeat.committed, null, "the guest can't see the host's pick");
  assert.ok((await view(host)).players.find((s) => s.mark === markOf(host)).committed, "the host sees their own pick");

  let guard = 0;
  game = await view(guest);
  while (game.status !== "complete" && guard++ < 600) {
    for (const p of [guest, host]) {
      const g = await view(p);
      if (g.status === "complete") break;
      const me = g.players.find((s) => s.mark === markOf(p));
      if (g.phase === "review") {
        if (!me.ready_next) await post(env, "/api/room/move", { code: "BLMW", player_id: p.id, action: { type: "READY_NEXT", round: g.round } });
      } else if (!me.has_committed) {
        const res = await pick(p, firstPick(g));
        assert.equal(res.ok, true, res.error);
      }
    }
    game = await view(guest);
  }
  assert.equal(game.status, "complete");
  assert.ok(game.round <= 5, "quick game");
  assert.ok(Array.isArray(game.results) && game.results.length === 2);
  assert.ok(game.winner);
});
