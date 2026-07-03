// Mazewright — crawl-engine, wrapper-resilience, and wire-contract tests.
// Pins what the 2026-07-03 Verification Gates found unpinned: the fog crawl
// (every {moves, loot} a score consumes), the POST_RESULT dedupe/clamps, the
// SKIP_PLAYER barrier escape, the exact projection key sets, and the two
// platform guards (game_epoch staleness, late join). Companion to the
// flow/scoring tests in sogotable-api.test.js (pinned — new coverage lands here).
import assert from "node:assert/strict";
import test from "node:test";
import { makeEnv, player, post } from "./helpers.js";
import {
  newMazewrightGame, initMazewrightSeats, makeMazewrightMove, mazewrightGameToDict,
} from "../games/mazewright/rules.js";
import {
  PHASE, createGame, mazeCode, applyAction, loadRunFromCode, legalMoves,
  buildRandomMazeCode, isValidMazeCode, shortestPathFromCode, edgeKey,
} from "../../src/sogotable/static/games/mazewright/rules.js";

// ---- crawl-test rig: hand-built designs + a geometry-blind walker ----------
// loadRunFromCode always applies a server transform, so tests never hardcode
// post-transform coordinates: they read state.exit/state.pos and steer by
// probing MOVE on a clone — exactly as blind as a real runner.

function designCode({ start = [3, 3], exit = { cell: [3, 0], dir: "N" }, gems, walls = [] }) {
  const g = createGame();
  g.walls = {};
  for (const [a, b] of walls) g.walls[edgeKey(a, b)] = true;
  g.start = [...start];
  g.pos = [...start];
  g.exit = { cell: [...exit.cell], dir: exit.dir };
  g.items = gems.map((cell) => ({ type: "diamond", cell: [...cell] }));   // exactly 5 — the code format is fixed
  return mazeCode(g);
}

const FAR_GEMS = [[0, 0], [6, 0], [0, 6], [6, 6], [5, 5]];   // parked away from the 3,3 start
const T = { axis: "x", rot: 90 };
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

function stepToward(state, target) {
  for (const dir of ["N", "S", "E", "W"]) {
    const probe = structuredClone(state);
    try { applyAction(probe, { type: "MOVE", dir }); } catch { continue; }
    if (probe.phase !== PHASE.CRAWL) continue;                    // that step walks out the exit arch
    if (dist(probe.pos, target) < dist(state.pos, target)) {
      applyAction(state, { type: "MOVE", dir });
      return;
    }
  }
  throw new Error(`no step from ${state.pos} toward ${target}`);
}

function walkTo(state, target) {
  let guard = 0;
  while (dist(state.pos, target) > 0) {
    stepToward(state, target);
    if (++guard > 100) throw new Error("walker is lost");
  }
}

test("Mazewright crawl: a step costs one move and marks the cell visited", () => {
  const state = createGame();
  loadRunFromCode(state, designCode({ gems: FAR_GEMS }), T);
  assert.equal(state.phase, PHASE.CRAWL);
  assert.equal(state.moves, 0);
  const open = legalMoves(state);
  assert.equal(open.length > 0, true);
  applyAction(state, { type: "MOVE", dir: open[0].dir });
  assert.equal(state.moves, 1);
  assert.deepEqual(state.pos, open[0].to);
  assert.equal(state.visited[`${open[0].to[0]},${open[0].to[1]}`], true);
});

test("Mazewright crawl: a bump costs one move, reveals the wall, and does not move you", () => {
  // The start cell is boxed in by four walls — every direction is a bump.
  const boxed = [[[3, 3], [3, 2]], [[3, 3], [3, 4]], [[3, 3], [2, 3]], [[3, 3], [4, 3]]];
  const state = createGame();
  loadRunFromCode(state, designCode({ gems: FAR_GEMS, walls: boxed }), T);
  assert.deepEqual(legalMoves(state), []);
  const posBefore = [...state.pos];
  applyAction(state, { type: "MOVE", dir: "N" });
  assert.equal(state.moves, 1);                                   // a bump is a real move — the spec's "move = step OR wall discovery"
  assert.deepEqual(state.pos, posBefore);
  const revealed = Object.keys(state.revealedWalls).length + Object.keys(state.revealedPerim).length;
  assert.equal(revealed, 1);
});

test("Mazewright crawl: gems collect on entry, a start-cell gem collects on spawn, never twice", () => {
  // One gem under the runner's feet + four in a plus around the start.
  const state = createGame();
  loadRunFromCode(state, designCode({ gems: [[3, 3], [2, 3], [4, 3], [3, 2], [3, 4]] }), T);
  assert.equal(state.inventory.length, 1);                        // spawn gem — no step-off-step-back dance
  assert.equal(state.moves, 0);
  const home = [...state.pos];
  const open = legalMoves(state);
  applyAction(state, { type: "MOVE", dir: open[0].dir });         // any neighbour holds a gem
  assert.equal(state.inventory.length, 2);
  walkTo(state, home);                                            // returning collects nothing twice
  assert.equal(state.inventory.length, 2);
  assert.equal(state.moves, 2);
});

test("Mazewright crawl: a perfect escape equals the server floor under every transform", () => {
  const code = designCode({ gems: FAR_GEMS, exit: { cell: [6, 3], dir: "E" } });
  const floor = shortestPathFromCode(code);
  for (const axis of ["x", "y"]) {
    for (const rot of [90, -90]) {
      const state = createGame();
      loadRunFromCode(state, code, { axis, rot });
      walkTo(state, state.exit.cell);                             // empty maze: manhattan IS the bfs distance
      applyAction(state, { type: "MOVE", dir: state.exit.dir });  // step through the arch
      assert.equal(state.phase, PHASE.MAZE_DONE);
      assert.equal(state.moves, floor);                           // transform is distance-invariant
    }
  }
});

test("Mazewright: buildRandomMazeCode always passes the human validation gate", () => {
  for (let i = 0; i < 10; i++) assert.equal(isValidMazeCode(buildRandomMazeCode()), true);
});

// ---- wrapper resilience ----------------------------------------------------

function runningGame() {
  const game = newMazewrightGame();
  initMazewrightSeats(game, [
    { mark: "P1", name: "A", kind: "human" },
    { mark: "P2", name: "B", kind: "human" },
  ]);
  makeMazewrightMove(game, "P1", { type: "SUBMIT_MAZE", code: buildRandomMazeCode() });
  makeMazewrightMove(game, "P2", { type: "SUBMIT_MAZE", code: buildRandomMazeCode() });
  assert.equal(game.status, "running");
  return game;
}

test("Mazewright wrapper: a duplicate or out-of-order POST_RESULT is rejected and the deck pointer stands", () => {
  const game = runningGame();
  makeMazewrightMove(game, "P1", { type: "POST_RESULT", index: 0, moves: 50, loot: 2 });
  assert.equal(game.players.P1.runIndex, 1);
  // duplicate tab replays maze 0 — without the stamp this would be credited to maze 1
  assert.throws(() => makeMazewrightMove(game, "P1", { type: "POST_RESULT", index: 0, moves: 7, loot: 5 }), /Stale result/);
  assert.throws(() => makeMazewrightMove(game, "P1", { type: "POST_RESULT", index: 5, moves: 7, loot: 5 }), /Stale result/);
  assert.equal(game.players.P1.results.length, 1);
  assert.equal(game.players.P1.runIndex, 1);
  // unstamped = legacy client mid-deploy: accepted at the current pointer
  makeMazewrightMove(game, "P1", { type: "POST_RESULT", moves: 60, loot: 1 });
  assert.equal(game.players.P1.runDone, true);
});

test("Mazewright wrapper: moves are clamped to a finite band — floor AND ceiling", () => {
  const game = runningGame();
  const floor0 = Math.max(1, shortestPathFromCode(game.players[game.deck[0].author].maze));
  makeMazewrightMove(game, "P1", { type: "POST_RESULT", index: 0, moves: Infinity, loot: 99 });
  assert.equal(game.players.P1.results[0].moves, floor0);         // non-finite → floor, never Infinity→null through D1
  assert.equal(game.players.P1.results[0].loot, 5);
  makeMazewrightMove(game, "P1", { type: "POST_RESULT", index: 1, moves: 1e15, loot: -3 });
  assert.equal(game.players.P1.results[1].moves, 9999);
  assert.equal(game.players.P1.results[1].loot, 0);
});

test("Mazewright wrapper: unknown, unseated, and wrong-phase actions throw with detail", () => {
  const game = runningGame();
  assert.throws(() => makeMazewrightMove(game, "P1", { type: "HACK_THE_GIBSON" }), /Unknown Mazewright action/);
  assert.throws(() => makeMazewrightMove(game, "NOBODY", { type: "POST_RESULT", moves: 5, loot: 0 }), /not seated/);
  assert.throws(() => makeMazewrightMove(game, "P1", { type: "SUBMIT_MAZE", code: buildRandomMazeCode() }), /build phase is over/);
  const fresh = newMazewrightGame();
  initMazewrightSeats(fresh, [{ mark: "P1", name: "A", kind: "human" }, { mark: "P2", name: "B", kind: "human" }]);
  assert.throws(() => makeMazewrightMove(fresh, "P1", { type: "POST_RESULT", moves: 5, loot: 0 }), /No maze run is open/);
});

test("Mazewright wrapper: SKIP_PLAYER at the build barrier fills the seat honestly and releases the table", () => {
  const game = newMazewrightGame();
  initMazewrightSeats(game, [
    { mark: "P1", name: "A", kind: "human" },
    { mark: "P2", name: "B", kind: "human" },
    { mark: "P3", name: "Bot", kind: "bot" },
  ]);
  // eligibility is the server's: not-done actors, bots, and self are refused
  assert.throws(() => makeMazewrightMove(game, "P1", { type: "SKIP_PLAYER", target: "P2" }), /Submit your own maze/);
  makeMazewrightMove(game, "P1", { type: "SUBMIT_MAZE", code: buildRandomMazeCode() });
  assert.throws(() => makeMazewrightMove(game, "P1", { type: "SKIP_PLAYER", target: "P3" }), /human player/);
  assert.throws(() => makeMazewrightMove(game, "P1", { type: "SKIP_PLAYER", target: "P1" }), /human player/);
  makeMazewrightMove(game, "P1", { type: "SKIP_PLAYER", target: "P2" });
  assert.equal(game.players.P2.built, true);
  assert.equal(game.players.P2.skipped, true);                    // the seat is told the truth
  assert.equal(isValidMazeCode(game.players.P2.maze), true);      // the auto-maze passes the human gate
  assert.equal(game.status, "running");                           // barrier released
  const seat = mazewrightGameToDict(game).players.find((s) => s.mark === "P2");
  assert.equal(seat.skipped, true);
});

test("Mazewright wrapper: SKIP_PLAYER at the run barrier posts simulated runs; skipping the already-done is a quiet no-op", () => {
  const game = newMazewrightGame();
  initMazewrightSeats(game, [
    { mark: "P1", name: "A", kind: "human" },
    { mark: "P2", name: "B", kind: "human" },
    { mark: "P3", name: "C", kind: "human" },
  ]);
  for (const m of ["P1", "P2", "P3"]) makeMazewrightMove(game, m, { type: "SUBMIT_MAZE", code: buildRandomMazeCode() });
  for (let i = 0; i < 3; i++) {
    makeMazewrightMove(game, "P1", { type: "POST_RESULT", index: i, moves: 30, loot: 1 });
    makeMazewrightMove(game, "P2", { type: "POST_RESULT", index: i, moves: 40, loot: 2 });
  }
  assert.throws(() => makeMazewrightMove(game, "P3", { type: "SKIP_PLAYER", target: "P1" }), /Finish your own runs/);
  makeMazewrightMove(game, "P1", { type: "SKIP_PLAYER", target: "P2" });   // already done — races resolve silently
  assert.equal(game.players.P2.skipped, undefined);
  assert.equal(game.status, "running");
  makeMazewrightMove(game, "P1", { type: "SKIP_PLAYER", target: "P3" });
  assert.equal(game.players.P3.runDone, true);
  assert.equal(game.players.P3.results.length, 3);                // simulated runs, the bot pre-resolve path
  assert.equal(game.players.P3.skipped, true);
  assert.equal(game.status, "complete");
  assert.equal(typeof game.winner, "string");
  assert.throws(() => makeMazewrightMove(game, "P1", { type: "SKIP_PLAYER", target: "P3" }), /Nothing to skip/);
});

// ---- wire contract ----------------------------------------------------------

test("Mazewright projection: the exact key sets are pinned (game, seat, deck entry)", () => {
  const dict = mazewrightGameToDict(runningGame());
  // The projection IS the wire contract: a silent rename must fail HERE, not
  // as an `undefined` in the client (the RTTA key-set pin, applied here).
  assert.deepEqual(Object.keys(dict).sort(), [
    "deck", "game_id", "players", "prizes", "seat_order", "status", "winner",
  ]);
  assert.deepEqual(Object.keys(dict.players[0]).sort(), [
    "author_points", "built", "composite", "finish_state", "is_bot", "mark",
    "name", "pts_author", "pts_runner", "pts_treasure", "run_done", "run_index",
    "run_total", "runner_loot", "runner_moves", "skipped",
  ]);
  assert.deepEqual(Object.keys(dict.deck[0]).sort(), ["author", "code", "transform"]);
  assert.equal(typeof dict.deck[0].code, "string");
});

// ---- platform guards (shared /api/room routes) -------------------------------

test("a move stamped with a previous game_epoch is rejected; the live epoch and unstamped legacy pass", async () => {
  const env = makeEnv();
  const host = player("mw-eh", "Host");
  const guest = player("mw-eg", "Guest");
  await post(env, "/api/room/create", { game_id: "mazewright", player: host, code: "MWEP" });
  await post(env, "/api/room/join", { code: "MWEP", player: guest });
  const started = await post(env, "/api/room/start", { code: "MWEP", host_id: host.id });
  const epoch = started.room.game_epoch;
  const stale = await post(env, "/api/room/move", {
    code: "MWEP", player_id: host.id, game_epoch: epoch - 1,
    action: { type: "SUBMIT_MAZE", code: buildRandomMazeCode() },
  });
  assert.equal(stale.ok, false);                                  // a pre-reset tab must not land in the fresh game
  assert.match(stale.error, /previous game/);
  const live = await post(env, "/api/room/move", {
    code: "MWEP", player_id: host.id, game_epoch: epoch,
    action: { type: "SUBMIT_MAZE", code: buildRandomMazeCode() },
  });
  assert.equal(live.room.game.players.find((s) => s.mark === "P1").built, true);
  const legacy = await post(env, "/api/room/move", {
    code: "MWEP", player_id: guest.id,
    action: { type: "SUBMIT_MAZE", code: buildRandomMazeCode() },
  });
  assert.equal(legacy.ok, true);                                  // unstamped mid-deploy client still plays
  assert.equal(legacy.room.game.status, "running");
});

test("a started room refuses a NEW joiner (ghost seat) but lets a seated player rejoin", async () => {
  const env = makeEnv();
  const host = player("mw-jh", "Host");
  const guest = player("mw-jg", "Guest");
  await post(env, "/api/room/create", { game_id: "mazewright", player: host, code: "MWJN" });
  await post(env, "/api/room/join", { code: "MWJN", player: guest });
  await post(env, "/api/room/start", { code: "MWJN", host_id: host.id });
  const ghost = await post(env, "/api/room/join", { code: "MWJN", player: player("mw-jx", "Late") });
  assert.equal(ghost.ok, false);                                  // seats were fixed at start — no silent markless ghost
  assert.match(ghost.error, /already started/);
  const rejoin = await post(env, "/api/room/join", { code: "MWJN", player: guest });
  assert.equal(rejoin.ok, true);                                  // same id passes — reconnect keeps working
  assert.equal(rejoin.room.players.length, 2);
});
