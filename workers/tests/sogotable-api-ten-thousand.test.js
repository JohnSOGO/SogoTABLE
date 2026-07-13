import assert from "node:assert/strict";
import test from "node:test";
import {
  tenThousandTest, TEN_THOUSAND_GAME_ID,
  makeEnv, player, get, post, withMockRandom,
} from "./helpers.js";

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
