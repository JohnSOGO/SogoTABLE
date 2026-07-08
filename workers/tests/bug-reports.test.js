// Bug-report store (workers/bug-reports.js) exercised through the Worker API.
// Submit / list / clear are covered in sogotable-api.test.js; this file owns the
// per-report triage endpoint (resolve / reopen / delete by id).
import assert from "node:assert/strict";
import test from "node:test";
import { makeEnv, post } from "./helpers.js";

test("resolves, reopens, and deletes bug reports by id", async () => {
  const env = makeEnv();
  const a = await post(env, "/api/bug-report", { description: "first" });
  const b = await post(env, "/api/bug-report", { description: "second" });

  // Wrong passcode cannot triage.
  const wrong = await post(env, "/api/bug-reports/resolve", { passcode: "0000", ids: [a.id] });
  assert.equal(wrong.ok, false);

  // Mark one done — it stays in the store, now with a status + timestamp.
  const done = await post(env, "/api/bug-reports/resolve", { passcode: "1234", ids: [a.id] });
  assert.equal(done.ok, true);
  assert.equal(done.affected, 1);
  let list = (await post(env, "/api/bug-reports/list", { passcode: "1234" })).reports;
  assert.equal(list.length, 2);
  const doneReport = list.find((r) => r.id === a.id);
  assert.equal(doneReport.status, "done");
  assert.ok(doneReport.resolved_at > 0);

  // Reopen clears the status back to open.
  const reopened = await post(env, "/api/bug-reports/resolve", { passcode: "1234", ids: [a.id], reopen: true });
  assert.equal(reopened.affected, 1);
  list = (await post(env, "/api/bug-reports/list", { passcode: "1234" })).reports;
  assert.equal(list.find((r) => r.id === a.id).status, undefined);

  // Delete removes only the selected report.
  const deleted = await post(env, "/api/bug-reports/resolve", { passcode: "1234", ids: [b.id], delete: true });
  assert.equal(deleted.affected, 1);
  list = (await post(env, "/api/bug-reports/list", { passcode: "1234" })).reports;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, a.id);

  // Unknown ids affect nothing.
  const none = await post(env, "/api/bug-reports/resolve", { passcode: "1234", ids: ["nope"] });
  assert.equal(none.affected, 0);
});
