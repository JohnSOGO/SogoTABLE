import assert from "node:assert/strict";
import test from "node:test";
import { KNIGHTS as S_KNIGHTS, THINGS as S_THINGS, DEN as S_DEN } from "../games/mystic-wood/data.js";
import { KNIGHTS as C_KNIGHTS, THINGS as C_THINGS, DEN as C_DEN } from "../../src/sogotable/static/games/mystic-wood/content.js";

// data.js (server, AUTHORITATIVE rules) and content.js (client, display) each carry KNIGHTS / THINGS / DEN.
// A server stat change that misses the client shows the WRONG number on the encounter/peek card — silent,
// on a combat game maturing toward Game-Locked. This guard pins the shared gameplay fields so the two
// copies can't drift unnoticed. (6th steward pass, finding 3 — same shape as the RTTA parity guard.)
// It does NOT force the copies to be identical: it checks only the named gameplay fields, so each side may
// still carry its own extras (server `id`/`quest`; client emoji/prose live in separate exports).
function assertParity(label, server, client, fields) {
  assert.deepEqual(Object.keys(client).sort(), Object.keys(server).sort(), `${label}: client and server must define the same keys`);
  for (const key of Object.keys(server)) {
    for (const f of fields) {
      assert.equal(client[key][f], server[key][f], `${label}.${key}.${f}: client (${client[key][f]}) must match the authoritative server value (${server[key][f]})`);
    }
  }
}

test("data.js ↔ content.js: shared gameplay fields stay in parity", () => {
  assertParity("KNIGHTS", S_KNIGHTS, C_KNIGHTS, ["name", "P", "S", "q"]);
  assertParity("THINGS", S_THINGS, C_THINGS, ["name", "S", "P", "power"]);
  assertParity("DEN", S_DEN, C_DEN, ["name", "cls", "S", "P", "slay", "gives"]);
});
