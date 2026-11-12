// Exit no longer deletes the table for everyone: before start the seat is
// removed (host handed on), after start it is marked away and the game goes
// on; the table closes only when no human is left. Leaving is always owner-
// authenticated and only works for someone actually seated.
import test from "node:test";
import assert from "node:assert/strict";
import { makeStrictEnvWithRooms, makeEnvWithRooms, player, post } from "./helpers.js";
import { leaveRoomSeat, returnToRoomSeat, handleResetVote } from "../room-seats.js";
import { GAME_IDS } from "../../src/sogotable/static/games/registry.js";

const seat = (id, mark, extra = {}) => ({ id, name: id, mark, ...extra });

test("room-seats: leaving a waiting table removes the seat and hands host to the next human", () => {
  const room = { game_id: GAME_IDS.noThanks, host_id: "a", started: false, players: [seat("a", "P1"), seat("b", "P2"), seat("c", "P3")], reset_votes: [] };
  assert.deepEqual(leaveRoomSeat(room, "a"), { outcome: "removed" });
  assert.equal(room.host_id, "b");
  assert.deepEqual(room.players.map((item) => `${item.id}:${item.mark}`), ["b:P1", "c:P2"]);
});

test("room-seats: leaving a started game marks the seat away and keeps the table", () => {
  const room = { game_id: GAME_IDS.noThanks, host_id: "a", started: true, players: [seat("a", "P1"), seat("b", "P2")], reset_votes: [] };
  assert.deepEqual(leaveRoomSeat(room, "a"), { outcome: "away" });
  assert.equal(room.players[0].away, true);
  assert.equal(room.players[0].mark, "P1", "marks are fixed once the game starts");
  assert.equal(room.host_id, "b");
  assert.equal(returnToRoomSeat(room, "a"), true);
  assert.equal(room.players[0].away, undefined);
});

test("room-seats: the last human leaving (bots don't count) deletes the table", () => {
  const room = { game_id: GAME_IDS.noThanks, host_id: "a", started: true, players: [seat("a", "P1"), seat("bot", "P2", { kind: "bot" })], reset_votes: [] };
  assert.deepEqual(leaveRoomSeat(room, "a"), { outcome: "delete" });
});

test("room-seats: someone not seated cannot leave", () => {
  const room = { game_id: GAME_IDS.noThanks, host_id: "a", started: true, players: [seat("a", "P1")], reset_votes: [] };
  assert.throws(() => leaveRoomSeat(room, "zz"), /not at this table/);
});

test("room-seats: an away seat never blocks a reset vote", () => {
  const room = { game_id: GAME_IDS.classic, host_id: "a", started: true, players: [seat("a", "X"), seat("b", "O", { away: true })], reset_votes: [], game: {} };
  assert.equal(handleResetVote(room, "a", true) === "pending", false);
});

test("api: leaving requires the owner token of a seated player", async () => {
  const env = makeStrictEnvWithRooms();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  const hostCreated = await post(env, "/api/players/create", { player: host });
  const guestCreated = await post(env, "/api/players/create", { player: guest });
  await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "LEAV", owner_token: hostCreated.owner_token });

  const anonymous = await post(env, "/api/room/leave", { code: "LEAV" });
  assert.equal(anonymous.ok, false);
  const outsider = await post(env, "/api/room/leave", { code: "LEAV", requester_id: guest.id, owner_token: guestCreated.owner_token });
  assert.equal(outsider.ok, false);
  assert.match(outsider.error, /not at this table/);
  const room = await post(env, "/api/room/leave", { code: "LEAV", requester_id: host.id, owner_token: "wrong" });
  assert.equal(room.ok, false);
});

test("api: a player who exits a live game can rejoin their seat", async () => {
  const env = makeEnvWithRooms();
  const host = player("host", "Host");
  const guest = player("guest", "Guest", "#2563eb");
  await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "BACK" });
  await post(env, "/api/room/join", { code: "BACK", player: guest });
  const left = await post(env, "/api/room/leave", { code: "BACK", requester_id: guest.id });
  assert.equal(left.left, "away");
  assert.equal(left.room.host_id, host.id);
  const back = await post(env, "/api/room/join", { code: "BACK", player: guest });
  assert.equal(back.ok, true);
  assert.equal(back.room.players.find((item) => item.id === guest.id).away, undefined);
});
