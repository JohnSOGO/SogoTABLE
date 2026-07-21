// Barrier-skip vote protocol — shared by every game with a SKIP_PLAYER
// barrier escape (product decision, MojoSOGO 2026-07-04: a skip is a
// PROPOSAL, never a unilateral act; it executes only when enough eligible
// waiters have joined it). The default threshold is UNANIMOUS; a game may
// inject a lower fraction (MojoSOGO 2026-07-20: Well, Now You Know skips on a
// 2/3 majority of eligible voters) — existing callers pass no threshold and
// keep the unanimous behavior exactly.
//
// Pure rules-stage logic: plain data in, plain data out. No DOM, no transport,
// no storage, no game imports — each game passes in its own eligibility
// answers ("which marks may vote on skipping this target right now"), so the
// protocol never knows a game's phase names. Vote state lives on the game
// blob as `skip_votes: { [targetMark]: [voterMark, ...] }`, travels in the
// projection so every client renders the proposal, and toggling is the
// sanctioned idempotence path (tap to vote, tap again to retract).
export function normalizeSkipVotes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const votes = {};
  Object.keys(value).forEach((target) => {
    const voters = Array.isArray(value[target])
      ? [...new Set(value[target].map(String))].slice(0, 32)
      : [];
    if (voters.length) votes[String(target)] = voters;
  });
  return votes;
}

// Toggle `voterMark`'s vote to skip `targetMark`. `eligibleMarks` is the full
// set of marks allowed to vote on this target right now (the caller has
// already validated the actor and target); votes from marks that are no
// longer eligible are dropped before tallying. Returns the next votes object,
// whether the surviving votes are unanimous across the eligible set, and
// whether they meet `threshold` (a fraction of the eligible set, default 1 =
// unanimous; the vote count needed is ceil(eligible × threshold), min 1).
export function castSkipVote(rawVotes, voterMark, targetMark, eligibleMarks, threshold = 1) {
  const votes = normalizeSkipVotes(rawVotes);
  const eligible = (Array.isArray(eligibleMarks) ? eligibleMarks : []).map(String);
  const voter = String(voterMark);
  const target = String(targetMark);
  const current = new Set((votes[target] || []).filter((mark) => eligible.includes(mark)));
  if (current.has(voter)) current.delete(voter);
  else if (eligible.includes(voter)) current.add(voter);
  const next = { ...votes };
  if (current.size) next[target] = [...current];
  else delete next[target];
  const needed = Math.max(1, Math.ceil(eligible.length * Math.min(1, Math.max(0, Number(threshold) || 1))));
  return {
    votes: next,
    unanimous: eligible.length > 0 && eligible.every((mark) => current.has(mark)),
    passed: eligible.length > 0 && current.size >= needed,
  };
}

// Re-validate every open proposal against the current barrier state.
// `eligibleFor(targetMark)` returns the marks allowed to vote on that target
// right now, or null when the target is no longer skippable (they acted, the
// phase advanced, the game ended) — null clears the proposal entirely.
export function pruneSkipVotes(rawVotes, eligibleFor) {
  const votes = normalizeSkipVotes(rawVotes);
  const next = {};
  Object.keys(votes).forEach((target) => {
    const eligible = eligibleFor(target);
    if (!Array.isArray(eligible)) return;
    const marks = eligible.map(String);
    const kept = votes[target].filter((mark) => marks.includes(mark));
    if (kept.length) next[target] = kept;
  });
  return next;
}
