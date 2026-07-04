import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSkipVotes, castSkipVote, pruneSkipVotes } from "../games/skip-vote.js";

test("castSkipVote: first vote is a proposal, unanimity executes", () => {
  const one = castSkipVote({}, "P1", "P3", ["P1", "P2"]);
  assert.deepEqual(one.votes, { P3: ["P1"] });
  assert.equal(one.unanimous, false);
  const two = castSkipVote(one.votes, "P2", "P3", ["P1", "P2"]);
  assert.deepEqual(new Set(two.votes.P3), new Set(["P1", "P2"]));
  assert.equal(two.unanimous, true);
});

test("castSkipVote: voting again retracts; an empty proposal clears its key", () => {
  const cast = castSkipVote({}, "P1", "P3", ["P1", "P2"]);
  const retracted = castSkipVote(cast.votes, "P1", "P3", ["P1", "P2"]);
  assert.deepEqual(retracted.votes, {});
  assert.equal(retracted.unanimous, false);
});

test("castSkipVote: a single eligible voter is unanimous alone (2-player table)", () => {
  const solo = castSkipVote({}, "P1", "P2", ["P1"]);
  assert.equal(solo.unanimous, true);
});

test("castSkipVote: ineligible voters can't join and stale votes drop from the tally", () => {
  const outsider = castSkipVote({}, "P9", "P3", ["P1", "P2"]);
  assert.deepEqual(outsider.votes, {}, "a mark outside the eligible set records nothing");
  // A vote recorded earlier by someone no longer eligible doesn't count toward unanimity.
  const stale = castSkipVote({ P3: ["P4"] }, "P1", "P3", ["P1", "P2"]);
  assert.deepEqual(stale.votes, { P3: ["P1"] });
  assert.equal(stale.unanimous, false);
});

test("castSkipVote: nobody eligible can never be unanimous", () => {
  assert.equal(castSkipVote({}, "P1", "P2", []).unanimous, false);
});

test("pruneSkipVotes: cleared when the target is no longer skippable, filtered otherwise", () => {
  const votes = { P3: ["P1", "P2"], P4: ["P1"] };
  const pruned = pruneSkipVotes(votes, (target) => (target === "P3" ? null : ["P2"]));
  assert.deepEqual(pruned, {}, "P3 arrived (null) and P4's only voter lost eligibility");
  const kept = pruneSkipVotes(votes, () => ["P1"]);
  assert.deepEqual(kept, { P3: ["P1"], P4: ["P1"] });
});

test("normalizeSkipVotes: clamps garbage into a plain marks map", () => {
  assert.deepEqual(normalizeSkipVotes(null), {});
  assert.deepEqual(normalizeSkipVotes([1, 2]), {});
  assert.deepEqual(normalizeSkipVotes({ P3: "not-an-array", P4: ["P1", "P1", "P2"] }),
    { P4: ["P1", "P2"] });
});
