// Realmwright over the real room API: lobby create/join, host start with
// realm_options, parallel PLACE_TILE commits from both seats through the
// per-viewer projection (legal trimmed to the requester), stale + contested
// placements rejected loudly, full playout to a completed game.
import assert from "node:assert/strict";
import test from "node:test";
import { makeEnv, player, post, get, REALMWRIGHT_GAME_ID } from "./helpers.js";

test("Realmwright plays end-to-end over the room API", async () => {
  const env = makeEnv();
  const host = player("rw-host", "Host");
  const guest = player("rw-guest", "Guest");
  await post(env, "/api/room/create", { game_id: "realmwright", player: host, code: "REAL" });
  await post(env, "/api/room/join", { code: "REAL", player: guest });
  const started = await post(env, "/api/room/start", {
    code: "REAL", host_id: host.id,
    realm_options: { farmers: "off", meeples: 5, deck: "quick", live_tally: true, small_city: true },
  });
  assert.equal(started.ok, true, started.error);
  let game = started.room.game;
  assert.equal(game.game_id, REALMWRIGHT_GAME_ID);
  assert.equal(game.options.farmers, "off");
  assert.equal(game.options.meeples, 5);
  assert.equal(game.options.deck, "quick");
  assert.equal(game.bag, undefined, "bag order never leaves the Worker");
  assert.equal(game.board.length, 1, "start tile only");

  const markOf = (p) => started.room.players.find((s) => s.id === p.id).mark;
  const view = async (p) => (await get(env, `/api/room?code=REAL&player_id=${p.id}`)).room.game;
  const place = (p, action) => post(env, "/api/room/move", { code: "REAL", player_id: p.id, action: { type: "PLACE_TILE", ...action } });

  // Viewer trimming: each seat only sees its own legal list.
  const hostView = await view(host);
  assert.deepEqual(Object.keys(hostView.legal), [markOf(host)]);

  // Stale round is rejected loudly and changes nothing.
  const hostSeat = hostView.players.find((s) => s.mark === markOf(host));
  const first = hostView.legal[markOf(host)][0];
  const stale = await place(host, { round: hostView.round + 5, serial: hostSeat.tile_serial, x: first.x, y: first.y, r: first.r, meeple: null });
  assert.equal(stale.ok, false);
  assert.equal((await view(host)).board.length, 1);

  // Race: host takes a cell; guest aiming at the SAME cell is rejected with a reason.
  const guestView = await view(guest);
  const guestSeat = guestView.players.find((s) => s.mark === markOf(guest));
  const ok = await place(host, { round: hostView.round, serial: hostSeat.tile_serial, x: first.x, y: first.y, r: first.r, meeple: null });
  assert.equal(ok.ok, true, ok.error);
  const contested = await place(guest, { round: guestView.round, serial: guestSeat.tile_serial, x: first.x, y: first.y, r: 0, meeple: null });
  assert.equal(contested.ok, false);
  assert.match(contested.error, /built there|taken|occupied|no longer/i);
  // Duplicate submit from the host is rejected (already placed this round).
  const dup = await place(host, { round: hostView.round, serial: hostSeat.tile_serial, x: first.x, y: first.y, r: first.r, meeple: null });
  assert.equal(dup.ok, false);

  // Play the rest out: whoever still holds a tile places its first legal option.
  let guard = 0;
  game = await view(guest);
  while (game.status !== "complete" && guard++ < 400) {
    let moved = false;
    for (const p of [guest, host]) {
      const g = await view(p);
      const seat = g.players.find((s) => s.mark === markOf(p));
      if (!seat.tile || seat.placed) continue;
      const pick = g.legal[markOf(p)][0];
      const res = await place(p, { round: g.round, serial: seat.tile_serial, x: pick.x, y: pick.y, r: pick.r, meeple: pick.meeples.length ? pick.meeples[0] : null });
      assert.equal(res.ok, true, res.error);
      game = res.room.game;
      moved = true;
    }
    assert.ok(moved || game.status === "complete", "someone could always act");
  }
  assert.equal(game.status, "complete");
  assert.equal(game.results.length, 2);
  assert.ok(game.winner);
  assert.equal(game.players.every((s) => s.score === s.breakdown.city + s.breakdown.road + s.breakdown.cloister + s.breakdown.field), true);
});
