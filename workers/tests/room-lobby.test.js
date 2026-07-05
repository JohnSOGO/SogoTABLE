// Pre-game lobby lifecycle over the room API. First file of the per-domain
// split of sogotable-api.test.js (review #5): that file is at its pinned cap —
// new room-lifecycle tests land HERE, and moves out of the big file shrink it.
import assert from "node:assert/strict";
import test from "node:test";
import { makeEnv, post, get, player } from "./helpers.js";

test("host can remove an invited bot before start; marks re-pack gap-free", async () => {
  const env = makeEnv();
  const host = player("h", "Host");
  await post(env, "/api/room/create", { game_id: "hearts", player: host, code: "KICK" });
  const bots = await get(env, "/api/bots?game_id=hearts");
  for (let i = 0; i < 3; i += 1) {
    await post(env, "/api/room/join-bot", { code: "KICK", host_id: host.id, bot_id: bots.bots[i].id });
  }
  // Remove the MIDDLE bot: survivors must re-pack to P1..P3 so the next
  // joiner can't collide with a surviving higher mark.
  const removed = await post(env, "/api/room/remove-bot", { code: "KICK", host_id: host.id, bot_id: bots.bots[1].id });
  assert.equal(removed.ok, true);
  assert.deepEqual(removed.room.players.map((seat) => seat.mark), ["P1", "P2", "P3"]);
  assert.equal(removed.room.players.some((seat) => seat.id === bots.bots[1].id), false);
  const rejoined = await post(env, "/api/room/join-bot", { code: "KICK", host_id: host.id, bot_id: bots.bots[1].id });
  assert.deepEqual(rejoined.room.players.map((seat) => seat.mark), ["P1", "P2", "P3", "P4"]);

  // Guards: only the host, only bots, only before the start.
  const guest = player("g", "Guest");
  await post(env, "/api/players/create", { player: guest });
  const nonHost = await post(env, "/api/room/remove-bot", { code: "KICK", host_id: guest.id, bot_id: bots.bots[0].id });
  assert.match(nonHost.error, /Only the host/);
  const notBot = await post(env, "/api/room/remove-bot", { code: "KICK", host_id: host.id, bot_id: host.id });
  assert.match(notBot.error, /not at this table/);
  await post(env, "/api/room/start", { code: "KICK", host_id: host.id });
  const started = await post(env, "/api/room/remove-bot", { code: "KICK", host_id: host.id, bot_id: bots.bots[0].id });
  assert.match(started.error, /already started/);
});
