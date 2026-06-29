import assert from "node:assert/strict";
import test from "node:test";

// In-memory Web Storage stubs — node has no localStorage/sessionStorage. The
// session-store reads/writes them only inside functions (never at import), so we
// stub before calling.
function makeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

const store = await import("../../src/sogotable/static/client/session-store.js");

test("pickSeatId: the device id wins, the shared id is the fallback (the hot-seat bug class)", () => {
  assert.equal(store.pickSeatId("dev", "shared"), "dev");
  assert.equal(store.pickSeatId("", "shared"), "shared");
  assert.equal(store.pickSeatId("dev", ""), "dev");
  assert.equal(store.pickSeatId("", ""), "");
});

test("initSessionStore seeds device id session > local, and back-fills the shared id", () => {
  global.localStorage = makeStorage();
  global.sessionStorage = makeStorage();
  sessionStorage.setItem("sogotable.deviceSelectedPlayerId", "sess");
  localStorage.setItem("sogotable.deviceSelectedPlayerId", "loc");
  localStorage.setItem("sogotable.selectedPlayerId", ""); // empty -> back-filled from device
  store.initSessionStore();
  assert.equal(store.getDeviceSelectedPlayerId(), "sess");
  assert.equal(store.getSelectedPlayerId(), "sess"); // !selected && device -> selected = device
  assert.ok(store.getDeviceSelectionHash().length > 0);
  assert.equal(store.homePlayerId(), "sess");
});

test("initSessionStore: no session value falls back to the local device id, keeping the shared id", () => {
  global.localStorage = makeStorage();
  global.sessionStorage = makeStorage();
  localStorage.setItem("sogotable.deviceSelectedPlayerId", "loc");
  localStorage.setItem("sogotable.selectedPlayerId", "shared");
  store.initSessionStore();
  assert.equal(store.getDeviceSelectedPlayerId(), "loc");
  assert.equal(store.getSelectedPlayerId(), "shared");
});

test("saveDeviceIdentity writes the DEVICE id into both the session key and the local selectedPlayerId key", () => {
  global.localStorage = makeStorage();
  global.sessionStorage = makeStorage();
  store.initSessionStore();
  store.setSelectedPlayerId("ignored-shared");
  store.setDeviceSelectedPlayerId("dev-7");
  store.saveDeviceIdentity();
  assert.equal(sessionStorage.getItem("sogotable.deviceSelectedPlayerId"), "dev-7");
  // The long-standing quirk: the local selectedPlayerId key is written from the
  // DEVICE id, not from selectedPlayerId. Pin it so the extraction can't drift.
  assert.equal(localStorage.getItem("sogotable.selectedPlayerId"), "dev-7");
  assert.ok(localStorage.getItem("sogotable.deviceSelectionHash"));
});
