import assert from "node:assert/strict";
import test from "node:test";
import {
  EventHubDurableObject, RoomDurableObject, RoomFactoryDurableObject, tenThousandTest,
  MockHibernatedSocket, MockRateLimitBinding,
  CLASSIC_GAME_ID, TACTICAL_GAME_ID, BOXES_GAME_ID, BATTLESHIP_GAME_ID, QUORIDOR_GAME_ID, TEN_THOUSAND_GAME_ID, YAHTZEE_GAME_ID, HEX_ID_PATTERN,
  makeEnv, makeProductionEnv, makeStrictEnvWithRooms, makeEnvWithRooms, makeEnvWithEvents,
  player, request, get, post, createActiveRoom, withMockRandom, mutateState, stateData,
} from "./helpers.js";

test("creates, lists, and deletes players", async () => {
  const env = makeEnv();
  const created = await post(env, "/api/players/create", { player: player("p1", "Player One") });

  assert.equal(created.ok, true);
  assert.equal(created.player.name, "Player One");

  const listed = await get(env, "/api/players");
  assert.deepEqual(listed.players.map((item) => item.id), ["p1"]);

  const deleted = await post(env, "/api/players/delete", { id: "p1" });
  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.players, []);
});

test("player owner tokens are returned once and protect profile mutations", async () => {
  const env = makeProductionEnv();
  const created = await post(env, "/api/players/create", { player: player("p1", "Player One") });
  const listed = await get(env, "/api/players");
  const missingEdit = await post(env, "/api/players/create", { player: player("p1", "Renamed") });
  const wrongDelete = await post(env, "/api/players/delete", { id: "p1", owner_token: "wrong" });
  const edited = await post(env, "/api/players/create", { player: player("p1", "Renamed"), owner_token: created.owner_token });
  const deleted = await post(env, "/api/players/delete", { id: "p1", owner_token: created.owner_token });

  assert.equal(created.ok, true);
  assert.equal(typeof created.owner_token, "string");
  assert.equal(created.owner_token.length > 20, true);
  assert.equal("owner_token_hash" in created.player, false);
  assert.equal("owner_token_hash" in listed.players[0], false);
  assert.equal("owner_token" in listed.players[0], false);
  assert.equal(missingEdit.ok, false);
  assert.equal(missingEdit.error, "Player owner token is required.");
  assert.equal(wrongDelete.ok, false);
  assert.equal(wrongDelete.error, "Player owner token is incorrect.");
  assert.equal(edited.ok, true);
  assert.equal(edited.player.name, "Renamed");
  assert.equal("owner_token" in edited, false);
  assert.equal(deleted.ok, true);
});

test("legacy players can be claimed once", async () => {
  const env = makeProductionEnv();
  const created = await post(env, "/api/players/create", { player: player("legacy", "Legacy") });
  mutateState(env, (data) => {
    delete data.players.find((item) => item.id === "legacy").owner_token_hash;
  });

  const claimed = await post(env, "/api/player/claim", { player_id: "legacy" });
  const repeat = await post(env, "/api/player/claim", { player_id: "legacy" });
  const edited = await post(env, "/api/players/create", { player: player("legacy", "Claimed"), owner_token: claimed.owner_token });

  assert.equal(created.ok, true);
  assert.equal(claimed.ok, true);
  assert.equal(typeof claimed.owner_token, "string");
  assert.equal(repeat.ok, false);
  assert.equal(repeat.error, "Player is already claimed.");
  assert.equal(edited.ok, true);
  assert.equal(edited.player.name, "Claimed");
});

test("Sogo superuser unclaim releases a player for re-claiming", async () => {
  const env = makeProductionEnv();
  await post(env, "/api/players/create", { player: player("sogo-id", "Sogo") });
  await post(env, "/api/players/create", { player: player("toast", "Toast") });

  // Toast is claimed on creation, so another device's claim is rejected.
  const blocked = await post(env, "/api/player/claim", { player_id: "toast" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "Player is already claimed.");

  // A non-superuser requester cannot unclaim.
  const notSuper = await post(env, "/api/player/unclaim", { requester_id: "toast", player_id: "toast", passcode: "1234" });
  assert.equal(notSuper.ok, false);

  // The wrong passcode cannot unclaim.
  const wrongPass = await post(env, "/api/player/unclaim", { requester_id: "sogo-id", player_id: "toast", passcode: "0000" });
  assert.equal(wrongPass.ok, false);

  // Superuser + correct passcode releases the claim without needing the owner token.
  const unclaimed = await post(env, "/api/player/unclaim", { requester_id: "sogo-id", player_id: "toast", passcode: "1234" });
  assert.equal(unclaimed.ok, true);
  assert.equal(unclaimed.player.claimed, false);

  // The freed player can now be claimed by a fresh device.
  const reclaimed = await post(env, "/api/player/claim", { player_id: "toast" });
  assert.equal(reclaimed.ok, true);
  assert.equal(typeof reclaimed.owner_token, "string");
});

test("Reclaim moves a regular player with no passcode; only Sogo needs one", async () => {
  const env = makeProductionEnv();
  // Toast is claimed on creation; deviceA holds its only owner token.
  const deviceA = await post(env, "/api/players/create", { player: player("toast", "Toast") });
  assert.equal(typeof deviceA.owner_token, "string");

  // The ordinary claim path still blocks a second device.
  const blocked = await post(env, "/api/player/claim", { player_id: "toast" });
  assert.equal(blocked.error, "Player is already claimed.");

  // A regular player moves to a new device with NO passcode (family trust).
  const deviceB = await post(env, "/api/player/reclaim", { player_id: "toast" });
  assert.equal(deviceB.ok, true);
  assert.equal(deviceB.player.claimed, true);
  assert.equal(typeof deviceB.owner_token, "string");
  assert.notEqual(deviceB.owner_token, deviceA.owner_token);

  // The move invalidates deviceA's token but authorizes deviceB's.
  const oldTokenAction = await post(env, "/api/players/create", { player: player("toast", "Toast A"), owner_token: deviceA.owner_token });
  assert.equal(oldTokenAction.ok, false);
  const newTokenAction = await post(env, "/api/players/create", { player: player("toast", "Toast B"), owner_token: deviceB.owner_token });
  assert.equal(newTokenAction.ok, true);

  // The Sogo ADMIN account still requires the passcode.
  await post(env, "/api/players/create", { player: player("sogo-id", "Sogo") });
  const sogoNoPass = await post(env, "/api/player/reclaim", { player_id: "sogo-id" });
  assert.equal(sogoNoPass.ok, false);
  assert.equal(sogoNoPass.error, "Sogo passcode is incorrect.");
  const sogoWrong = await post(env, "/api/player/reclaim", { player_id: "sogo-id", passcode: "0000" });
  assert.equal(sogoWrong.error, "Sogo passcode is incorrect.");
  const sogoOk = await post(env, "/api/player/reclaim", { player_id: "sogo-id", passcode: "1234" });
  assert.equal(sogoOk.ok, true);

  // An unknown player cannot be reclaimed.
  const missing = await post(env, "/api/player/reclaim", { player_id: "ghost" });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "Player not found.");
});

test("Sogo superuser can cancel a pending invite to free a stuck target", async () => {
  const env = makeEnv();
  await post(env, "/api/players/create", { player: player("sogo-id", "Sogo") });
  await post(env, "/api/room/create", { game_id: "battleship", player: player("sogo-id", "Sogo"), code: "INVT" });
  await post(env, "/api/invite/create", { code: "INVT", host_id: "sogo-id", player: player("toast", "Toast") });

  const before = await get(env, "/api/invites?player_id=toast");
  assert.equal(before.invites.length, 1);

  // A non-superuser cannot cancel.
  const notSuper = await post(env, "/api/invite/cancel", { requester_id: "toast", target_id: "toast", passcode: "1234" });
  assert.equal(notSuper.ok, false);

  // The wrong passcode cannot cancel.
  const wrongPass = await post(env, "/api/invite/cancel", { requester_id: "sogo-id", target_id: "toast", passcode: "0000" });
  assert.equal(wrongPass.ok, false);

  // Superuser + correct passcode deletes the invite.
  const cancelled = await post(env, "/api/invite/cancel", { requester_id: "sogo-id", target_id: "toast", passcode: "1234" });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.removed.length, 1);

  const after = await get(env, "/api/invites?player_id=toast");
  assert.equal(after.invites.length, 0);
});

test("Bug reports are stored and listed for the Sogo superuser passcode", async () => {
  const env = makeProductionEnv();
  const sent = await post(env, "/api/bug-report", {
    description: "Dice did not roll",
    player_name: "Sogo",
    screen: "In Game",
    game: "Ten Thousand",
    room_code: "ABCD",
  });
  assert.equal(sent.ok, true);
  assert.ok(sent.id);

  const empty = await post(env, "/api/bug-report", { description: "   " });
  assert.equal(empty.ok, false);
  assert.equal(empty.error, "Bug description is required.");

  const wrong = await post(env, "/api/bug-reports/list", { passcode: "0000" });
  assert.equal(wrong.ok, false);

  const listed = await post(env, "/api/bug-reports/list", { passcode: "1234" });
  assert.equal(listed.ok, true);
  assert.equal(listed.reports.length, 1);
  assert.equal(listed.reports[0].description, "Dice did not roll");
  assert.equal(listed.reports[0].screen, "In Game");
  assert.equal(listed.reports[0].room_code, "ABCD");

  // The wrong passcode cannot clear; the correct one empties the store.
  const wrongClear = await post(env, "/api/bug-reports/clear", { passcode: "0000" });
  assert.equal(wrongClear.ok, false);
  const stillThere = await post(env, "/api/bug-reports/list", { passcode: "1234" });
  assert.equal(stillThere.reports.length, 1);

  const cleared = await post(env, "/api/bug-reports/clear", { passcode: "1234" });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.cleared, 1);
  const afterClear = await post(env, "/api/bug-reports/list", { passcode: "1234" });
  assert.equal(afterClear.reports.length, 0);
});

test("rate limits mutating API requests before state writes", async () => {
  const env = makeEnv();
  env.API_MUTATION_RATE_LIMITER = new MockRateLimitBinding(0);
  const { response, json } = await request(env, "POST", "/api/players/create", { player: player("limited", "Limited") }, { "CF-Connecting-IP": "203.0.113.10" });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(json.ok, false);
  assert.equal(json.error, "Too many requests. Try again shortly.");
  assert.deepEqual(env.API_MUTATION_RATE_LIMITER.calls, ["mutation:203.0.113.10"]);
  assert.equal(env.SOGOTABLE_STATE.writeCount, 0);
});

test("rate limiting does not apply to read-only API requests", async () => {
  const env = makeEnv();
  env.API_MUTATION_RATE_LIMITER = new MockRateLimitBinding(0);
  const games = await get(env, "/api/games", { "CF-Connecting-IP": "203.0.113.11" });

  assert.equal(games.ok, true);
  assert.equal(env.API_MUTATION_RATE_LIMITER.calls.length, 0);
});

test("superuser verification has a stricter rate limit", async () => {
  const env = makeEnv();
  env.API_MUTATION_RATE_LIMITER = new MockRateLimitBinding(10);
  env.SUPERUSER_RATE_LIMITER = new MockRateLimitBinding(0);
  const { response, json } = await request(env, "POST", "/api/superuser/verify", { requester_id: "sogo-id", passcode: "1234" }, { "CF-Connecting-IP": "203.0.113.12" });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(json.ok, false);
  assert.equal(json.error, "Too many superuser attempts. Try again shortly.");
  assert.deepEqual(env.SUPERUSER_RATE_LIMITER.calls, ["superuser:203.0.113.12"]);
  assert.equal(env.API_MUTATION_RATE_LIMITER.calls.length, 0);
  assert.equal(env.SOGOTABLE_STATE.writeCount, 0);
});

test("reserved Codex test players are hidden from public roster and lobby", async () => {
  const env = makeEnv();
  await post(env, "/api/players/create", { player: { id: "codex-test-player-1" } });
  await post(env, "/api/lobby/presence", { game_id: "super_tic_tac_toe", id: "codex-test-player-1" });

  const listed = await get(env, "/api/players");
  const lobby = await get(env, "/api/lobby?game_id=super_tic_tac_toe");

  assert.equal(listed.players.some((item) => item.id === "codex-test-player-1"), false);
  assert.equal(lobby.players.some((item) => item.id === "codex-test-player-1"), false);
});

test("reserved Codex test rooms are hidden from public room lists", async () => {
  const env = makeEnv();
  await post(env, "/api/players/create", { player: { id: "codex-test-player-1" } });
  await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: { id: "codex-test-player-1" }, code: "HIDE" });

  const publicRooms = await get(env, "/api/rooms?game_id=super_tic_tac_toe");
  const ownRoom = await get(env, "/api/rooms?game_id=super_tic_tac_toe&player_id=codex-test-player-1");

  assert.equal(publicRooms.rooms.some((room) => room.code === "HIDE"), false);
  assert.equal(ownRoom.active_room.code, "HIDE");
});

test("lists ready games from the hosted game registry", async () => {
  const env = makeEnv();
  const listed = await get(env, "/api/games");

  assert.equal(listed.ok, true);
  assert.deepEqual(listed.games.map((game) => game.id), [CLASSIC_GAME_ID, TACTICAL_GAME_ID, BOXES_GAME_ID, BATTLESHIP_GAME_ID, QUORIDOR_GAME_ID, TEN_THOUSAND_GAME_ID, YAHTZEE_GAME_ID]);
  assert.deepEqual(listed.games.map((game) => game.availability), ["ready", "ready", "ready", "ready", "ready", "ready", "ready"]);
  assert.equal(listed.games[0].name, "Super Tic Tac Toe");
  assert.equal(listed.games[1].name, "Super Tic Tactical Toe");
  assert.equal(listed.games[2].name, "Dots and Boxes");
  assert.equal(listed.games[3].name, "Battleship");
  assert.equal(listed.games[4].name, "Quoridor");
  assert.equal(listed.games[5].name, "10,000");
  assert.equal(listed.games[5].player_count, null);
  assert.equal(listed.games[6].name, "Yahtzee");
  assert.equal(listed.games.every((game) => HEX_ID_PATTERN.test(game.id)), true);
  assert.equal(listed.games.every((game) => typeof game.summary === "string" && game.summary.length > 0), true);
});

const YZ_CATS = ["ones", "twos", "threes", "fours", "fives", "sixes", "threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "yahtzee", "chance"];
async function playYahtzeeGame(env, code, playerId, value = 5) {
  let res;
  for (const category of YZ_CATS) {
    res = await post(env, "/api/room/move", { code, player_id: playerId, action: { type: "SCORE", category, value } });
  }
  return res;
}

test("Yahtzee series: solo seat advances through 6 games to completion", async () => {
  const env = makeEnv();
  const host = player("solo", "Solo Player");
  const created = await post(env, "/api/room/create", { game_id: "yahtzee", player: host, code: "YTZ1" });
  assert.equal(created.room.players[0].mark, "P1");
  const started = await post(env, "/api/room/start", { code: "YTZ1", host_id: host.id });
  assert.equal(started.room.game.game_id, YAHTZEE_GAME_ID);
  assert.equal(started.room.game.players[0].game_index, 1);
  assert.equal(started.room.game.players[0].finish_state, "playing");

  // five full games: the seat advances to game 6 but is not finished
  let res;
  for (let g = 0; g < 5; g += 1) res = await playYahtzeeGame(env, "YTZ1", host.id, 4);
  let seat = res.room.game.players[0];
  assert.equal(seat.game_index, 6);
  assert.equal(seat.round, 0);
  assert.equal(seat.finish_state, "playing");
  assert.equal(seat.overall, 5 * 13 * 4);

  // the sixth game completes the series
  res = await playYahtzeeGame(env, "YTZ1", host.id, 4);
  seat = res.room.game.players[0];
  assert.equal(seat.game_index, 6);
  assert.equal(seat.round, 13);
  assert.equal(seat.finish_state, "complete");
  assert.equal(seat.overall, 6 * 13 * 4);
  assert.equal(res.room.game.status, "complete");
  assert.equal(res.room.game.winner, "P1");
});

test("Yahtzee series: a bot is paced to the human across the series", async () => {
  const env = makeEnv();
  const host = player("h", "Host");
  await post(env, "/api/room/create", { game_id: "yahtzee", player: host, code: "YTZ2" });
  const bots = await get(env, "/api/bots?game_id=yahtzee");
  await post(env, "/api/room/join-bot", { code: "YTZ2", host_id: host.id, bot_id: bots.bots[0].id });
  let res = await post(env, "/api/room/start", { code: "YTZ2", host_id: host.id });
  let bot = res.room.game.players.find((s) => s.is_bot);
  assert.equal(bot.game_index, 1);
  assert.equal(bot.round, 0);
  assert.equal(bot.finish_state, "playing");

  // one human score -> bot revealed to exactly game 1, round 1
  res = await post(env, "/api/room/move", { code: "YTZ2", player_id: host.id, action: { type: "SCORE", category: "ones", value: 3 } });
  bot = res.room.game.players.find((s) => s.is_bot);
  assert.equal(bot.game_index, 1);
  assert.equal(bot.round, 1);
  assert.equal(bot.finish_state, "playing");

  // finish game 1 (12 more) -> the table advances to game 2 and the bot keeps up
  for (const category of YZ_CATS.slice(1)) {
    res = await post(env, "/api/room/move", { code: "YTZ2", player_id: host.id, action: { type: "SCORE", category, value: 5 } });
  }
  assert.equal(res.room.game.game_index, 2);
  bot = res.room.game.players.find((s) => s.is_bot);
  assert.equal(bot.game_index, 2);
  assert.equal(bot.round, 0);
  // play games 2..6 -> bot revealed complete
  for (let g = 0; g < 5; g += 1) res = await playYahtzeeGame(env, "YTZ2", host.id, 5);
  bot = res.room.game.players.find((s) => s.is_bot);
  assert.equal(bot.finish_state, "complete");
  assert.equal(res.room.game.status, "complete");
});

test("Yahtzee series: the table waits for all humans before advancing (barrier)", async () => {
  const env = makeEnv();
  const host = player("h3", "Host");
  const guest = player("g3", "Guest");
  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/players/create", { player: guest });
  await post(env, "/api/room/create", { game_id: "yahtzee", player: host, code: "YTZ3" });
  await post(env, "/api/room/join", { code: "YTZ3", player: guest });
  let res = await post(env, "/api/room/start", { code: "YTZ3", host_id: host.id });
  assert.equal(res.room.game.game_index, 1);
  assert.equal(res.room.game.players.length, 2);

  // host finishes game 1; the guest has not -> the barrier holds at game 1
  res = await playYahtzeeGame(env, "YTZ3", host.id, 4);
  assert.equal(res.room.game.game_index, 1);
  let hostSeat = res.room.game.players.find((s) => s.mark === "P1");
  let guestSeat = res.room.game.players.find((s) => s.mark === "P2");
  assert.equal(hostSeat.finish_state, "waiting");
  assert.equal(hostSeat.round, 13);
  assert.equal(hostSeat.round_score, 13 * 4);
  assert.equal(guestSeat.finish_state, "playing");

  // the guest finishes game 1 -> the whole table advances to game 2 together
  res = await playYahtzeeGame(env, "YTZ3", guest.id, 5);
  assert.equal(res.room.game.game_index, 2);
  hostSeat = res.room.game.players.find((s) => s.mark === "P1");
  assert.equal(hostSeat.finish_state, "playing");
  assert.equal(hostSeat.round, 0);
  assert.equal(hostSeat.round_score, 0);          // fresh game-2 card
  assert.equal(hostSeat.series_past, 13 * 4);     // game 1 banked (the client reads this for "me")
  assert.equal(hostSeat.overall, 13 * 4);         // and stays in the overall
});

const seatByMark = (res, mark) => res.room.game.players.find((seat) => seat.mark === mark);

test("10,000 creates a waiting room the host starts with indexed seats", async () => {
  const env = makeEnv();
  const host = player("solo", "Solo Player");
  const created = await post(env, "/api/room/create", { game_id: "ten_thousand", player: host, code: "DICE" });
  assert.equal(created.ok, true);
  assert.equal(created.room.started, false);
  assert.equal(created.room.players.length, 1);
  assert.equal(created.room.players[0].mark, "P1");

  const started = await post(env, "/api/room/start", { code: "DICE", host_id: host.id });
  assert.equal(started.room.started, true);
  assert.equal(started.room.game.game_id, TEN_THOUSAND_GAME_ID);
  assert.equal(started.room.game.round, 1);
  assert.equal(started.room.game.players.length, 1);
  assert.equal(started.room.game.players[0].mark, "P1");
  assert.equal(started.room.game.players[0].phase, "ready");

  const rooms = await get(env, `/api/rooms?game_id=${TEN_THOUSAND_GAME_ID}`);
  assert.equal(rooms.rooms[0].open_seats, null);
});

test("10,000 reset re-seeds seats so a solo game stays playable", async () => {
  const env = makeEnv();
  const host = player("solo", "Solo Player");
  await post(env, "/api/room/create", { game_id: "ten_thousand", player: host, code: "RDIC" });
  await post(env, "/api/room/start", { code: "RDIC", host_id: host.id });

  const reset = await post(env, "/api/room/reset", { code: "RDIC", requester_id: host.id });
  assert.equal(reset.ok, true);
  assert.equal(reset.reset, undefined);
  assert.equal(reset.room.started, true);
  assert.equal(reset.room.game.round, 1);
  // The fresh game must keep the seat (was dropping to an empty board before).
  assert.equal(reset.room.game.players.length, 1);
  assert.equal(reset.room.game.players[0].mark, "P1");
  assert.equal(reset.room.game.players[0].phase, "ready");
  assert.equal(reset.room.game.players[0].score, 0);
});

test("10,000 rolls, selects scoring dice, presses, and banks (per seat)", async () => withMockRandom([0, 0, 0, 0.17, 0.34, 0.51, 0.68, 0.85, 0.17], async () => {
  const env = makeEnv();
  const host = player("roller", "Roller");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "ROLL" });
  await post(env, "/api/room/start", { code: "ROLL", host_id: host.id });
  const rolled = await post(env, "/api/room/move", { code: "ROLL", player_id: host.id, action: { type: "roll" } });
  const selected = await post(env, "/api/room/move", { code: "ROLL", player_id: host.id, action: { type: "select", dice_ids: ["d1", "d2", "d3"] } });
  const rerolled = await post(env, "/api/room/move", { code: "ROLL", player_id: host.id, action: { type: "reroll" } });
  const scoredAgain = await post(env, "/api/room/move", { code: "ROLL", player_id: host.id, action: { type: "select", dice_ids: ["d4"] } });
  const banked = await post(env, "/api/room/move", { code: "ROLL", player_id: host.id, action: { type: "bank" } });

  assert.deepEqual(seatByMark(rolled, "P1").dice.map((die) => die.value), [1, 1, 1, 2, 3, 4]);
  assert.equal(seatByMark(selected, "P1").turn_score, 1000);
  assert.equal(seatByMark(rerolled, "P1").phase, "rolled");
  assert.deepEqual(seatByMark(rerolled, "P1").dice.slice(3).map((die) => die.value), [5, 6, 2]);
  assert.equal(seatByMark(scoredAgain, "P1").turn_score, 1050);
  // A solo bank resolves the only seat; the next round begins on the next roll.
  assert.equal(seatByMark(banked, "P1").score, 1050);
  assert.equal(banked.room.game.round, 1);
  assert.equal(banked.room.game.round_pending_advance, true);
  assert.equal(seatByMark(banked, "P1").phase, "done");
  assert.equal(seatByMark(banked, "P1").finish_state, "banked");
  const nextRound = await post(env, "/api/room/move", { code: "ROLL", player_id: host.id, action: { type: "roll" } });
  assert.equal(nextRound.room.game.round, 2);
  assert.equal(nextRound.room.game.round_pending_advance, false);
  assert.equal(seatByMark(nextRound, "P1").phase, "rolled");
})); 

test("10,000 farkle is player-declared, not auto-detected", async () => withMockRandom([0.17, 0.17, 0.34, 0.34, 0.51, 0.85], async () => {
  const env = makeEnv();
  const host = player("farkle", "Farkle");
  await post(env, "/api/room/create", { game_id: TEN_THOUSAND_GAME_ID, player: host, code: "BUST" });
  await post(env, "/api/room/start", { code: "BUST", host_id: host.id });
  // A no-scoring-play roll does NOT auto-farkle: it lands as a live "rolled"
  // state so the game never reveals whether a play exists.
  const rolled = await post(env, "/api/room/move", { code: "BUST", player_id: host.id, action: { type: "roll" } });
  assert.deepEqual(seatByMark(rolled, "P1").dice.map((die) => die.value), [2, 2, 3, 3, 4, 6]);
  assert.equal(seatByMark(rolled, "P1").phase, "rolled");
  assert.equal(seatByMark(rolled, "P1").farkles, 0);
  assert.equal(rolled.room.game.last_move.type, "roll");

  // The player declares their own farkle (the Red X). Dice are preserved and a
  // farkle is counted, pending acknowledgement.
  const declared = await post(env, "/api/room/move", { code: "BUST", player_id: host.id, action: { type: "declare_farkle" } });
  assert.equal(declared.room.game.last_move.type, "farkle");
  assert.deepEqual(seatByMark(declared, "P1").dice.map((die) => die.value), [2, 2, 3, 3, 4, 6]);
  assert.equal(seatByMark(declared, "P1").farkles, 1);
  assert.equal(seatByMark(declared, "P1").turn_score, 0);
  assert.equal(seatByMark(declared, "P1").phase, "farkled");
  assert.equal(seatByMark(declared, "P1").finish_state, "farkled_pending_ack");
  assert.equal(seatByMark(declared, "P1").resolved, false);

  const acked = await post(env, "/api/room/move", { code: "BUST", player_id: host.id, action: { type: "ack_farkle" } });
  assert.equal(seatByMark(acked, "P1").phase, "done");
  assert.equal(seatByMark(acked, "P1").finish_state, "farkled_acked");
  assert.equal(seatByMark(acked, "P1").resolved, true);
  assert.equal(acked.room.game.round_pending_advance, true);
  const nextRoll = await post(env, "/api/room/move", { code: "BUST", player_id: host.id, action: { type: "roll" } });
  assert.equal(nextRoll.room.game.round, 2);
  assert.equal(seatByMark(nextRoll, "P1").phase, "rolled");
}));

test("10,000 a player may declare a farkle even with a scoring play available", async () => withMockRandom([0, 0, 0, 0, 0, 0], async () => {
  const env = makeEnv();
  const host = player("brave", "Brave");
  await post(env, "/api/room/create", { game_id: TEN_THOUSAND_GAME_ID, player: host, code: "RISK" });
  await post(env, "/api/room/start", { code: "RISK", host_id: host.id });
  // Six 1s — clearly a scoring roll — yet declaring a farkle still busts.
  const rolled = await post(env, "/api/room/move", { code: "RISK", player_id: host.id, action: { type: "roll" } });
  assert.equal(seatByMark(rolled, "P1").phase, "rolled");
  const declared = await post(env, "/api/room/move", { code: "RISK", player_id: host.id, action: { type: "declare_farkle" } });
  assert.equal(declared.room.game.last_move.type, "farkle");
  assert.equal(seatByMark(declared, "P1").farkles, 1);
  assert.equal(seatByMark(declared, "P1").turn_score, 0);
}));

test("10,000 press-for-a-straight: completing the run scores 1,500 with hot dice", async () => withMockRandom([0, 0.17, 0.34, 0.51, 0.68, 0.68, 0.85], async () => {
  const env = makeEnv();
  const host = player("straight", "Straight");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "STR8" });
  await post(env, "/api/room/start", { code: "STR8", host_id: host.id });
  const rolled = await post(env, "/api/room/move", { code: "STR8", player_id: host.id, action: { type: "roll" } });
  // Five distinct faces (d1..d5) plus a spare 5 on d6 — a partial straight missing the 6.
  assert.deepEqual(seatByMark(rolled, "P1").dice.map((die) => die.value), [1, 2, 3, 4, 5, 5]);
  const attempt = await post(env, "/api/room/move", { code: "STR8", player_id: host.id, action: { type: "straight_attempt", dice_ids: ["d1", "d2", "d3", "d4", "d5"] } });
  const seat = seatByMark(attempt, "P1");
  assert.deepEqual(seat.dice.map((die) => die.value), [1, 2, 3, 4, 5, 6]); // d6 re-rolled to the 6
  assert.equal(seat.turn_score, 1500);
  assert.equal(seat.phase, "selected");
  assert.equal(seat.dice.every((die) => die.scored), true); // all six set aside → hot dice
  assert.equal(seat.can_reroll, true);
  assert.equal(seat.can_bank, true);
  assert.equal(seat.farkle_from_straight, false);
  // Only the lone re-rolled die is flagged, so the client tumbles just that die.
  assert.deepEqual(attempt.room.game.last_move.rolled_ids, ["d6"]);
}));

test("10,000 press-for-a-straight: a missed run busts the turn like a farkle", async () => withMockRandom([0, 0.17, 0.34, 0.51, 0.68, 0.68, 0], async () => {
  const env = makeEnv();
  const host = player("straightbust", "StraightBust");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "STBX" });
  await post(env, "/api/room/start", { code: "STBX", host_id: host.id });
  await post(env, "/api/room/move", { code: "STBX", player_id: host.id, action: { type: "roll" } });
  const attempt = await post(env, "/api/room/move", { code: "STBX", player_id: host.id, action: { type: "straight_attempt", dice_ids: ["d1", "d2", "d3", "d4", "d5"] } });
  const seat = seatByMark(attempt, "P1");
  assert.deepEqual(seat.dice.map((die) => die.value), [1, 2, 3, 4, 5, 1]); // d6 re-rolled to 1 — no 6, no straight
  assert.equal(seat.turn_score, 0);
  assert.equal(seat.farkles, 1);
  assert.equal(seat.phase, "farkled");
  assert.equal(seat.finish_state, "farkled_pending_ack");
  assert.equal(attempt.room.game.last_move.type, "farkle");
  // The bust came from a straight bet: flagged so the UI keeps every die red
  // (no "missed scoring" yellow on the leftover 1), and still tumbles only d6.
  assert.equal(seat.farkle_from_straight, true);
  assert.deepEqual(attempt.room.game.last_move.rolled_ids, ["d6"]);
}));

test("10,000 press-for-a-straight rejects keeps that aren't five distinct faces", async () => withMockRandom([0, 0.17, 0.34, 0.51, 0.68, 0.68], async () => {
  const env = makeEnv();
  const host = player("straightbad", "StraightBad");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "STBD" });
  await post(env, "/api/room/start", { code: "STBD", host_id: host.id });
  await post(env, "/api/room/move", { code: "STBD", player_id: host.id, action: { type: "roll" } }); // [1,2,3,4,5,5]
  // Four kept is not a five-distinct partial straight.
  const four = await post(env, "/api/room/move", { code: "STBD", player_id: host.id, action: { type: "straight_attempt", dice_ids: ["d1", "d2", "d3", "d4"] } });
  assert.equal(four.ok, false);
  // Five kept but d5 and d6 share the face 5 — not five different faces.
  const dup = await post(env, "/api/room/move", { code: "STBD", player_id: host.id, action: { type: "straight_attempt", dice_ids: ["d2", "d3", "d4", "d5", "d6"] } });
  assert.equal(dup.ok, false);
  // The rejected attempts leave the live roll intact, so a normal keep still works.
  const kept = await post(env, "/api/room/move", { code: "STBD", player_id: host.id, action: { type: "select", dice_ids: ["d1"] } });
  assert.equal(seatByMark(kept, "P1").turn_score, 100);
}));

test("10,000 score_and_press scores the kept dice and re-rolls in one move", async () => withMockRandom([0, 0, 0, 0.17, 0.34, 0.51, 0.68, 0.85, 0.17], async () => {
  const env = makeEnv();
  const host = player("press", "Press");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "PRSS" });
  await post(env, "/api/room/start", { code: "PRSS", host_id: host.id });
  const rolled = await post(env, "/api/room/move", { code: "PRSS", player_id: host.id, action: { type: "roll" } });
  assert.deepEqual(seatByMark(rolled, "P1").dice.map((die) => die.value), [1, 1, 1, 2, 3, 4]);
  // One move: score the three 1s (1,000) and press — d4..d6 re-roll to [5,6,2].
  const pressed = await post(env, "/api/room/move", { code: "PRSS", player_id: host.id, action: { type: "score_and_press", dice_ids: ["d1", "d2", "d3"] } });
  const seat = seatByMark(pressed, "P1");
  assert.equal(seat.turn_score, 1000);
  assert.equal(seat.phase, "rolled");
  assert.deepEqual(seat.dice.slice(3).map((die) => die.value), [5, 6, 2]);
  assert.equal(pressed.room.game.last_move.type, "reroll"); // animates/sounds as a press
}));

test("10,000 score_and_bank scores the kept dice and banks in one move", async () => withMockRandom([0, 0, 0, 0.17, 0.34, 0.51], async () => {
  const env = makeEnv();
  const host = player("sbank", "SBank");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "SBNK" });
  await post(env, "/api/room/start", { code: "SBNK", host_id: host.id });
  await post(env, "/api/room/move", { code: "SBNK", player_id: host.id, action: { type: "roll" } }); // [1,1,1,2,3,4]
  const banked = await post(env, "/api/room/move", { code: "SBNK", player_id: host.id, action: { type: "score_and_bank", dice_ids: ["d1", "d2", "d3"] } });
  const seat = seatByMark(banked, "P1");
  assert.equal(seat.score, 1000); // three 1s, banked
  assert.equal(seat.phase, "done");
  assert.equal(seat.finish_state, "banked");
  assert.equal(banked.room.game.last_move.type, "bank");
}));

test("10,000 score_and_bank below the opening is rejected and rolls back", async () => withMockRandom([0.68, 0.17, 0.34, 0.51, 0.85, 0.85], async () => {
  const env = makeEnv();
  const host = player("sbanklow", "SBankLow");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "SBLO" });
  await post(env, "/api/room/start", { code: "SBLO", host_id: host.id });
  await post(env, "/api/room/move", { code: "SBLO", player_id: host.id, action: { type: "roll" } }); // [5,2,3,4,6,6]
  // A lone 5 is 50 — below the 500 opening, so the combined bank is rejected.
  const low = await post(env, "/api/room/move", { code: "SBLO", player_id: host.id, action: { type: "score_and_bank", dice_ids: ["d1"] } });
  assert.equal(low.ok, false);
  // Rollback: the select half did not persist, so the live roll still works.
  const pressed = await post(env, "/api/room/move", { code: "SBLO", player_id: host.id, action: { type: "score_and_press", dice_ids: ["d1"] } });
  assert.equal(seatByMark(pressed, "P1").turn_score, 50);
}));

test("10,000 after a straight, an empty score_and_bank banks the hot-dice total", async () => withMockRandom([0, 0.17, 0.34, 0.51, 0.68, 0.68, 0.85], async () => {
  const env = makeEnv();
  const host = player("straightbank", "StraightBank");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "STBK" });
  await post(env, "/api/room/start", { code: "STBK", host_id: host.id });
  await post(env, "/api/room/move", { code: "STBK", player_id: host.id, action: { type: "roll" } }); // [1,2,3,4,5,5]
  const won = await post(env, "/api/room/move", { code: "STBK", player_id: host.id, action: { type: "straight_attempt", dice_ids: ["d1", "d2", "d3", "d4", "d5"] } });
  assert.equal(seatByMark(won, "P1").turn_score, 1500);
  assert.equal(seatByMark(won, "P1").phase, "selected"); // hot dice, nothing left to select
  // No dice to keep — Bank with an empty selection banks the 1,500.
  const banked = await post(env, "/api/room/move", { code: "STBK", player_id: host.id, action: { type: "score_and_bank", dice_ids: [] } });
  assert.equal(seatByMark(banked, "P1").score, 1500);
  assert.equal(seatByMark(banked, "P1").phase, "done");
}));

test("10,000 multiplayer: barrier waits for all humans before advancing", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "DUOS" });
  await post(env, "/api/room/join", { code: "DUOS", player: guest });
  await post(env, "/api/room/start", { code: "DUOS", host_id: host.id });

  const play = async (pid) => {
    await post(env, "/api/room/move", { code: "DUOS", player_id: pid, action: { type: "roll" } });
    await post(env, "/api/room/move", { code: "DUOS", player_id: pid, action: { type: "select", dice_ids: ["d1", "d2", "d3"] } });
    return post(env, "/api/room/move", { code: "DUOS", player_id: pid, action: { type: "bank" } });
  };

  const afterHost = await play(host.id);
  assert.equal(afterHost.room.game.round, 1);
  assert.equal(seatByMark(afterHost, "P1").resolved, true);
  assert.equal(seatByMark(afterHost, "P1").finish_state, "banked");
  assert.equal(seatByMark(afterHost, "P2").resolved, false);

  const afterGuest = await play(guest.id);
  assert.equal(afterGuest.room.game.round, 1);
  assert.equal(afterGuest.room.game.round_pending_advance, true);
  assert.equal(seatByMark(afterGuest, "P1").resolved, true);
  assert.equal(seatByMark(afterGuest, "P1").finish_state, "banked");
  assert.equal(seatByMark(afterGuest, "P1").score, 1000);
  assert.equal(seatByMark(afterGuest, "P2").score, 1000);

  const nextRound = await post(env, "/api/room/move", { code: "DUOS", player_id: host.id, action: { type: "roll" } });
  assert.equal(nextRound.room.game.round, 2);
  assert.equal(nextRound.room.game.round_pending_advance, false);
  assert.equal(seatByMark(nextRound, "P1").resolved, false);
}));

test("10,000 multiplayer: bots resolve each round automatically", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "PRTY" });
  await post(env, "/api/room/join-bot", { code: "PRTY", host_id: host.id, bot_id: "7c91a4e2b6d0" });
  const started = await post(env, "/api/room/start", { code: "PRTY", host_id: host.id });

  // Bot (P2) resolves immediately for round 1; host (P1) still to act.
  assert.equal(seatByMark(started, "P2").is_bot, true);
  assert.equal(seatByMark(started, "P2").resolved, true);
  assert.equal(seatByMark(started, "P1").resolved, false);
  assert.equal(started.room.game.round, 1);

  await post(env, "/api/room/move", { code: "PRTY", player_id: host.id, action: { type: "roll" } });
  await post(env, "/api/room/move", { code: "PRTY", player_id: host.id, action: { type: "select", dice_ids: ["d1", "d2", "d3"] } });
  const banked = await post(env, "/api/room/move", { code: "PRTY", player_id: host.id, action: { type: "bank" } });

  // Host's bank finishes the round; the next roll starts round 2 and bots auto-resolve again.
  assert.equal(banked.room.game.round, 1);
  assert.equal(banked.room.game.round_pending_advance, true);
  assert.equal(seatByMark(banked, "P1").score, 1000);
  assert.equal(seatByMark(banked, "P1").resolved, true);
  assert.equal(seatByMark(banked, "P2").resolved, true);

  const nextRound = await post(env, "/api/room/move", { code: "PRTY", player_id: host.id, action: { type: "roll" } });
  assert.equal(nextRound.room.game.round, 2);
  assert.equal(seatByMark(nextRound, "P2").resolved, true);
}));

test("10,000 records a bot's per-roll trajectory for the play-along display", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "TRAJ" });
  await post(env, "/api/room/join-bot", { code: "TRAJ", host_id: host.id, bot_id: "7c91a4e2b6d0" });
  const started = await post(env, "/api/room/start", { code: "TRAJ", host_id: host.id });

  const bot = seatByMark(started, "P2");
  assert.equal(bot.is_bot, true);
  const traj = bot.bot_trajectory;
  assert.equal(Array.isArray(traj), true);
  assert.ok(traj.length >= 2); // baseline + at least one roll
  assert.equal(traj[0].total, 0); // baseline = carried score before this round
  assert.equal(traj[0].status, "rolling");
  const final = traj[traj.length - 1];
  assert.ok(final.status === "banked" || final.status === "farkled");
  assert.equal(final.total, bot.score); // running total resolves to the bot's score
  // Each entry is a non-negative running total; intermediate entries are "rolling".
  assert.ok(traj.every((entry) => Number.isInteger(entry.total) && entry.total >= 0));
  assert.ok(traj.slice(1, -1).every((entry) => entry.status === "rolling"));

  // The human's roll count drives the pacing: starts at 0, ticks up on each roll.
  assert.equal(bot.roll_count >= 0, true);
  assert.equal(seatByMark(started, "P1").roll_count, 0);
  const rolled = await post(env, "/api/room/move", { code: "TRAJ", player_id: host.id, action: { type: "roll" } });
  assert.equal(seatByMark(rolled, "P1").roll_count, 1);
}));

test("10,000 bot opening bust counts a single farkle", async () => withMockRandom([0.17, 0.17, 0.34, 0.34, 0.51, 0.85], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=10000");
  const bot = bots.bots.find((entry) => entry.name === "Sprout");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "B2ST" });
  await post(env, "/api/room/join-bot", { code: "B2ST", host_id: host.id, bot_id: bot.id });
  const started = await post(env, "/api/room/start", { code: "B2ST", host_id: host.id });

  assert.equal(seatByMark(started, "P2").is_bot, true);
  assert.equal(seatByMark(started, "P2").farkles, 1);
  assert.equal(seatByMark(started, "P2").phase, "done");
  assert.equal(seatByMark(started, "P2").finish_state, "farkled_acked");
  assert.equal(seatByMark(started, "P2").resolved, true);
}));

test("10,000 bot tiers choose different keeps on the same dice", () => {
  const dice = [
    { id: "d1", value: 1, scored: false, selected: false },
    { id: "d2", value: 1, scored: false, selected: false },
    { id: "d3", value: 2, scored: false, selected: false },
    { id: "d4", value: 2, scored: false, selected: false },
    { id: "d5", value: 2, scored: false, selected: false },
    { id: "d6", value: 3, scored: false, selected: false },
  ];

  const sprout = tenThousandTest.sproutTenThousandKeep(dice);
  const cipher = tenThousandTest.bestTenThousandKeep(dice);

  assert.deepEqual(sprout.ids, ["d3", "d4", "d5"]);
  assert.equal(sprout.score, 200);
  assert.deepEqual(cipher.ids, ["d1", "d2", "d3", "d4", "d5"]);
  assert.equal(cipher.score, 400);
});

test("10,000 scoring follows the default set (doubling, two triplets, combos)", () => {
  const score = (vals) => tenThousandTest.tenThousandScoreValues(vals);
  // Singles and three-of-a-kind.
  assert.equal(score([1]).score, 100);
  assert.equal(score([5]).score, 50);
  assert.equal(score([1, 1, 1]).score, 1000);
  assert.equal(score([6, 6, 6]).score, 600);
  // Four/five/six of a kind double from the triple value.
  assert.equal(score([1, 1, 1, 1]).score, 2000);
  assert.equal(score([1, 1, 1, 1, 1]).score, 4000);
  assert.equal(score([1, 1, 1, 1, 1, 1]).score, 8000);
  assert.equal(score([2, 2, 2, 2]).score, 400);
  assert.equal(score([6, 6, 6, 6, 6, 6]).score, 4800);
  assert.equal(score([5, 5, 5, 5, 1]).score, 1100); // four 5s + single 1
  // Six-dice combos.
  assert.equal(score([1, 2, 3, 4, 5, 6]).score, 1500); // straight
  assert.equal(score([2, 2, 4, 4, 6, 6]).score, 1500); // three pairs
  assert.equal(score([2, 2, 2, 4, 4, 4]).score, 2500); // two triplets
  assert.equal(score([1, 1, 1, 6, 6, 6]).score, 2500); // two triplets with 1s
  // A leftover non-scoring die makes a full selection invalid.
  assert.equal(score([6, 6, 6, 6, 6, 2]).valid, false);
  assert.equal(score([2]).valid, false);
  // Three pairs of non-1/5 faces is still a scoring set (not a farkle).
  assert.equal(tenThousandTest.tenThousandHasAnyScoringSet([2, 2, 4, 4, 6, 6]), true);
  assert.equal(tenThousandTest.tenThousandHasAnyScoringSet([2, 2, 3, 3, 4, 6]), false);
});

// face = 1 + floor(r*6): 0.75->5, 0.2->2, 0.4->3, 0.6->4 gives dice [5,2,3,4,2,3]
// — a single scoring 5 (50) with no other scoring dice.
test("10,000 opening minimum blocks a sub-500 first bank", async () => withMockRandom([0.75, 0.2, 0.4, 0.6, 0.2, 0.4], async () => {
  const env = makeEnv();
  const host = player("opener", "Opener");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "OPEN" });
  await post(env, "/api/room/start", { code: "OPEN", host_id: host.id });
  const rolled = await post(env, "/api/room/move", { code: "OPEN", player_id: host.id, action: { type: "roll" } });
  const fiveDie = seatByMark(rolled, "P1").dice.find((die) => die.value === 5);
  assert.ok(fiveDie, "mock roll should contain a single 5");
  const selected = await post(env, "/api/room/move", { code: "OPEN", player_id: host.id, action: { type: "select", dice_ids: [fiveDie.id] } });
  const lowSeat = seatByMark(selected, "P1");
  assert.equal(lowSeat.turn_score, 50);
  assert.equal(lowSeat.can_bank, false); // gated until the 500 opening minimum
  assert.equal(selected.room.game.opening_minimum, 500);
  const banked = await post(env, "/api/room/move", { code: "OPEN", player_id: host.id, action: { type: "bank" } });
  assert.equal(banked.ok, false);
  assert.match(banked.error, /on the board/);
  // The seat is untouched: still unbanked, still its turn.
  assert.equal(seatByMark(selected, "P1").score, 0);
}));

test("10,000 opening minimum drops 50 each round (500, 450, 400...)", async () => withMockRandom([0.17, 0.17, 0.34, 0.34, 0.51, 0.85], async () => {
  const env = makeEnv();
  const host = player("dropper", "Dropper");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "DROP" });
  let room = (await post(env, "/api/room/start", { code: "DROP", host_id: host.id })).room;
  const move = async (type) => (await post(env, "/api/room/move", { code: "DROP", player_id: host.id, action: { type } })).room;

  assert.equal(room.game.round, 1);
  assert.equal(room.game.opening_minimum, 500);

  // Bust each round to advance: roll -> declare_farkle -> ack, then roll starts
  // the next round.
  await move("roll");
  await move("declare_farkle");
  await move("ack_farkle");
  room = await move("roll");
  assert.equal(room.game.round, 2);
  assert.equal(room.game.opening_minimum, 450);

  await move("declare_farkle");
  await move("ack_farkle");
  room = await move("roll");
  assert.equal(room.game.round, 3);
  assert.equal(room.game.opening_minimum, 400);
}));

test("10,000 host can raise the opening minimum at start", async () => withMockRandom([0, 0, 0, 0.17, 0.34, 0.51], async () => {
  const env = makeEnv();
  const host = player("opener2", "Opener2");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "OPN2" });
  // Host picks a 1,000 opening bar in the lobby.
  const started = await post(env, "/api/room/start", { code: "OPN2", host_id: host.id, opening_minimum: 1000 });
  assert.equal(started.room.game.opening_base, 1000);
  assert.equal(started.room.game.opening_minimum, 1000); // round 1
  await post(env, "/api/room/move", { code: "OPN2", player_id: host.id, action: { type: "roll" } }); // [1,1,1,2,3,4]
  // Three 1s = 1,000 exactly clears the raised bar.
  const banked = await post(env, "/api/room/move", { code: "OPN2", player_id: host.id, action: { type: "score_and_bank", dice_ids: ["d1", "d2", "d3"] } });
  assert.equal(seatByMark(banked, "P1").score, 1000);
}));

test("10,000 a raised opening minimum blocks a bank under the bar", async () => withMockRandom([0, 0, 0, 0.17, 0.34, 0.51], async () => {
  const env = makeEnv();
  const host = player("opener3", "Opener3");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "OPN3" });
  const started = await post(env, "/api/room/start", { code: "OPN3", host_id: host.id, opening_minimum: 1500 });
  assert.equal(started.room.game.opening_minimum, 1500);
  await post(env, "/api/room/move", { code: "OPN3", player_id: host.id, action: { type: "roll" } }); // [1,1,1,2,3,4]
  // Three 1s = 1,000 is under the 1,500 bar, so the combined bank is rejected.
  const blocked = await post(env, "/api/room/move", { code: "OPN3", player_id: host.id, action: { type: "score_and_bank", dice_ids: ["d1", "d2", "d3"] } });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /on the board/);
}));

test("10,000 'None' opening lets the first scoring dice bank immediately", async () => withMockRandom([0.68, 0.17, 0.34, 0.51, 0.85, 0.85], async () => {
  const env = makeEnv();
  const host = player("opener4", "Opener4");
  await post(env, "/api/room/create", { game_id: "10000", player: host, code: "OPN4" });
  const started = await post(env, "/api/room/start", { code: "OPN4", host_id: host.id, opening_minimum: 0 });
  assert.equal(started.room.game.opening_minimum, 50); // floors at the bank minimum
  await post(env, "/api/room/move", { code: "OPN4", player_id: host.id, action: { type: "roll" } }); // [5,2,3,4,6,6]
  // A lone 5 (50) is bankable from the start when there is no opening bar.
  const banked = await post(env, "/api/room/move", { code: "OPN4", player_id: host.id, action: { type: "score_and_bank", dice_ids: ["d1"] } });
  assert.equal(seatByMark(banked, "P1").score, 50);
}));

test("10,000 Overlord hunts triples by keeping a single 1 or 5", () => {
  const plan = tenThousandTest.overlordKeepPlan;
  const dice = (vals) => vals.map((v, i) => ({ id: "d" + i, value: v, scored: false }));

  // 6 dice, no triple, has a 1 -> keep one 1 and hunt.
  let p = plan(dice([1, 2, 3, 4, 6, 6]));
  assert.deepEqual(p.ids, ["d0"]);
  assert.equal(p.hunt, true);

  // Both a 1 and a 5 present, no triple -> prefer the 1.
  p = plan(dice([2, 5, 1, 3, 6, 6]));
  assert.deepEqual(p.ids, ["d2"]);
  assert.equal(p.hunt, true);

  // No 1 but a 5, no triple -> keep the 5.
  p = plan(dice([2, 5, 3, 4, 6, 6]));
  assert.deepEqual(p.ids, ["d1"]);
  assert.equal(p.hunt, true);

  // A triple in hand -> take the best keep, not a hunt.
  p = plan(dice([4, 4, 4, 2, 3, 6]));
  assert.equal(p.hunt, false);
  assert.deepEqual(p.ids.slice().sort(), ["d0", "d1", "d2"]);

  // 3 or fewer dice -> play normally (best keep).
  p = plan(dice([1, 5, 2]));
  assert.equal(p.hunt, false);
  assert.deepEqual(p.ids.slice().sort(), ["d0", "d1"]);

  // Clears all dice -> not a hunt.
  p = plan(dice([1, 1, 5, 5]));
  assert.equal(p.hunt, false);
  assert.equal(p.ids.length, 4);

  // 4+ dice, no triple, no 1/5 -> no scoring die -> empty keep (a real farkle).
  p = plan(dice([2, 2, 3, 3, 4, 6]));
  assert.equal(p.hunt, false);
  assert.deepEqual(p.ids, []);
});

test("10,000 bot error rates map to the four tiers", async () => {
  await withMockRandom([0.09], async () => {
    assert.equal(tenThousandTest.tenThousandBotShouldMisplay(1), true);
    assert.equal(tenThousandTest.tenThousandBotShouldMisplay(4), false);
  });
  assert.equal(tenThousandTest.tenThousandBotErrorRate(1), 0.3);
  assert.equal(tenThousandTest.tenThousandBotErrorRate(2), 0.2);
  assert.equal(tenThousandTest.tenThousandBotErrorRate(3), 0.1);
  assert.equal(tenThousandTest.tenThousandBotErrorRate(4), 0);
});

test("10,000 completion records a high score", async () => withMockRandom([0, 0, 0, 0, 0, 0], async () => {
  const env = makeEnv();
  const host = player("winner", "Winner");
  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/room/create", { game_id: TEN_THOUSAND_GAME_ID, player: host, code: "WINS" });
  await post(env, "/api/room/start", { code: "WINS", host_id: host.id });
  for (let turn = 0; turn < 10; turn += 1) {
    await post(env, "/api/room/move", { code: "WINS", player_id: host.id, action: { type: "roll" } });
    await post(env, "/api/room/move", { code: "WINS", player_id: host.id, action: { type: "select", dice_ids: ["d1", "d2", "d3"] } });
    await post(env, "/api/room/move", { code: "WINS", player_id: host.id, action: { type: "bank" } });
  }
  const room = await get(env, "/api/room?code=WINS");
  const stats = await get(env, `/api/stats?game_id=${TEN_THOUSAND_GAME_ID}`);

  assert.equal(room.room.status, "completed");
  assert.equal(room.room.game.players[0].score, 10000);
  assert.equal(room.room.game.winner, "P1");
  assert.equal(stats.stats.high_scores[0].player_id, host.id);
  assert.equal(stats.stats.high_scores[0].score, 10000);
  assert.equal(stats.stats.ratings.length, 0);
}));

test("player delete is blocked while seated and cleans pending player state otherwise", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/players/create", { player: guest });
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "DLET" });
  const blocked = await post(env, "/api/players/delete", { id: host.id });
  await post(env, "/api/lobby/presence", { game_id: "super_tic_tac_toe", player: guest });
  const invite = await post(env, "/api/invite/create", { code: created.room.code, host_id: host.id, player: guest });
  const deleted = await post(env, "/api/players/delete", { id: guest.id });
  const lobby = await get(env, "/api/lobby?game_id=super_tic_tac_toe");
  const invites = await get(env, `/api/invites?player_id=${encodeURIComponent(guest.id)}`);

  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "Player is seated in an unfinished room.");
  assert.equal(invite.ok, true);
  assert.equal(deleted.ok, true);
  assert.equal(lobby.players.some((item) => item.id === guest.id), false);
  assert.equal(invites.invites.length, 0);
});

test("GET requests do not rewrite D1 state", async () => {
  const env = makeEnv();
  await post(env, "/api/players/create", { player: player("p1", "Player One") });
  const writesAfterPost = env.SOGOTABLE_STATE.writeCount;

  await get(env, "/api/players");
  await get(env, "/api/rooms?game_id=super_tic_tac_toe");

  assert.equal(env.SOGOTABLE_STATE.writeCount, writesAfterPost);
});

test("rejects writes when the state version changed while saving", async () => {
  const env = makeEnv();
  await post(env, "/api/players/create", { player: player("p1", "Player One") });
  env.SOGOTABLE_STATE.forceNextUpdateConflict = true;

  const result = await post(env, "/api/players/create", { player: player("p2", "Player Two") });

  assert.equal(result.ok, false);
  assert.equal(result.error, "State changed while saving. Please retry.");

  const listed = await get(env, "/api/players");
  assert.deepEqual(listed.players.map((item) => item.id), ["p1"]);
});

test("allows known browser origins and blocks unknown browser origins", async () => {
  const env = makeEnv();
  const allowed = await request(
    env,
    "POST",
    "/api/players/create",
    { player: player("p1", "Player One") },
    { Origin: "https://sogotable.sogodojo.com" },
  );
  const blocked = await request(
    env,
    "POST",
    "/api/players/create",
    { player: player("p2", "Player Two") },
    { Origin: "https://example.com" },
  );
  const localPreview = await request(
    env,
    "GET",
    "/api/players",
    undefined,
    { Origin: "http://127.0.0.1:8788" },
  );

  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.response.headers.get("Access-Control-Allow-Origin"), "https://sogotable.sogodojo.com");
  assert.equal(allowed.json.ok, true);
  assert.equal(localPreview.response.status, 200);
  assert.equal(localPreview.response.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:8788");
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(blocked.json.ok, false);
});

test("creates a room, joins a second player, and rejects a third player", async () => {
  const env = makeEnv();
  const { room } = await createActiveRoom(env);

  assert.equal(room.ok, undefined);
  assert.equal(room.status, "active");
  assert.equal(room.players.length, 2);
  assert.deepEqual([...new Set(room.players.map((seat) => seat.mark))].sort(), ["O", "X"]);

  const third = await post(env, "/api/room/join", { code: room.code, player: player("third", "Third", "#c43d5d") });
  assert.equal(third.ok, false);
  assert.equal(third.error, "Room already has two players.");
});

test("lists bots and lets the host seat a bot opponent", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tic_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "BOTS" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });

  assert.equal(bots.ok, true);
  assert.equal(bots.bots.length >= 3, true);
  assert.equal(bots.bots.every((bot) => bot.kind === "bot"), true);
  assert.equal(bots.bots.every((bot) => HEX_ID_PATTERN.test(bot.id) && bot.id === bot.bot_id), true);
  const smartBotNames = new Set(["Cipher", "Overlord"]);
  assert.equal(bots.bots.filter((bot) => smartBotNames.has(bot.name)).every((bot) => bot.strategy_icon === "\uD83E\uDDE0"), true);
  assert.equal(bots.bots.filter((bot) => !smartBotNames.has(bot.name)).every((bot) => bot.strategy_icon === "\uD83C\uDFB2"), true);
  assert.equal(joined.ok, true);
  assert.equal(joined.room.status, "active");
  assert.equal(joined.room.players.length, 2);
  assert.equal(joined.room.players.some((seat) => seat.kind === "bot"), true);
}));

test("rejects bot seating by non-hosts and in active rooms", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest");
  const bots = await get(env, "/api/bots?game_id=super_tic_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "NOPE" });
  const nonHost = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: guest.id, bot_id: bots.bots[0].id });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const fullRoom = await post(env, "/api/room/join-bot", { code: joined.room.code, host_id: host.id, bot_id: bots.bots[0].id });

  assert.equal(nonHost.ok, false);
  assert.equal(nonHost.error, "Only the host can invite a bot.");
  assert.equal(fullRoom.ok, false);
  assert.equal(fullRoom.error, "Bot can only join a waiting room.");
}));

test("bot responds with a legal move through the normal move pipeline", async () => withMockRandom([0, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tic_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "MOVE" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const moved = await post(env, "/api/room/move", { code: joined.room.code, player_id: humanSeat.id, board: 0, cell: 0 });
  const filledCells = moved.room.game.boards.flat().filter(Boolean);

  assert.equal(moved.ok, true);
  assert.equal(filledCells.length, 2);
  assert.equal(moved.room.game.current_player, humanSeat.mark);
  assert.equal(moved.room.game.boards[0][0], humanSeat.mark);
}));

test("Overlord blocks an immediate zone win", async () => withMockRandom([0, 0, 0, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tactical_tac_toe");
  const overlord = bots.bots.find((bot) => bot.name === "Overlord");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TBLK" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: overlord.id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const overlordSeat = joined.room.players.find((seat) => seat.id === overlord.id);

  mutateState(env, (data) => {
    const game = data.rooms.TBLK.game;
    game.current_player = humanSeat.mark;
    game.next_board = 1;
    game.boards[0][0] = humanSeat.mark;
    game.boards[0][1] = humanSeat.mark;
    game.move_count = 6;
  });

  const moved = await post(env, "/api/room/move", { code: "TBLK", player_id: humanSeat.id, board: 1, cell: 0 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.boards[0][2], overlordSeat.mark);
}));

test("Overlord avoids sending the opponent to a winning destination zone", async () => withMockRandom([0, 0, 0, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tactical_tac_toe");
  const overlord = bots.bots.find((bot) => bot.name === "Overlord");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TDST" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: overlord.id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const overlordSeat = joined.room.players.find((seat) => seat.id === overlord.id);

  mutateState(env, (data) => {
    const game = data.rooms.TDST.game;
    game.current_player = humanSeat.mark;
    game.next_board = 1;
    game.boards[2][0] = humanSeat.mark;
    game.boards[2][1] = humanSeat.mark;
    game.move_count = 6;
  });

  const moved = await post(env, "/api/room/move", { code: "TDST", player_id: humanSeat.id, board: 1, cell: 0 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.boards[0][2], null);
  assert.equal(moved.room.game.boards[0].some((cell, index) => index !== 2 && cell === overlordSeat.mark), true);
  assert.notEqual(moved.room.game.next_board, 2);
}));

test("Overlord values a treasure pickup over a plain center cell", async () => withMockRandom([0, 0, 0, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tactical_tac_toe");
  const overlord = bots.bots.find((bot) => bot.name === "Overlord");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TPWR" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: overlord.id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const overlordSeat = joined.room.players.find((seat) => seat.id === overlord.id);

  mutateState(env, (data) => {
    const game = data.rooms.TPWR.game;
    game.current_player = humanSeat.mark;
    game.next_board = 1;
    game.pickups = [{
      id: "manual-treasure",
      type: "treasureChest",
      label: "Treasure Chest",
      emoji: "\uD83C\uDF81",
      points: 25,
      board: 0,
      sector: 0,
      cell: 5,
      created_at_turn: 6,
    }];
    game.move_count = 6;
  });

  const moved = await post(env, "/api/room/move", { code: "TPWR", player_id: humanSeat.id, board: 1, cell: 0 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.boards[0][5], overlordSeat.mark);
  assert.equal(moved.room.game.scores[overlordSeat.mark], 25);
}));

test("room durable object returns the latest bot-applied snapshot", async () => withMockRandom([0, 0], async () => {
  const env = makeEnvWithRooms();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tic_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "DORB" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const moved = await post(env, "/api/room/move", { code: joined.room.code, player_id: humanSeat.id, board: 0, cell: 0 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.move_count, 2);
  assert.equal(env.ROOM_OBJECT.getByName("DORB").snapshots.at(-1).game.move_count, 2);
}));

test("bot auto-agrees to reset and play-again requests", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tic_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "RSET" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");

  mutateState(env, (data) => {
    const game = data.rooms.RSET.game;
    game.boards[0][0] = humanSeat.mark;
    game.move_count = 1;
  });

  const reset = await post(env, "/api/room/reset", { code: "RSET", requester_id: humanSeat.id });

  assert.equal(reset.ok, true);
  assert.equal(reset.reset, undefined);
  assert.equal(reset.room.reset_request, null);
  assert.equal(reset.room.game.move_count, 0);
}));

test("bot games update human stats without exposing bot leaderboard rows", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=super_tactical_tac_toe");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "BWIN" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");

  mutateState(env, (data) => {
    const room = data.rooms.BWIN;
    const game = room.game;
    game.small_winners[0] = humanSeat.mark;
    game.small_winners[1] = humanSeat.mark;
    game.boards[2][0] = humanSeat.mark;
    game.boards[2][1] = humanSeat.mark;
    game.scores = { X: 0, O: 0, [humanSeat.mark]: 50 };
    game.current_player = humanSeat.mark;
    game.next_board = 2;
    game.move_count = 20;
  });

  const moved = await post(env, "/api/room/move", { code: "BWIN", player_id: humanSeat.id, board: 2, cell: 2 });
  const stats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");
  const playerStats = await get(env, `/api/player/stats?player_id=${encodeURIComponent(humanSeat.id)}`);
  const tacticalStats = playerStats.stats.find((entry) => entry.game_id === TACTICAL_GAME_ID);

  assert.equal(moved.ok, true);
  assert.equal(tacticalStats.games_played, 1);
  assert.equal(tacticalStats.games_won, 1);
  assert.equal(tacticalStats.personal_high_score, 50);
  assert.equal(bots.bots.every((bot) => !String(bot.id).includes(String(bot.name).toLowerCase().split(" ")[0])), true);
  assert.equal(stats.stats.ratings.every((entry) => !entry.bot), true);
}));

test("canonical opaque game ids work while legacy game ids remain aliases", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const legacyCreated = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "OPAQ" });
  const canonicalCreated = await post(env, "/api/room/create", { game_id: TACTICAL_GAME_ID, player: guest, code: "OPQ2" });
  const legacyRooms = await get(env, "/api/rooms?game_id=super_tic_tac_toe");
  const canonicalRooms = await get(env, `/api/rooms?game_id=${encodeURIComponent(TACTICAL_GAME_ID)}`);
  const legacyStats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");

  assert.equal(legacyCreated.ok, true);
  assert.equal(legacyCreated.room.game_id, CLASSIC_GAME_ID);
  assert.equal(legacyCreated.room.game.game_id, CLASSIC_GAME_ID);
  assert.equal(canonicalCreated.ok, true);
  assert.equal(canonicalCreated.room.game_id, TACTICAL_GAME_ID);
  assert.equal(canonicalCreated.room.game.game_id, TACTICAL_GAME_ID);
  assert.equal(legacyRooms.rooms.some((room) => room.code === "OPAQ" && room.game_id === CLASSIC_GAME_ID), true);
  assert.equal(canonicalRooms.rooms.some((room) => room.code === "OPQ2" && room.game_id === TACTICAL_GAME_ID), true);
  assert.equal(legacyStats.game_id, TACTICAL_GAME_ID);
}));

test("reuses an unfinished active room for the same player and game", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const first = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "WXYZ" });
  const second = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host });

  assert.equal(second.ok, true);
  assert.equal(second.existing, true);
  assert.equal(second.room.code, first.room.code);
});

test("accepts valid moves and rejects out-of-turn moves", async () => {
  const env = makeEnv();
  const { room } = await createActiveRoom(env);
  const xSeat = room.players.find((seat) => seat.mark === "X");
  const oSeat = room.players.find((seat) => seat.mark === "O");

  const wrongTurn = await post(env, "/api/room/move", { code: room.code, player_id: oSeat.id, board: 0, cell: 0 });
  assert.equal(wrongTurn.ok, false);
  assert.equal(wrongTurn.error, "It is X's turn.");

  const moved = await post(env, "/api/room/move", { code: room.code, player_id: xSeat.id, board: 0, cell: 0 });
  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.boards[0][0], "X");
  assert.equal(moved.room.game.current_player, "O");
  assert.deepEqual(moved.room.game.legal_boards, [0]);
});

test("creates Dots and Boxes rooms and applies line moves", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "boxes", player: host, code: "BOX1" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");

  const wrongTurn = await post(env, "/api/room/move", { code: "BOX1", player_id: oSeat.id, line_id: "h-0-0" });
  const moved = await post(env, "/api/room/move", { code: "BOX1", player_id: xSeat.id, line_id: "h-0-0" });
  const duplicate = await post(env, "/api/room/move", { code: "BOX1", player_id: oSeat.id, line_id: "h-0-0" });

  assert.equal(joined.room.game_id, BOXES_GAME_ID);
  assert.equal(joined.room.game.game_id, BOXES_GAME_ID);
  assert.equal(joined.room.game.rows, 8);
  assert.equal(joined.room.game.cols, 5);
  assert.equal(joined.room.game.legal_lines.length, 93);
  assert.equal(wrongTurn.ok, false);
  assert.equal(wrongTurn.error, "It is X's turn.");
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.room.game.lines, ["h-0-0"]);
  assert.equal(moved.room.game.current_player, "O");
  assert.equal(moved.room.game.legal_lines.length, 92);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error, "Line is already claimed.");
});

test("Dots and Boxes captures boxes and keeps the turn", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: BOXES_GAME_ID, player: host, code: "BOX2" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const game = data.rooms.BOX2.game;
    game.current_player = xSeat.mark;
    game.lines = ["h-0-0", "h-1-0", "v-0-0"];
    game.move_count = 3;
  });
  const moved = await post(env, "/api/room/move", { code: "BOX2", player_id: xSeat.id, line_id: "v-0-1" });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.boxes[0][0], xSeat.mark);
  assert.equal(moved.room.game.scores[xSeat.mark], 1);
  assert.equal(moved.room.game.current_player, xSeat.mark);
  assert.equal(moved.room.game.last_move.captured.length, 1);
});

test("Dots and Boxes bot responds through the normal move pipeline", async () => withMockRandom([0, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=boxes");
  const created = await post(env, "/api/room/create", { game_id: "boxes", player: host, code: "BOXB" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const moved = await post(env, "/api/room/move", { code: "BOXB", player_id: humanSeat.id, line_id: "h-0-0" });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.lines.length, 2);
  assert.equal(moved.room.game.lines.includes("h-0-0"), true);
  assert.equal(moved.room.game.current_player, humanSeat.mark);
}));

test("Dots and Boxes all-bot room plays through capture chains without stalling", async () => withMockRandom([0, 0], async () => {
  const env = makeEnv();
  const botHost = {
    id: "bot-host",
    bot_id: "bot-host",
    kind: "bot",
    name: "Bot Host",
    icon: "🤖",
    color: "#1f7a5f",
  };
  const bots = await get(env, "/api/bots?game_id=boxes");
  const created = await post(env, "/api/room/create", { game_id: "boxes", player: botHost, code: "BBOT" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: botHost.id, bot_id: bots.bots[0].id });

  assert.equal(joined.ok, true);
  assert.equal(joined.room.status, "completed");
  assert.equal(joined.room.game.lines.length, 93);
  assert.equal(joined.room.game.legal_lines.length, 0);
  assert.notEqual(joined.room.game.status, "playing");
}));

test("creates Quoridor rooms and applies pawn moves", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "quoridor", player: host, code: "QOR1" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");

  const wrongTurn = await post(env, "/api/room/move", { code: "QOR1", player_id: oSeat.id, action: { type: "move_pawn", row: 7, col: 4 } });
  const moved = await post(env, "/api/room/move", { code: "QOR1", player_id: xSeat.id, action: { type: "move_pawn", row: 7, col: 4 } });

  assert.equal(joined.room.game_id, QUORIDOR_GAME_ID);
  assert.equal(joined.room.game.board_size, 9);
  assert.equal(joined.room.game.walls_remaining.X, 10);
  assert.equal(joined.room.game.legal_pawn_moves.length, 3);
  assert.equal(wrongTurn.ok, false);
  assert.equal(wrongTurn.error, "It is X's turn.");
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.room.game.pawns.X, { row: 7, col: 4, goal: 0 });
  assert.equal(moved.room.game.current_player, "O");
});

test("Quoridor places walls and rejects overlap crossing and sealed paths", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/room/create", { game_id: "quoridor", player: host, code: "QOR2" });
  const joined = await post(env, "/api/room/join", { code: "QOR2", player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");

  const wall = await post(env, "/api/room/move", { code: "QOR2", player_id: xSeat.id, action: { type: "place_wall", orientation: "h", row: 7, col: 3 } });
  const overlap = await post(env, "/api/room/move", { code: "QOR2", player_id: oSeat.id, action: { type: "place_wall", orientation: "h", row: 7, col: 4 } });
  const crossing = await post(env, "/api/room/move", { code: "QOR2", player_id: oSeat.id, action: { type: "place_wall", orientation: "v", row: 7, col: 3 } });

  mutateState(env, (data) => {
    const game = data.rooms.QOR2.game;
    game.current_player = oSeat.mark;
    game.walls_remaining[oSeat.mark] = 10;
    game.walls = [
      { orientation: "h", row: 7, col: 0 },
      { orientation: "h", row: 7, col: 2 },
      { orientation: "h", row: 7, col: 4 },
      { orientation: "v", row: 7, col: 7 },
    ];
    game.pawns.X = { row: 8, col: 0, goal: 0 };
  });
  const sealed = await post(env, "/api/room/move", { code: "QOR2", player_id: oSeat.id, action: { type: "place_wall", orientation: "h", row: 7, col: 6 } });

  assert.equal(wall.ok, true);
  assert.equal(wall.room.game.walls_remaining.X, 9);
  assert.equal(overlap.ok, false);
  assert.equal(overlap.error, "Wall placement is not legal.");
  assert.equal(crossing.ok, false);
  assert.equal(crossing.error, "Wall placement is not legal.");
  assert.equal(sealed.ok, false);
  assert.equal(sealed.error, "Wall placement is not legal.");
});

test("Quoridor supports jumps and detects wins", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/room/create", { game_id: "quoridor", player: host, code: "QOR3" });
  const joined = await post(env, "/api/room/join", { code: "QOR3", player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const game = data.rooms.QOR3.game;
    game.current_player = xSeat.mark;
    game.pawns.X = { row: 4, col: 4, goal: 0 };
    game.pawns.O = { row: 3, col: 4, goal: 8 };
  });
  const jump = await post(env, "/api/room/move", { code: "QOR3", player_id: xSeat.id, action: { type: "move_pawn", row: 2, col: 4 } });

  mutateState(env, (data) => {
    const game = data.rooms.QOR3.game;
    game.current_player = xSeat.mark;
    game.pawns.X = { row: 1, col: 4, goal: 0 };
    game.pawns.O = { row: 8, col: 4, goal: 8 };
  });
  const win = await post(env, "/api/room/move", { code: "QOR3", player_id: xSeat.id, action: { type: "move_pawn", row: 0, col: 4 } });

  assert.equal(jump.ok, true);
  assert.deepEqual(jump.room.game.pawns.X, { row: 2, col: 4, goal: 0 });
  assert.equal(win.ok, true);
  assert.equal(win.room.game.status, "x_won");
  assert.equal(win.room.game.winner, "X");
});

test("Quoridor bot responds through the normal move pipeline", async () => withMockRandom([0, 0.9, 0.9], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=quoridor");
  const created = await post(env, "/api/room/create", { game_id: "quoridor", player: host, code: "QBOT" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const moved = await post(env, "/api/room/move", { code: "QBOT", player_id: humanSeat.id, action: { type: "move_pawn", row: 7, col: 4 } });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.move_count >= 2, true);
  assert.equal(["X", "O"].includes(moved.room.game.current_player), true);
}));

const fleet = (offset = 0) => [
  { id: "carrier", row: offset, col: 0, orientation: "h" },
  { id: "battleship", row: offset + 1, col: 0, orientation: "h" },
  { id: "cruiser", row: offset + 2, col: 0, orientation: "h" },
  { id: "submarine", row: offset + 3, col: 0, orientation: "h" },
  { id: "destroyer", row: offset + 4, col: 0, orientation: "h" },
];

test("Battleship setup requires valid fleets and starts after both players are ready", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "SHIP" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");
  const invalid = await post(env, "/api/room/move", {
    code: "SHIP",
    player_id: xSeat.id,
    action: { type: "place_fleet", ships: [{ id: "carrier", row: 0, col: 0, orientation: "h" }] },
  });
  const xReady = await post(env, "/api/room/move", { code: "SHIP", player_id: xSeat.id, action: { type: "place_fleet", ships: fleet(0) } });
  const oReady = await post(env, "/api/room/move", { code: "SHIP", player_id: oSeat.id, action: { type: "place_fleet", ships: fleet(5) } });

  assert.equal(joined.room.game_id, BATTLESHIP_GAME_ID);
  assert.equal(joined.room.game.status, "setup");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, "Place every ship before readying fleet.");
  assert.equal(xReady.room.game.status, "setup");
  assert.equal(oReady.room.game.status, "playing");
  assert.equal(oReady.room.game.current_player, "X");
});

test("Battleship resolves attacks and rejects duplicate shots", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: BATTLESHIP_GAME_ID, player: host, code: "BATT" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");
  await post(env, "/api/room/move", { code: "BATT", player_id: xSeat.id, action: { type: "place_fleet", ships: fleet(0) } });
  await post(env, "/api/room/move", { code: "BATT", player_id: oSeat.id, action: { type: "place_fleet", ships: fleet(5) } });

  const hit = await post(env, "/api/room/move", { code: "BATT", player_id: xSeat.id, action: { type: "attack", row: 5, col: 0 } });
  const duplicate = await post(env, "/api/room/move", { code: "BATT", player_id: xSeat.id, action: { type: "attack", row: 5, col: 0 } });

  assert.equal(hit.ok, true);
  assert.equal(hit.room.game.last_move.hit, true);
  assert.equal(hit.room.game.current_player, "O");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error, "It is O's turn.");
});

test("Battleship room reads project ships for each viewer", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: BATTLESHIP_GAME_ID, player: host, code: "VIEW" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");
  await post(env, "/api/room/move", { code: "VIEW", player_id: xSeat.id, action: { type: "place_fleet", ships: fleet(0) } });
  await post(env, "/api/room/move", { code: "VIEW", player_id: oSeat.id, action: { type: "place_fleet", ships: fleet(5) } });
  const xAttack = await post(env, "/api/room/move", { code: "VIEW", player_id: xSeat.id, action: { type: "attack", row: 5, col: 0 } });
  const xView = await get(env, `/api/room?code=VIEW&player_id=${encodeURIComponent(xSeat.id)}`);
  const oView = await get(env, `/api/room?code=VIEW&player_id=${encodeURIComponent(oSeat.id)}`);
  const publicView = await get(env, "/api/room?code=VIEW");

  assert.equal(xAttack.room.game.players[xSeat.mark].ships.length, 5);
  assert.equal(xAttack.room.game.players[oSeat.mark].ships.length, 0);
  assert.equal(xAttack.room.game.players[xSeat.mark].shots.length, 1);
  assert.equal("ship_id" in xAttack.room.game.players[xSeat.mark].shots[0], false);
  assert.equal("ship_id" in xAttack.room.game.last_move, false);
  assert.equal(xView.room.game.players[xSeat.mark].ships.length, 5);
  assert.equal(xView.room.game.players[oSeat.mark].ships.length, 0);
  assert.equal(oView.room.game.players[oSeat.mark].ships.length, 5);
  assert.equal(oView.room.game.players[xSeat.mark].ships.length, 0);
  assert.equal(oView.room.game.players[xSeat.mark].shots[0].hit, true);
  assert.equal(publicView.room.game.players.X.ships.length, 0);
  assert.equal(publicView.room.game.players.O.ships.length, 0);
});

test("Battleship reveals a sunk opponent ship to the attacker, not the rest of the fleet", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/room/create", { game_id: BATTLESHIP_GAME_ID, player: host, code: "SUNK" });
  const joined = await post(env, "/api/room/join", { code: "SUNK", player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");
  await post(env, "/api/room/move", { code: "SUNK", player_id: xSeat.id, action: { type: "place_fleet", ships: fleet(0) } });
  await post(env, "/api/room/move", { code: "SUNK", player_id: oSeat.id, action: { type: "place_fleet", ships: fleet(5) } });
  // O's destroyer occupies (9,0) and (9,1). X hits both to sink it.
  await post(env, "/api/room/move", { code: "SUNK", player_id: xSeat.id, action: { type: "attack", row: 9, col: 0 } });
  await post(env, "/api/room/move", { code: "SUNK", player_id: oSeat.id, action: { type: "attack", row: 9, col: 9 } });
  const sink = await post(env, "/api/room/move", { code: "SUNK", player_id: xSeat.id, action: { type: "attack", row: 9, col: 1 } });
  const xView = await get(env, `/api/room?code=SUNK&player_id=${encodeURIComponent(xSeat.id)}`);

  assert.equal(sink.room.game.last_move.sunk, true);
  assert.equal(sink.room.game.last_move.ship_id, "destroyer");
  const revealed = xView.room.game.players[oSeat.mark].ships;
  assert.equal(revealed.length, 1);
  assert.equal(revealed[0].id, "destroyer");
});

test("Battleship room sockets broadcast viewer-specific projections", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: BATTLESHIP_GAME_ID, player: host, code: "SOCK" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");
  await post(env, "/api/room/move", { code: "SOCK", player_id: xSeat.id, action: { type: "place_fleet", ships: fleet(0) } });
  await post(env, "/api/room/move", { code: "SOCK", player_id: oSeat.id, action: { type: "place_fleet", ships: fleet(5) } });
  await post(env, "/api/room/move", { code: "SOCK", player_id: xSeat.id, action: { type: "attack", row: 5, col: 0 } });
  const fullRoom = stateData(env).rooms.SOCK;
  const xSocket = new MockHibernatedSocket({ type: "room", player_id: xSeat.id });
  const oSocket = new MockHibernatedSocket({ type: "room", player_id: oSeat.id });
  const room = new RoomDurableObject({ getWebSockets: () => [xSocket, oSocket] }, env);

  room.broadcastRoomSnapshot(fullRoom);

  const xRoom = xSocket.sent[0].room;
  const oRoom = oSocket.sent[0].room;
  assert.equal(xRoom.game.players[xSeat.mark].ships.length, 5);
  assert.equal(xRoom.game.players[oSeat.mark].ships.length, 0);
  assert.equal(oRoom.game.players[oSeat.mark].ships.length, 5);
  assert.equal(oRoom.game.players[xSeat.mark].ships.length, 0);
});

test("Battleship detects a sunk fleet winner", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "SINK" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");
  mutateState(env, (data) => {
    const game = data.rooms.SINK.game;
    game.status = "playing";
    game.phase = "playing";
    game.current_player = "X";
    game.players.X.ready = true;
    game.players.O.ready = true;
    game.players.X.ships = fleet(0);
    game.players.O.ships = fleet(5);
    game.players.X.shots = [
      ...Array.from({ length: 5 }, (_, col) => ({ row: 5, col, hit: true, ship_id: "carrier" })),
      ...Array.from({ length: 4 }, (_, col) => ({ row: 6, col, hit: true, ship_id: "battleship" })),
      ...Array.from({ length: 3 }, (_, col) => ({ row: 7, col, hit: true, ship_id: "cruiser" })),
      ...Array.from({ length: 3 }, (_, col) => ({ row: 8, col, hit: true, ship_id: "submarine" })),
      { row: 9, col: 0, hit: true, ship_id: "destroyer" },
    ];
    game.players.O.shots = [];
  });
  const won = await post(env, "/api/room/move", { code: "SINK", player_id: xSeat.id, action: { type: "attack", row: 9, col: 1 } });

  assert.equal(oSeat.mark, "O");
  assert.equal(won.room.status, "completed");
  assert.equal(won.room.game.status, "x_won");
  assert.equal(won.room.game.winner, "X");
  assert.equal(won.room.game.players.X.ships.length, 5);
  assert.equal(won.room.game.players.O.ships.length, 5);
});

test("Battleship bot auto-places fleet and responds with legal attacks", async () => withMockRandom([0.9, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=battleship");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "BOTP" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  assert.equal(joined.ok, true, joined.error);
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const ready = await post(env, "/api/room/move", { code: "BOTP", player_id: humanSeat.id, action: { type: "auto_place" } });

  assert.equal(joined.room.game.players[joined.room.players.find((seat) => seat.kind === "bot").mark].ready, true);
  assert.equal(ready.ok, true);
  assert.equal(ready.room.game.move_count >= 1, true);
  assert.equal(ready.room.game.players.X.shots.length + ready.room.game.players.O.shots.length >= 1, true);
}));

test("Battleship repairs missing bot setup when the human readies fleet", async () => withMockRandom([0.9, 0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=battleship");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "BRDY" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: bots.bots[0].id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const botSeat = joined.room.players.find((seat) => seat.kind === "bot");

  mutateState(env, (data) => {
    const botState = data.rooms.BRDY.game.players[botSeat.mark];
    botState.ready = false;
    botState.ships = [];
  });

  const ready = await post(env, "/api/room/move", {
    code: "BRDY",
    player_id: humanSeat.id,
    action: { type: "place_fleet", ships: fleet(0) },
  });

  assert.equal(ready.ok, true, ready.error);
  assert.equal(ready.room.game.players[botSeat.mark].ready, true);
  assert.equal(ready.room.game.players[botSeat.mark].ships.length, 0);
  assert.equal(stateData(env).rooms.BRDY.game.players[botSeat.mark].ships.length, 5);
  assert.notEqual(ready.room.game.status, "setup");
}));

test("Battleship Overlord places a complete non-overlapping fleet", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=battleship");
  const overlord = bots.bots.find((bot) => bot.name === "Overlord");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "BTTP" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: overlord.id });
  const botSeat = joined.room.players.find((seat) => seat.kind === "bot");
  assert.equal(joined.room.game.players[botSeat.mark].ships.length, 0);
  const ships = stateData(env).rooms.BTTP.game.players[botSeat.mark].ships;
  const occupied = new Set();

  assert.equal(ships.length, 5);
  ships.forEach((ship) => {
    const required = joined.room.game.fleet.find((item) => item.id === ship.id);
    const cells = Array.from({ length: required.size }, (_, index) => ({
      row: ship.row + (ship.orientation === "v" ? index : 0),
      col: ship.col + (ship.orientation === "h" ? index : 0),
    }));
    assert.equal(cells.length, required.size);
    cells.forEach((cell) => {
      assert.equal(cell.row >= 0 && cell.row < 10 && cell.col >= 0 && cell.col < 10, true);
      const key = `${cell.row}:${cell.col}`;
      assert.equal(occupied.has(key), false);
      occupied.add(key);
    });
  });
});

test("Battleship Overlord extends a known hit line", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=battleship");
  const overlord = bots.bots.find((bot) => bot.name === "Overlord");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "BTTG" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: overlord.id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const botSeat = joined.room.players.find((seat) => seat.kind === "bot");
  await post(env, "/api/room/move", { code: "BTTG", player_id: humanSeat.id, action: { type: "auto_place" } });
  mutateState(env, (data) => {
    const game = data.rooms.BTTG.game;
    game.current_player = humanSeat.mark;
    game.players[humanSeat.mark].ships = fleet(0);
    game.players[botSeat.mark].shots = [
      { row: 0, col: 0, hit: true, ship_id: "carrier" },
      { row: 0, col: 1, hit: true, ship_id: "carrier" },
    ];
  });

  const after = await post(env, "/api/room/move", { code: "BTTG", player_id: humanSeat.id, action: { type: "attack", row: 9, col: 9 } });
  const botShots = after.room.game.players[botSeat.mark].shots;

  assert.equal(botShots.some((shot) => shot.row === 0 && shot.col === 2), true);
});

test("Battleship basic bots hunt next to unresolved hits", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const bots = await get(env, "/api/bots?game_id=battleship");
  const basicBot = bots.bots.find((bot) => bot.name === "Sprout");
  const created = await post(env, "/api/room/create", { game_id: "battleship", player: host, code: "BHTG" });
  const joined = await post(env, "/api/room/join-bot", { code: created.room.code, host_id: host.id, bot_id: basicBot.id });
  const humanSeat = joined.room.players.find((seat) => seat.kind !== "bot");
  const botSeat = joined.room.players.find((seat) => seat.kind === "bot");
  await post(env, "/api/room/move", { code: "BHTG", player_id: humanSeat.id, action: { type: "auto_place" } });
  mutateState(env, (data) => {
    const game = data.rooms.BHTG.game;
    game.current_player = humanSeat.mark;
    game.players[humanSeat.mark].ships = fleet(0);
    game.players[botSeat.mark].shots = [
      { row: 0, col: 0, hit: true, ship_id: "carrier" },
      { row: 0, col: 1, hit: true, ship_id: "carrier" },
    ];
  });

  const after = await post(env, "/api/room/move", { code: "BHTG", player_id: humanSeat.id, action: { type: "attack", row: 9, col: 9 } });
  const botShots = after.room.game.players[botSeat.mark].shots;

  assert.equal(botShots.some((shot) => shot.row === 0 && shot.col === 2), true);
});

test("tracks reset votes and resets only after both seated players agree", async () => {
  const env = makeEnv();
  const { room } = await createActiveRoom(env);
  const [first, second] = room.players;

  const pending = await post(env, "/api/room/reset", { code: room.code, requester_id: first.id });
  assert.equal(pending.ok, true);
  assert.equal(pending.reset, "pending");
  assert.equal(pending.room.reset_request.needed, 2);

  const reset = await post(env, "/api/room/reset", { code: room.code, requester_id: second.id });
  assert.equal(reset.ok, true);
  assert.equal(reset.reset, undefined);
  assert.equal(reset.room.game.move_count, 0);
  assert.equal(reset.room.game_epoch, room.game_epoch + 1);
  assert.equal(reset.room.revision > pending.room.revision, true);
  assert.equal(reset.room.reset_request, null);
});

test("creates invites and handles decline and accept", async () => {
  const declinedEnv = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest");
  const declinedRoom = await post(declinedEnv, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "DECL" });
  const invite = await post(declinedEnv, "/api/invite/create", { code: declinedRoom.room.code, host_id: host.id, player: guest });
  const declined = await post(declinedEnv, "/api/invite/respond", { invite_id: invite.invite.id, accept: false, player: guest });

  assert.equal(invite.ok, true);
  assert.equal(declined.ok, true);
  assert.equal(declined.accepted, false);

  const acceptedEnv = makeEnv();
  const acceptedRoom = await post(acceptedEnv, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "ACPT" });
  const acceptedInvite = await post(acceptedEnv, "/api/invite/create", { code: acceptedRoom.room.code, host_id: host.id, player: guest });
  const accepted = await post(acceptedEnv, "/api/invite/respond", { invite_id: acceptedInvite.invite.id, accept: true, player: guest });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.room.status, "active");
  assert.equal(accepted.room.players.length, 2);
});

test("invite accept routes through room authority", async () => {
  const env = makeEnvWithRooms();
  const host = player("host", "Host");
  const guest = player("guest", "Guest");
  const room = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "AUTH" });
  const invite = await post(env, "/api/invite/create", { code: room.room.code, host_id: host.id, player: guest });
  const accepted = await post(env, "/api/invite/respond", { invite_id: invite.invite.id, accept: true, player: guest });
  const roomObject = env.ROOM_OBJECT.getByName("AUTH");

  assert.equal(accepted.ok, true);
  assert.equal(accepted.room.status, "active");
  assert.equal(roomObject.actions.includes("/api/invite/create"), true);
  assert.equal(roomObject.actions.includes("/api/invite/respond"), true);
  assert.equal(roomObject.snapshots.at(-1).players.some((seat) => seat.id === guest.id), true);
});

test("room authority paths fail closed when ROOM_OBJECT is unavailable", async () => {
  const cases = [
    { path: "/api/room/create", body: { game_id: "super_tic_tac_toe", player: player("host", "Host"), code: "AUTH" } },
    { path: "/api/room/join", body: { code: "AUTH", player: player("guest", "Guest") } },
    { path: "/api/room/join-bot", body: { code: "AUTH", host_id: "host", bot_id: "7c91a4e2b6d0" } },
    { path: "/api/room/leave", body: { code: "AUTH", player_id: "host", requester_id: "host" } },
    { path: "/api/room/close", body: { code: "AUTH", requester_id: "sogo-id", passcode: "1234" } },
    { path: "/api/room/move", body: { code: "AUTH", player_id: "host", board: 0, cell: 0 } },
    { path: "/api/room/reset", body: { code: "AUTH", requester_id: "host" } },
    { path: "/api/invite/create", body: { code: "AUTH", host_id: "host", player: player("guest", "Guest") } },
    { path: "/api/invite/respond", body: { invite_id: "AUTH:guest", accept: true, player: player("guest", "Guest") } },
  ];

  for (const item of cases) {
    const env = makeProductionEnv();
    const { response, json } = await request(env, "POST", item.path, item.body);
    assert.equal(response.status, 503, item.path);
    assert.equal(json.ok, false, item.path);
    assert.equal(json.error, "Room authority unavailable.", item.path);
    assert.equal(env.SOGOTABLE_STATE.writeCount, 0, item.path);
  }
});

test("room factory serializes duplicate room creation", async () => {
  const env = makeEnvWithRooms();
  const firstHost = player("first-host", "First Host");
  const secondHost = player("second-host", "Second Host", "#2563eb");
  const [first, second] = await Promise.all([
    post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: firstHost, code: "DUPE" }),
    post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: secondHost, code: "DUPE" }),
  ]);
  const successes = [first, second].filter((response) => response.ok);
  const failures = [first, second].filter((response) => !response.ok);
  const factory = env.ROOM_FACTORY.getByName("room-factory");

  assert.equal(factory.actions.filter((action) => action === "/api/room/create").length, 2);
  assert.equal(successes.length, 1);
  assert.equal(successes[0].room.code, "DUPE");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].error, "Room code is already in use.");
});

test("room object serializes concurrent invite creation", async () => {
  const env = makeEnvWithRooms();
  const host = player("host", "Host");
  const firstGuest = player("guest-a", "Guest A", "#2563eb");
  const secondGuest = player("guest-b", "Guest B", "#c43d5d");
  const room = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "INVT" });
  const [firstInvite, secondInvite] = await Promise.all([
    post(env, "/api/invite/create", { code: room.room.code, host_id: host.id, player: firstGuest }),
    post(env, "/api/invite/create", { code: room.room.code, host_id: host.id, player: secondGuest }),
  ]);
  const roomObject = env.ROOM_OBJECT.getByName("INVT");

  const successfulInvites = [firstInvite, secondInvite].filter((response) => response.ok);

  assert.equal(successfulInvites.length >= 1, true);
  assert.equal(roomObject.actions.filter((action) => action === "/api/invite/create").length, 2);
  assert.equal(roomObject.snapshots.at(-1).latest_invite.status, "pending");
});

test("owner tokens protect room actions through room authority", async () => {
  const env = makeStrictEnvWithRooms();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const hostCreated = await post(env, "/api/players/create", { player: host });
  const guestCreated = await post(env, "/api/players/create", { player: guest });
  const missingCreate = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "OWNR" });
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "OWNR", owner_token: hostCreated.owner_token });
  const missingJoin = await post(env, "/api/room/join", { code: "OWNR", player: guest });
  const joined = await post(env, "/api/room/join", { code: "OWNR", player: guest, owner_token: guestCreated.owner_token });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const missingMove = await post(env, "/api/room/move", { code: "OWNR", player_id: xSeat.id, board: 0, cell: 0 });
  const moved = await post(env, "/api/room/move", { code: "OWNR", player_id: xSeat.id, owner_token: xSeat.id === host.id ? hostCreated.owner_token : guestCreated.owner_token, board: 0, cell: 0 });

  assert.equal(missingCreate.ok, false);
  assert.equal(missingCreate.error, "Player owner token is required.");
  assert.equal(created.ok, true);
  assert.equal(missingJoin.ok, false);
  assert.equal(missingJoin.error, "Player owner token is required.");
  assert.equal(joined.ok, true);
  assert.equal(missingMove.ok, false);
  assert.equal(missingMove.error, "Player owner token is required.");
  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.move_count, 1);
});

test("notifies the room durable object after meaningful room changes", async () => {
  const env = makeEnvWithRooms();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "PUSH" });
  const roomObject = env.ROOM_OBJECT.getByName("PUSH");

  assert.equal(created.ok, true);
  assert.equal(roomObject.snapshots.length, 1);
  assert.equal(roomObject.snapshots[0].status, "waiting_for_player");

  const invite = await post(env, "/api/invite/create", { code: "PUSH", host_id: host.id, player: guest });
  assert.equal(invite.ok, true);
  assert.equal(roomObject.snapshots.at(-1).latest_invite.status, "pending");

  const declined = await post(env, "/api/invite/respond", { invite_id: invite.invite.id, accept: false, player: guest });
  assert.equal(declined.ok, true);
  assert.equal(roomObject.snapshots.at(-1).latest_invite.status, "declined");

  const joined = await post(env, "/api/room/join", { code: "PUSH", player: guest });
  assert.equal(joined.ok, true);
  assert.equal(roomObject.snapshots.at(-1).status, "active");
  assert.deepEqual(roomObject.actions, ["/api/invite/create", "/api/invite/respond", "/api/room/join"]);

  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  await post(env, "/api/room/move", { code: "PUSH", player_id: xSeat.id, board: 0, cell: 0 });
  assert.equal(roomObject.snapshots.at(-1).game.move_count, 1);

  await post(env, "/api/room/leave", { code: "PUSH", player_id: host.id, requester_id: host.id });
  assert.deepEqual(roomObject.closed, ["PUSH"]);
  assert.deepEqual(roomObject.actions, ["/api/invite/create", "/api/invite/respond", "/api/room/join", "/api/room/move", "/api/room/leave"]);
});

test("only Sogo can close any active room as superuser", async () => {
  const env = makeEnvWithRooms();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const sogo = player("sogo-id", "Sogo", "#8f1116");
  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/players/create", { player: guest });
  await post(env, "/api/players/create", { player: sogo });
  await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "SGCL" });
  const joined = await post(env, "/api/room/join", { code: "SGCL", player: guest });

  assert.equal(joined.room.status, "active");

  const rejected = await post(env, "/api/room/close", { code: "SGCL", requester_id: guest.id });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "Only the configured Sogo superuser can do this.");

  const stillOpen = await get(env, "/api/room?code=SGCL");
  assert.equal(stillOpen.ok, true);
  assert.equal(stillOpen.room.status, "active");

  const missingPasscode = await post(env, "/api/room/close", { code: "SGCL", requester_id: sogo.id });
  assert.equal(missingPasscode.ok, false);
  assert.equal(missingPasscode.error, "Sogo passcode is incorrect.");

  const wrongPasscode = await post(env, "/api/room/close", { code: "SGCL", requester_id: sogo.id, passcode: "wrong" });
  assert.equal(wrongPasscode.ok, false);
  assert.equal(wrongPasscode.error, "Sogo passcode is incorrect.");

  const verified = await post(env, "/api/superuser/verify", { requester_id: sogo.id, passcode: "1234" });
  assert.equal(verified.ok, true);
  assert.equal(verified.superuser, true);

  const closed = await post(env, "/api/room/close", { code: "SGCL", requester_id: sogo.id, passcode: "1234" });
  const roomObject = env.ROOM_OBJECT.getByName("SGCL");

  assert.equal(closed.ok, true);
  assert.equal(closed.closed, true);
  assert.equal(closed.superuser, true);
  assert.deepEqual(roomObject.closed, ["SGCL"]);
  assert.deepEqual(roomObject.actions.slice(-5), [
    "/api/room/join",
    "/api/room/close",
    "/api/room/close",
    "/api/room/close",
    "/api/room/close",
  ]);
});

test("Sogo superuser powers require configured player id allowlist", async () => {
  const env = makeStrictEnvWithRooms();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const sogo = player("sogo-id", "Not The Magic Name", "#8f1116");
  const impostor = player("not-sogo", "Sogo", "#8f1116");
  const hostCreated = await post(env, "/api/players/create", { player: host });
  const guestCreated = await post(env, "/api/players/create", { player: guest });
  const sogoCreated = await post(env, "/api/players/create", { player: sogo });
  const impostorCreated = await post(env, "/api/players/create", { player: impostor });
  await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "ALOW", owner_token: hostCreated.owner_token });
  await post(env, "/api/room/join", { code: "ALOW", player: guest, owner_token: guestCreated.owner_token });

  const impostorClose = await post(env, "/api/room/close", { code: "ALOW", requester_id: impostor.id, passcode: "1234", owner_token: impostorCreated.owner_token });
  const verified = await post(env, "/api/superuser/verify", { requester_id: sogo.id, passcode: "1234" });
  const closed = await post(env, "/api/room/close", { code: "ALOW", requester_id: sogo.id, passcode: "1234", owner_token: sogoCreated.owner_token });

  assert.equal(impostorClose.ok, false);
  assert.equal(impostorClose.error, "Only the configured Sogo superuser can do this.");
  assert.equal(verified.ok, true);
  assert.equal(closed.ok, true);
  assert.equal(closed.closed, true);
});

test("creates tactical rooms with authoritative pickups and scores", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TACT" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");
  const oSeat = joined.room.players.find((seat) => seat.mark === "O");

  const firstMove = await post(env, "/api/room/move", { code: "TACT", player_id: xSeat.id, board: 0, cell: 0 });
  assert.equal(firstMove.ok, true);
  assert.equal(firstMove.room.game.game_id, TACTICAL_GAME_ID);
  assert.equal(firstMove.room.game.pickups.length, 1);
  assert.equal(firstMove.room.game.pickups[0].type, "coin");
  assert.equal(firstMove.room.game.pickups[0].board, 0);
  assert.equal(firstMove.room.game.pickups[0].cell, 1);

  const capture = await post(env, "/api/room/move", { code: "TACT", player_id: oSeat.id, board: 0, cell: 1 });
  assert.equal(capture.ok, true);
  assert.equal(capture.room.game.scores[oSeat.mark], 10);
  assert.equal(capture.room.game.last_event.type, "pickupCaptured");
  assert.equal(capture.room.game.events.some((event) => event.type === "pickupCaptured" && event.points === 10), true);
}));

test("spawns treasure when a tactical sector is captured", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TRSR" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const game = data.rooms.TRSR.game;
    game.boards[0][0] = "X";
    game.boards[0][1] = "X";
    game.current_player = "X";
    game.next_board = 0;
    game.move_count = 4;
  });

  const moved = await post(env, "/api/room/move", { code: "TRSR", player_id: xSeat.id, board: 0, cell: 2 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.small_winners[0], "X");
  assert.equal(moved.room.game.pickups.some((pickup) => pickup.type === "treasureChest"), true);
  assert.equal(moved.room.game.pickups.some((pickup) => pickup.type === "coin"), true);
}));

test("tactical game ends on sector line and highest score wins", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/players/create", { player: guest });
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "SCOR" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const room = data.rooms.SCOR;
    const game = room.game;
    game.small_winners[0] = "X";
    game.small_winners[1] = "X";
    game.boards[2][0] = "X";
    game.boards[2][1] = "X";
    game.scores = { X: 20, O: 90 };
    game.current_player = "X";
    game.next_board = 2;
    game.move_count = 20;
  });

  const moved = await post(env, "/api/room/move", { code: "SCOR", player_id: xSeat.id, board: 2, cell: 2 });
  const stats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.small_winners[2], "X");
  assert.equal(moved.room.game.line_winner, "X");
  assert.equal(moved.room.game.status, "o_won");
  assert.equal(moved.room.game.winner, "O");
  assert.equal(moved.room.stats_recorded, true);
  assert.deepEqual(stats.stats.high_scores.map((entry) => entry.score), [90, 20]);
  const oRating = stats.stats.ratings.find((entry) => entry.player_id === joined.room.players.find((seat) => seat.mark === "O").id);
  const xRating = stats.stats.ratings.find((entry) => entry.player_id === xSeat.id);
  assert.equal(oRating.rating > xRating.rating, true);

  const repeatStats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");
  assert.equal(repeatStats.stats.high_scores.length, 2);
}));

test("tactical tied score on sector line awards the line completer", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "TIED" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const room = data.rooms.TIED;
    const game = room.game;
    game.small_winners[0] = "X";
    game.small_winners[1] = "X";
    game.boards[2][0] = "X";
    game.boards[2][1] = "X";
    game.scores = { X: 40, O: 40 };
    game.current_player = "X";
    game.next_board = 2;
    game.move_count = 20;
  });

  const moved = await post(env, "/api/room/move", { code: "TIED", player_id: xSeat.id, board: 2, cell: 2 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.line_winner, "X");
  assert.equal(moved.room.game.status, "x_won");
  assert.equal(moved.room.game.winner, "X");
  assert.equal(moved.room.stats_recorded, true);
}));

test("player profile edits refresh stats display names and icons", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host", "#d946ef");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "EDIT" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const room = data.rooms.EDIT;
    const game = room.game;
    game.small_winners[0] = "X";
    game.small_winners[1] = "X";
    game.boards[2][0] = "X";
    game.boards[2][1] = "X";
    game.scores = { X: 50, O: 10 };
    game.current_player = "X";
    game.next_board = 2;
    game.move_count = 20;
  });

  await post(env, "/api/room/move", { code: "EDIT", player_id: xSeat.id, board: 2, cell: 2 });
  const edited = await post(env, "/api/players/create", {
    player: { ...xSeat, name: "Renamed Player", icon: "ZZ", color: "#16a34a" },
  });
  const stats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");
  const playerStats = await get(env, `/api/player/stats?player_id=${encodeURIComponent(xSeat.id)}`);
  const highScore = stats.stats.high_scores.find((entry) => entry.player_id === xSeat.id);
  const rating = stats.stats.ratings.find((entry) => entry.player_id === xSeat.id);
  const tacticalStats = playerStats.stats.find((entry) => entry.game_id === TACTICAL_GAME_ID);
  const classicStats = playerStats.stats.find((entry) => entry.game_id === CLASSIC_GAME_ID);

  assert.equal(edited.ok, true);
  assert.equal(edited.player.id, xSeat.id);
  assert.equal(highScore.player_name, "Renamed Player");
  assert.equal(highScore.player_icon, "ZZ");
  assert.equal(rating.player_name, "Renamed Player");
  assert.equal(rating.player_icon, "ZZ");
  assert.equal(tacticalStats.games_played, 1);
  assert.equal(tacticalStats.games_won, 1);
  assert.equal(tacticalStats.personal_high_score, 50);
  assert.equal(tacticalStats.elo > 1000, true);
  assert.equal(classicStats.games_played, 0);
  assert.equal(classicStats.games_won, 0);
  assert.equal(classicStats.personal_high_score, 0);
  assert.equal(classicStats.elo, 1000);

  const cleared = await post(env, "/api/player/stats/clear", { player_id: xSeat.id });
  const clearedGameStats = await get(env, "/api/stats?game_id=super_tactical_tac_toe");
  const clearedTacticalStats = cleared.stats.find((entry) => entry.game_id === TACTICAL_GAME_ID);

  assert.equal(cleared.ok, true);
  assert.equal(clearedTacticalStats.games_played, 0);
  assert.equal(clearedTacticalStats.games_won, 0);
  assert.equal(clearedTacticalStats.personal_high_score, 0);
  assert.equal(clearedTacticalStats.elo, 1000);
  assert.equal(clearedGameStats.stats.high_scores.some((entry) => entry.player_id === xSeat.id), false);
  assert.equal(clearedGameStats.stats.ratings.some((entry) => entry.player_id === xSeat.id), false);
}));

test("player edit broadcasts affected room snapshots", async () => {
  const env = makeEnvWithEvents();
  const host = player("host", "Host", "#d946ef");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "EDIT" });
  await post(env, "/api/room/join", { code: "EDIT", player: guest });
  const edited = await post(env, "/api/players/create", {
    player: { ...host, name: "Host Renamed", icon: "HR", color: "#16a34a" },
  });
  const roomObject = env.ROOM_OBJECT.getByName("EDIT");
  const tacticalHub = env.EVENT_HUB.getByName(TACTICAL_GAME_ID);

  assert.equal(edited.ok, true);
  assert.equal(edited.rooms.length, 1);
  assert.equal(roomObject.snapshots.at(-1).players.find((seat) => seat.id === host.id).name, "Host Renamed");
  assert.equal(tacticalHub.snapshots.at(-1).rooms.find((room) => room.code === "EDIT").players.find((seat) => seat.id === host.id).name, "Host Renamed");
});

test("stats clear notifies all ready game event hubs", async () => {
  const env = makeEnvWithEvents();
  const host = player("host", "Host");
  await post(env, "/api/players/create", { player: host });
  mutateState(env, (data) => {
    data.stats = {
      high_scores: {
        [TACTICAL_GAME_ID]: [{ player_id: host.id, player_name: host.name, player_icon: host.icon, score: 50 }],
      },
      ratings: {
        [TACTICAL_GAME_ID]: { [host.id]: { player_id: host.id, player_name: host.name, player_icon: host.icon, rating: 1016, games: 1, wins: 1, losses: 0, draws: 0 } },
      },
      personal: {
        [TACTICAL_GAME_ID]: { [host.id]: { player_id: host.id, player_name: host.name, player_icon: host.icon, games_played: 1, games_won: 1, personal_high_score: 50 } },
      },
    };
  });

  const cleared = await post(env, "/api/player/stats/clear", { player_id: host.id });
  const tacticalHub = env.EVENT_HUB.getByName(TACTICAL_GAME_ID);
  const classicHub = env.EVENT_HUB.getByName(CLASSIC_GAME_ID);

  assert.equal(cleared.ok, true);
  assert.equal(tacticalHub.snapshots.at(-1).stats.high_scores.some((entry) => entry.player_id === host.id), false);
  assert.equal(tacticalHub.snapshots.at(-1).stats.ratings.some((entry) => entry.player_id === host.id), false);
  assert.equal(classicHub.snapshots.at(-1).game_id, CLASSIC_GAME_ID);
});

test("public game stats exclude missing players without capping rows", async () => {
  const env = makeEnv();
  const roster = Array.from({ length: 6 }, (_, index) => player(`p${index + 1}`, `Player ${index + 1}`));
  for (const item of roster) {
    await post(env, "/api/players/create", { player: item });
  }
  mutateState(env, (data) => {
    data.stats = {
      high_scores: {
        [TACTICAL_GAME_ID]: [
          ...roster.map((item, index) => ({
            player_id: item.id,
            player_name: item.name,
            player_icon: item.icon,
            score: 100 - index,
            recorded_at: `2026-06-09T00:00:0${index}Z`,
          })),
          { player_id: "missing", player_name: "Missing", player_icon: "M", score: 999, recorded_at: "2026-06-09T00:00:09Z" },
        ],
      },
      ratings: {
        [TACTICAL_GAME_ID]: {
          ...Object.fromEntries(roster.map((item, index) => [item.id, {
            player_id: item.id,
            player_name: item.name,
            player_icon: item.icon,
            rating: 1100 - index,
            games: 1,
            wins: 1,
            losses: 0,
            draws: 0,
          }])),
          missing: {
            player_id: "missing",
            player_name: "Missing",
            player_icon: "M",
            rating: 9999,
            games: 1,
            wins: 1,
            losses: 0,
            draws: 0,
          },
        },
      },
      personal: {},
    };
  });

  const stats = await get(env, `/api/stats?game_id=${TACTICAL_GAME_ID}`);

  assert.equal(stats.ok, true);
  assert.equal(stats.stats.high_scores.length, 6);
  assert.equal(stats.stats.ratings.length, 6);
  assert.equal(stats.stats.high_scores.some((entry) => entry.player_id === "missing"), false);
  assert.equal(stats.stats.ratings.some((entry) => entry.player_id === "missing"), false);
});

test("public game stats exclude hidden test players", async () => {
  const env = makeEnv();
  const visible = player("visible", "Visible Player");
  await post(env, "/api/players/create", { player: visible });
  await post(env, "/api/players/create", { player: { id: "codex-test-player-1" } });
  mutateState(env, (data) => {
    data.stats = {
      high_scores: {
        [TACTICAL_GAME_ID]: [
          {
            player_id: visible.id,
            player_name: visible.name,
            player_icon: visible.icon,
            score: 12,
            recorded_at: "2026-06-09T00:00:00Z",
          },
          {
            player_id: "codex-test-player-1",
            player_name: "Codex Test 1",
            player_icon: "T",
            score: 999,
            recorded_at: "2026-06-09T00:00:01Z",
          },
        ],
      },
      ratings: {
        [TACTICAL_GAME_ID]: {
          [visible.id]: {
            player_id: visible.id,
            player_name: visible.name,
            player_icon: visible.icon,
            rating: 1000,
            games: 1,
            wins: 0,
            losses: 0,
            draws: 1,
          },
          "codex-test-player-1": {
            player_id: "codex-test-player-1",
            player_name: "Codex Test 1",
            player_icon: "T",
            rating: 3000,
            games: 1,
            wins: 1,
            losses: 0,
            draws: 0,
          },
        },
      },
      personal: {},
    };
  });

  const stats = await get(env, `/api/stats?game_id=${TACTICAL_GAME_ID}`);

  assert.equal(stats.stats.high_scores.length, 1);
  assert.equal(stats.stats.ratings.length, 1);
  assert.equal(stats.stats.high_scores[0].player_id, visible.id);
  assert.equal(stats.stats.ratings[0].player_id, visible.id);
});

test("tactical score goal alone does not end the game", async () => withMockRandom([0], async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const created = await post(env, "/api/room/create", { game_id: "super_tactical_tac_toe", player: host, code: "GOAL" });
  const joined = await post(env, "/api/room/join", { code: created.room.code, player: guest });
  const xSeat = joined.room.players.find((seat) => seat.mark === "X");

  mutateState(env, (data) => {
    const game = data.rooms.GOAL.game;
    game.scores = { X: 100, O: 0 };
    game.current_player = "X";
    game.next_board = null;
  });

  const moved = await post(env, "/api/room/move", { code: "GOAL", player_id: xSeat.id, board: 0, cell: 0 });

  assert.equal(moved.ok, true);
  assert.equal(moved.room.game.status, "playing");
  assert.equal(moved.room.game.winner, null);
}));

test("notifies the app event hub with room, lobby, and invite snapshots", async () => {
  const env = makeEnvWithEvents();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");

  await post(env, "/api/players/create", { player: host });
  let eventHub = env.EVENT_HUB.getByName(CLASSIC_GAME_ID);
  assert.equal(eventHub.snapshots.at(-1).type, "app_snapshot");
  assert.deepEqual(eventHub.snapshots.at(-1).rooms, []);

  const presence = await post(env, "/api/lobby/presence", { game_id: "super_tic_tac_toe", player: host });
  assert.equal(presence.ok, true);
  assert.deepEqual(eventHub.snapshots.at(-1).lobby_players.map((item) => item.id), ["host"]);

  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "EVNT" });
  assert.equal(created.ok, true);
  assert.deepEqual(eventHub.snapshots.at(-1).rooms.map((room) => room.code), ["EVNT"]);

  const invite = await post(env, "/api/invite/create", { code: "EVNT", host_id: host.id, player: guest });
  assert.equal(invite.ok, true);
  assert.equal(eventHub.snapshots.at(-1).pending_invites_by_player.guest[0].id, "EVNT:guest");

  const declined = await post(env, "/api/invite/respond", { invite_id: invite.invite.id, accept: false, player: guest });
  assert.equal(declined.ok, true);
  assert.equal(eventHub.snapshots.at(-1).pending_invites_by_player.guest, undefined);
});

test("event hub sends an initial snapshot for a subscription", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  await post(env, "/api/players/create", { player: host });
  await post(env, "/api/lobby/presence", { game_id: "super_tic_tac_toe", player: host });
  const hub = new EventHubDurableObject({}, env);
  const sent = [];
  const session = { send: (message) => sent.push(JSON.parse(message)) };
  hub.sessions.set(session, { game_id: CLASSIC_GAME_ID, player_id: host.id });

  await hub.sendInitialSnapshot(session);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "app_snapshot");
  assert.equal(sent[0].game_id, CLASSIC_GAME_ID);
  assert.deepEqual(sent[0].lobby_players.map((item) => item.id), [host.id]);
});

test("event hub broadcasts through hibernated sockets with serialized subscriptions", async () => {
  const env = makeEnv();
  const classicSocket = new MockHibernatedSocket({ game_id: CLASSIC_GAME_ID, player_id: "host" });
  const tacticalSocket = new MockHibernatedSocket({ game_id: TACTICAL_GAME_ID, player_id: "guest" });
  const hub = new EventHubDurableObject({ getWebSockets: () => [classicSocket, tacticalSocket] }, env);

  hub.broadcastSnapshot({
    type: "app_snapshot",
    game_id: CLASSIC_GAME_ID,
    rooms: [],
    lobby_players: [player("host", "Host")],
    pending_invites_by_player: { host: [{ id: "ABCD:host" }] },
    stats: {},
  });

  assert.equal(classicSocket.sent.length, 1);
  assert.equal(classicSocket.sent[0].type, "app_snapshot");
  assert.deepEqual(classicSocket.sent[0].pending_invites.map((invite) => invite.id), ["ABCD:host"]);
  assert.equal(tacticalSocket.sent.length, 0);
});

test("event hub subscribe messages update hibernated socket attachments", async () => {
  const env = makeEnv();
  const host = player("host", "Host");
  await post(env, "/api/players/create", { player: host });
  const socket = new MockHibernatedSocket({ game_id: CLASSIC_GAME_ID, player_id: "" });
  const hub = new EventHubDurableObject({ getWebSockets: () => [socket] }, env);

  await hub.webSocketMessage(socket, JSON.stringify({ type: "subscribe", game_id: TACTICAL_GAME_ID, player_id: "host" }));

  assert.equal(socket.attachment.game_id, TACTICAL_GAME_ID);
  assert.equal(socket.attachment.player_id, "host");
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].game_id, TACTICAL_GAME_ID);
});

test("room broadcasts through hibernated sockets when in-memory sessions are empty", () => {
  const socket = new MockHibernatedSocket({ type: "room" });
  const room = new RoomDurableObject({ getWebSockets: () => [socket] }, makeEnv());

  room.broadcast({ type: "room_closed", code: "ZZZZ" });

  assert.deepEqual(socket.sent, [{ type: "room_closed", code: "ZZZZ" }]);
});

test("routes tactical lobby snapshots through the tactical event hub", async () => {
  const env = makeEnvWithEvents();
  const host = player("host", "Host");

  const presence = await post(env, "/api/lobby/presence", { game_id: "super_tactical_tac_toe", player: host });
  const tacticalHub = env.EVENT_HUB.getByName(TACTICAL_GAME_ID);
  const classicHub = env.EVENT_HUB.getByName(CLASSIC_GAME_ID);

  assert.equal(presence.ok, true);
  assert.equal(tacticalHub.snapshots.at(-1).game_id, TACTICAL_GAME_ID);
  assert.deepEqual(tacticalHub.snapshots.at(-1).lobby_players.map((item) => item.id), ["host"]);
  assert.equal(classicHub.snapshots.length, 0);
});
