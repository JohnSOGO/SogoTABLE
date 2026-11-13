// Game alt-name store (workers/game-alt-names.js) through the Worker API.
import assert from "node:assert/strict";
import test from "node:test";
import { makeEnv, post, get, tenThousandTest } from "./helpers.js";
import { GAME_IDS } from "../../src/sogotable/static/games/registry.js";

const { sideEffectsFor } = tenThousandTest;
const altOf = async (env, id) => (await get(env, "/api/games")).games.find((g) => g.id === id).alt_name;

test("admin sets, replaces and clears a game's alt name; players read it from /api/games", async () => {
  const env = makeEnv();
  const id = GAME_IDS.tracklayers;
  assert.equal(await altOf(env, id), null);

  assert.equal((await post(env, "/api/game-alt-names/set", { passcode: "0000", game_id: id, alt_name: "Ticket to Ride" })).ok, false);
  assert.equal(await altOf(env, id), null);

  const saved = await post(env, "/api/game-alt-names/set", { passcode: "1234", game_id: id, alt_name: "  Ticket\nto   Ride " });
  assert.equal(saved.ok, true);
  assert.equal(saved.alt_name, "Ticket to Ride");
  assert.equal(await altOf(env, id), "Ticket to Ride");
  assert.equal(await altOf(env, GAME_IDS.bloomwork), null);

  await post(env, "/api/game-alt-names/set", { passcode: "1234", game_id: id, alt_name: "x".repeat(200) });
  assert.equal((await altOf(env, id)).length, 60);

  await post(env, "/api/game-alt-names/set", { passcode: "1234", game_id: id, alt_name: "   " });
  assert.equal(await altOf(env, id), null);
});

test("unknown games are rejected and the write wakes nobody", async () => {
  const env = makeEnv();
  assert.equal((await post(env, "/api/game-alt-names/set", { passcode: "1234", game_id: "nope", alt_name: "X" })).ok, false);
  assert.equal((await post(env, "/api/game-alt-names/set", { passcode: "1234", alt_name: "X" })).ok, false);
  // An alias folds onto the canonical game.
  await post(env, "/api/game-alt-names/set", { passcode: "1234", game_id: "super_tic_tac_toe", alt_name: "Ultimate TTT" });
  assert.equal(await altOf(env, GAME_IDS.classic), "Ultimate TTT");
  assert.deepEqual(sideEffectsFor("POST", "/api/game-alt-names/set"), { mutates: true, notifyRooms: false, notifyApp: false });
});
