// Well, Now You Know bot decision policy. Pure choices over the context
// rules.js hands it — no game-object access, no legality (rules.js validates
// every choice and substitutes a safe default if a policy misfires). CAH is
// luck + the judge's taste, so random is honestly competitive (the official
// "Rando Cardrissian" house rule); no text-taste heuristics in v1. Bots never
// play write-ins — rules.js never deals them blanks.

// Pick `pick` distinct entries from `playable` (the submitter's playable hand
// indices), uniformly at random.
export function wnykBotSubmission({ playable, pick, random }) {
  const pool = playable.slice();
  const chosen = [];
  while (chosen.length < pick && pool.length) {
    chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return chosen;
}

// Judge policy: like a random ~third of the submissions (at least one), then
// crown a random winner.
export function wnykBotJudge({ ids, random }) {
  const pool = ids.slice();
  const likeCount = Math.max(1, Math.round(pool.length / 3));
  const likes = [];
  while (likes.length < likeCount && pool.length) {
    likes.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return { likes, winner: ids[Math.floor(random() * ids.length)] };
}
