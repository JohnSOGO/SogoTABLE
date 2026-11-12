// Asset-review store (workers/asset-reviews.js) exercised through the Worker API.
import assert from "node:assert/strict";
import test from "node:test";
import { makeEnv, post, tenThousandTest } from "./helpers.js";

const { sideEffectsFor } = tenThousandTest;

test("asset reviews are passcode-gated, upserted by key, and clearable", async () => {
  const env = makeEnv();
  const review = { key: "sound:global:farkle", kind: "sound", game: "global", label: "farkle", status: "approved", note: "good", chosen_take: "seed-102" };

  assert.equal((await post(env, "/api/asset-reviews/upsert", { ...review, passcode: "0000" })).ok, false);
  assert.equal((await post(env, "/api/asset-reviews/list", { passcode: "0000" })).ok, false);

  const saved = await post(env, "/api/asset-reviews/upsert", { ...review, passcode: "1234" });
  assert.equal(saved.ok, true);
  assert.equal(saved.review.status, "approved");
  assert.ok(saved.review.updated_at > 0);

  // Same key again replaces, never duplicates.
  await post(env, "/api/asset-reviews/upsert", { ...review, status: "rejected", note: "too long", regenerate: true, passcode: "1234" });
  let list = (await post(env, "/api/asset-reviews/list", { passcode: "1234" })).reviews;
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "rejected");
  assert.equal(list[0].regenerate, true);
  assert.equal(list[0].note, "too long");

  // Unknown status and a missing key are rejected.
  assert.equal((await post(env, "/api/asset-reviews/upsert", { ...review, status: "maybe", passcode: "1234" })).ok, false);
  assert.equal((await post(env, "/api/asset-reviews/upsert", { ...review, key: " ", passcode: "1234" })).ok, false);

  // Notes are capped.
  await post(env, "/api/asset-reviews/upsert", { ...review, key: "picture:x", note: "n".repeat(5000), passcode: "1234" });
  list = (await post(env, "/api/asset-reviews/list", { passcode: "1234" })).reviews;
  assert.equal(list.find((r) => r.key === "picture:x").note.length, 2000);

  const cleared = await post(env, "/api/asset-reviews/clear", { passcode: "1234" });
  assert.equal(cleared.cleared, 2);
  assert.equal((await post(env, "/api/asset-reviews/list", { passcode: "1234" })).reviews.length, 0);
});

test("asset-review writes save without waking rooms or the app hub", () => {
  assert.deepEqual(sideEffectsFor("POST", "/api/asset-reviews/upsert"), { mutates: true, notifyRooms: false, notifyApp: false });
  assert.deepEqual(sideEffectsFor("POST", "/api/asset-reviews/list"), { mutates: false, notifyRooms: false, notifyApp: false });
});
