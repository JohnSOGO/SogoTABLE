// client/active-games.js: the player's tables across games, needs-me edges,
// parked rooms and background watchers — browser-free (no DOM, no sockets).
import test from "node:test";
import assert from "node:assert/strict";
import * as ag from "../../src/sogotable/static/client/active-games.js";

const ME = "me";
function room(code, awaiting, extra = {}) {
  return {
    code, game_id: "e7c1a4b9d206", status: "active", started: true, local_mode: false, revision: extra.revision || 1,
    players: extra.players || [{ id: ME, mark: "P1", kind: "human" }, { id: "you", mark: "P2", kind: "human" }],
    awaiting_marks: awaiting,
  };
}

function setup(serverRooms = []) {
  const alerts = [];
  const watching = new Map();
  ag.configureActiveGames({
    getPlayerId: () => ME,
    fetchMyRooms: async () => serverRooms,
    watch: (code, playerId, handlers) => { watching.set(code, handlers); return { stop: () => watching.delete(code) }; },
    onNeedsMe: (entry) => alerts.push(entry.code),
    onChange: () => {},
  });
  ag.setViewedRoom(null);
  return { alerts, watching };
}

test("active-games: seeds from my-rooms, watches tables I'm not viewing, alerts once per edge", async () => {
  const { alerts, watching } = setup([room("AAAA", ["P2"]), room("BBBB", ["P1"])]);
  await ag.refreshActiveGames();
  assert.deepEqual([...watching.keys()].sort(), ["AAAA", "BBBB"]);
  assert.deepEqual(alerts, ["BBBB"]);
  assert.equal(ag.needsMeElsewhereCount(), 1);
  assert.equal(ag.activeGamesList()[0].code, "BBBB", "games needing me sort first");

  watching.get("AAAA").onSnapshot(room("AAAA", ["P1"], { revision: 2 }));
  assert.deepEqual(alerts, ["BBBB", "AAAA"]);
  watching.get("AAAA").onSnapshot(room("AAAA", ["P1", "P2"], { revision: 3 }));
  assert.deepEqual(alerts, ["BBBB", "AAAA"], "still waiting on me: no repeat alert");
  watching.get("AAAA").onSnapshot(room("AAAA", ["P1"], { revision: 2 }));
  assert.equal(ag.activeGamesList().find((e) => e.code === "AAAA").awaiting.length, 2, "stale snapshot ignored");
});

test("active-games: the viewed table is not watched or alerted, and viewing un-parks it", async () => {
  const { alerts, watching } = setup([room("CCCC", ["P2"])]);
  await ag.refreshActiveGames();
  ag.parkRoom("CCCC");
  assert.equal(ag.isParked("CCCC"), true);
  ag.setViewedRoom("CCCC");
  assert.equal(ag.isParked("CCCC"), false);
  assert.equal(watching.has("CCCC"), false);
  ag.noteRoom(room("CCCC", ["P1"], { revision: 5 }));
  assert.deepEqual(alerts, []);
  assert.equal(ag.needsMeElsewhereCount(), 0);
  ag.setViewedRoom(null);
  assert.equal(watching.has("CCCC"), true);
});

test("active-games: solo-vs-bots and hot-seat tables are listed but never watched or alerted", async () => {
  const solo = room("SOLO", ["P1"], { players: [{ id: ME, mark: "P1", kind: "human" }, { id: "bot", mark: "P2", kind: "bot" }] });
  const hot = { ...room("HOTS", ["P1"]), local_mode: true };
  const { alerts, watching } = setup([solo, hot]);
  await ag.refreshActiveGames();
  assert.equal(watching.size, 0);
  assert.deepEqual(alerts, []);
  assert.equal(ag.activeGamesList().length, 2);
  assert.equal(ag.needsMeElsewhereCount(), 0);
});

test("active-games: finished, closed or left tables drop out", async () => {
  const { watching } = setup([room("DDDD", ["P2"]), room("EEEE", ["P2"])]);
  await ag.refreshActiveGames();
  watching.get("DDDD").onSnapshot({ ...room("DDDD", [], { revision: 9 }), status: "completed" });
  watching.get("EEEE").onClosed("EEEE");
  assert.deepEqual(ag.activeGamesList().map((e) => e.code), []);
  ag.noteRoom(room("FFFF", ["P1"], { players: [{ id: ME, mark: "P1", kind: "human", away: true }, { id: "you", mark: "P2", kind: "human" }] }));
  assert.deepEqual(ag.activeGamesList().map((e) => e.code), []);
});
