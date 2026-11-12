import assert from "node:assert/strict";
import test from "node:test";
import { versionHeadersFor, corsHeadersFor } from "../platform/http.js";

// Auto-update (client/app-update.js) + its Worker-side skew header. The client
// module touches browser globals only inside functions, so we stub per test.
function makeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}
const KEY = "sogotable.appUpdateResume";
const update = await import("../../src/sogotable/static/client/app-update.js");

test("versionHeadersFor: deploy id when the binding exists, nothing locally", () => {
  assert.deepEqual(versionHeadersFor({ CF_VERSION_METADATA: { id: "abc" } }), { "X-SogoTable-Worker-Version": "abc" });
  assert.deepEqual(versionHeadersFor({}), {});
  assert.deepEqual(versionHeadersFor(undefined), {});
});

test("CORS exposes the worker version header so the cross-origin client can read it", () => {
  const headers = corsHeadersFor(new Request("https://x/api/games", { headers: { Origin: "https://sogotable.sogodojo.com" } }));
  assert.match(headers["Access-Control-Expose-Headers"], /X-SogoTable-Worker-Version/);
});

test("takeResumeMarker: returns a fresh marker once, then clears it", () => {
  global.sessionStorage = makeStorage();
  sessionStorage.setItem(KEY, JSON.stringify({ screen: "game", roomCode: "ABCD", ts: Date.now() }));
  assert.equal(update.takeResumeMarker().roomCode, "ABCD");
  assert.equal(sessionStorage.getItem(KEY), null);
  assert.equal(update.takeResumeMarker(), null);
});

test("takeResumeMarker: drops a stale marker (old tab, not an update reload)", () => {
  global.sessionStorage = makeStorage();
  sessionStorage.setItem(KEY, JSON.stringify({ roomCode: "ABCD", ts: Date.now() - 10 * 60 * 1000 }));
  assert.equal(update.takeResumeMarker(), null);
  assert.equal(sessionStorage.getItem(KEY), null);
});

test("takeResumeMarker: corrupt marker is ignored, not thrown", () => {
  global.sessionStorage = makeStorage();
  sessionStorage.setItem(KEY, "{nope");
  assert.equal(update.takeResumeMarker(), null);
});

test("turnSettled: outside a live game an update applies right away", () => {
  assert.equal(update.turnSettled(null, null, 0), true);
  assert.equal(update.turnSettled({ inPlay: false }, null, 0), true);
});

test("turnSettled: turn-based game waits while it is my turn, goes once the turn passes", () => {
  const snap = { turnKey: "ROOM:1:X", actions: 0 };
  assert.equal(update.turnSettled({ inPlay: true, myTurn: true, turnKey: "ROOM:1:X" }, snap, 3), false);   // mid-turn (even after rolls/holds)
  assert.equal(update.turnSettled({ inPlay: true, myTurn: false, turnKey: "ROOM:1:O" }, snap, 3), true);   // opponent's turn
  assert.equal(update.turnSettled({ inPlay: true, myTurn: true, turnKey: "ROOM:1:O" }, snap, 3), true);    // hot-seat: turn moved on
});

test("turnSettled: parallel/solo game waits for my next action to land", () => {
  const snap = { turnKey: "", actions: 2 };
  assert.equal(update.turnSettled({ inPlay: true, myTurn: false, turnKey: "" }, snap, 2), false);
  assert.equal(update.turnSettled({ inPlay: true, myTurn: false, turnKey: "" }, snap, 3), true);
});
