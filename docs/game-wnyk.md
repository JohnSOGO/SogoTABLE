# Well, Now You Know (WNYK)

A Cards Against Humanity port (card text CC BY-NC-SA 4.0 — credited in the in-game
help panel, alongside the Wordner prompt pack's credit). Spec + design decisions:
`AI/cah/RULES.md` (gitignored dev home); the developed UI's local twin is
`AI/cah/preview.html` — the shipped client was **lifted verbatim** from its three
LIFT SEAM blocks (hard rule in `docs/adding-a-game.md`).

## Shape

- **Category:** card · `lobbyMode: hostStart` · 3+ players (bots fill) · multi-phone
  only (hidden hands). Host options at start: target score (5/7/10, default 7) and
  deck (Classic = adult, default; Kid-Friendly = official Family Edition + SOGO Kids
  originals + Wordner prompts).
- **Round flow:** judge-only prompt stage (read aloud → optional 👎 prompt swap, max
  2/round → Release) → submitting (5s server-enforced commit grace, hidden
  submissions) → read-aloud (one submission at a time to the whole room, judge
  ❤️/Next) → triage (All | Favorite | Final → Confirm) → reveal (completed sentence,
  authorship revealed). First to target wins; likes accumulate to the ❤️ Most Liked
  second podium.
- **Blank cards:** max one per player per game (5% draw chance, or dealt at the
  third round win); a played write-in is attributed forever and joins the permanent
  cross-room library.
- **Ratings:** 👎-only (one per round, and it dumps-and-replaces the card); playing
  a card is its implicit up-vote; blacks are downs-only (forced plays). Lifetime
  tallies live in `data.card_ratings`; net −3 removes a card from future decks.
  Both piles deal lowest-lifetime-usage first.

## Code map

- Server rules: `workers/games/wnyk/` (`rules.js` + `ratings.js` + `projection.js`
  + `runtime.js` + generated `decks.js` via `scripts/build-wnyk-decks.mjs`, sources
  `fe-official-*.json` / `sogo-kids-pack.json` / `wordner-pack.json` /
  `classic-dupes.json`). Sanitizer: `wnykGameToDictForViewer` (dict-shaped, like
  every viewer hook).
- Stores: `workers/custom-cards.js` (write-in library), `workers/card-ratings.js`
  (tallies/removals), composed only by `workers/game-library.js` (creation inputs +
  completion harvest; entry calls it at start/reset/all three resolution sites).
- Client: `src/sogotable/static/games/wnyk/` (`render.js` adapter + verbatim seam,
  `cards.js`, `styles.js`, `manifest.js`); registered in `registry.js`
  (`GAME_IDS.wnyk`), `game-kinds.js`, `app.js` dispatch, `render-keys.js` slice,
  `workers/games/handlers.js` row + viewer line.

Placement receipts: `docs/placement-receipts.md`, 2026-07-20 entries.
