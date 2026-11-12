// Who each game is waiting on (awaiting_marks): the signal behind the
// active-games switcher and needs-me alerts. Every game must name only seated
// marks, and a freshly started game must wait on someone.
import test from "node:test";
import assert from "node:assert/strict";
import { newGame, initGameSeats, gameToDict, awaitingMarksForGame } from "../games/handlers.js";
import { GAME_REGISTRY } from "../../src/sogotable/static/games/registry.js";
import { createActiveRoom, get, makeEnvWithRooms, player, post } from "./helpers.js";

const SEAT_COUNT = { "♥ Hearts": 4, "🗺️ Hidden Isles": 4 };
// Games that open on a shared setup step anyone at the table may finish (Hidden
// Isles: pick crews/Navigators, then deal) wait on no one in particular there.
const OPEN_SETUP = new Set(["🗺️ Hidden Isles"]);

function seatsFor(entry) {
  const count = entry.host_start ? (SEAT_COUNT[entry.name] || 3) : 2;
  return Array.from({ length: count }, (_, i) => ({
    id: `h${i + 1}`, name: `H${i + 1}`, kind: "human",
    mark: entry.host_start ? `P${i + 1}` : (i === 0 ? "X" : "O"),
  }));
}

function startedView(entry) {
  const game = newGame(entry.id);
  const seats = seatsFor(entry);
  if (entry.host_start) initGameSeats(game, seats);
  return { view: gameToDict(game), marks: seats.map((seat) => seat.mark) };
}

for (const entry of GAME_REGISTRY.filter((item) => item.availability === "ready")) {
  test(`awaiting: ${entry.name} waits only on seated marks, and on someone at the start`, () => {
    const { view, marks } = startedView(entry);
    const awaiting = awaitingMarksForGame(view);
    assert.ok(Array.isArray(awaiting));
    for (const mark of awaiting) assert.ok(marks.includes(mark), `${mark} is not seated`);
    if (!OPEN_SETUP.has(entry.name)) assert.ok(awaiting.length > 0, `${entry.name} waits on nobody at the start`);
  });
}

test("awaiting: simultaneous games wait on every seat that has not committed", () => {
  const view = { game_id: "e7c1a4b9d206", status: "playing", phase: "playing", players: [
    { mark: "P1", has_committed: true }, { mark: "P2", has_committed: false }, { mark: "P3", has_committed: false },
  ] };
  assert.deepEqual(awaitingMarksForGame(view), ["P2", "P3"]);
  assert.deepEqual(awaitingMarksForGame({ ...view, phase: "review", players: view.players.map((s) => ({ ...s, ready_next: s.mark === "P2" })) }), ["P1", "P3"]);
});

test("awaiting: Hidden Isles waits on the crew on turn — its Navigator for the clue, its guessers to guess", () => {
  const players = [
    { mark: "P1", team: "A", role: "guide" }, { mark: "P2", team: "A", role: "guesser" },
    { mark: "P3", team: "B", role: "guide" }, { mark: "P4", team: "B", role: "guesser" },
  ];
  const view = { game_id: "aa6b6dee04ef", status: "playing", turn_team: "B", players };
  assert.deepEqual(awaitingMarksForGame({ ...view, phase: "clue" }), ["P3"]);
  assert.deepEqual(awaitingMarksForGame({ ...view, phase: "guess" }), ["P4"]);
  assert.deepEqual(awaitingMarksForGame({ ...view, phase: "setup", turn_team: null }), []);
});

test("awaiting: a finished or unknown game waits on nobody", () => {
  assert.deepEqual(awaitingMarksForGame({ game_id: "a3f19c6e42b8", status: "x_won", current_player: "O" }), []);
  assert.deepEqual(awaitingMarksForGame(null), []);
});

test("api: the room dict carries awaiting_marks, empty before start", async () => {
  const env = makeEnvWithRooms();
  const host = player("host", "Host");
  const created = await post(env, "/api/room/create", { game_id: "super_tic_tac_toe", player: host, code: "WAIT" });
  assert.deepEqual(created.room.awaiting_marks, []);
  const { room } = await createActiveRoom(makeEnvWithRooms());
  assert.deepEqual(room.awaiting_marks, [room.game.current_player]);
});

test("api: /api/my-rooms lists a player's unfinished tables across games with awaiting_marks", async () => {
  const env = makeEnvWithRooms();
  const { room, host, guest } = await createActiveRoom(env);
  await post(env, "/api/room/create", { game_id: "potion_lab", player: host, code: "POTN" });
  const mine = await get(env, `/api/my-rooms?player_id=${host.id}`);
  assert.equal(mine.ok, true);
  assert.deepEqual(mine.rooms.map((item) => item.code), ["ABCD", "POTN"]);
  const active = mine.rooms.find((item) => item.code === room.code);
  assert.deepEqual(active.awaiting_marks, [room.game.current_player]);
  assert.deepEqual(mine.rooms.find((item) => item.code === "POTN").awaiting_marks, []);
  const guestRooms = await get(env, `/api/my-rooms?player_id=${guest.id}`);
  assert.deepEqual(guestRooms.rooms.map((item) => item.code), ["ABCD"]);
  assert.deepEqual((await get(env, "/api/my-rooms")).rooms, []);
});
