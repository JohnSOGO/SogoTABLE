# Liar's Dice 🤥 (module id `liars-dice`)

The classic public-domain bluffing dice game for 2–8 players: everyone rolls a
hidden cup, bids climb on how many of a face are on the whole table, and a
LIAR call turns every die face-up — whoever was wrong loses a die. Last player
holding dice wins.

## How it plays (v1 house rules)

- Everyone starts with **5 dice**, rolled hidden at the top of each round.
- Turns go around the seat order. On your turn either **raise the bid**
  (strictly more dice, or the same count on a **higher face**) or call
  **LIAR** on the standing bid.
- **Ones are wild** — every ⚀ counts toward whatever face is bid, and bids on
  ones themselves are not allowed.
- On a LIAR call all dice reveal. Bid true (count ≥ quantity): the challenger
  loses a die. Bid false: the bidder loses a die. The die-loser opens the next
  round (the challenge winner opens if the loser was eliminated).
- Out of dice = out of the game; the last player holding dice wins.
- **Deliberate v1 exclusions:** the *spot-on* exact-call variant (the engine
  has no action for it), and **hot-seat / pass-and-play** — hidden cups on one
  shared screen need a peek-to-reveal UI that is out of scope, so Liar's Dice
  is **multi-phone only** (each cup stays on its own device; a bot fills the
  second seat for a lone human).

## Architecture

- **Timing:** strict `turnBased` around the table — the first sequential
  turn-order game on the host-start lobby path (2+ seats, host taps Start;
  `initLiarsDiceSeats` rejects a start with fewer than two seats).
- **Hidden information (the defining constraint):** the Battleship projection
  seam. `liarsDiceGameToDictForViewer` in the game's own `rules.js` masks every
  other player's live dice to `null` (counts survive); the Worker's
  `gameToDictForViewer` dispatches to it on every snapshot egress — HTTP
  responses via `responseForViewer` and the room WebSocket via
  `roomMessageForSession` → `roomToDictForViewer`, so both paths are covered.
  Dice move out of the live seats and into the **public** `last_reveal` at the
  moment a challenge resolves; a seat's `dice` array is secret whenever it is
  non-empty. The client renderer never receives (and never hides) another
  cup's values.
- **Worker:** `workers/games/liars-dice/rules.js` — pure, server-authoritative;
  bid legality, challenge math, die loss, elimination and win are decided here
  only; server-owned seedable RNG (`setLiarsDiceRandom`); normalization clamps
  persisted state; the dict ships `raise_options` (every legal raise) so the
  UI never re-derives legality. One `GAME_HANDLERS` row
  (`resolvesBotsInternally`).
- **Bots:** `workers/games/liars-dice/ai.js` — one probability-aware house
  player. Exact binomial math over the unknown dice (own cup + public counts
  ONLY — a bot never reads an opponent's hidden dice, even server-side):
  challenges when the standing bid drops below a jittered belief floor,
  otherwise makes the most credible minimal raise with an occasional bluff.
  Bot turns run through the same bid/challenge internals as human moves; an
  all-bot table (every human eliminated) plays itself out.
- **Client:** `src/sogotable/static/games/liars-dice/render.js` + injected
  `styles.js` — renders the projection, computes no rules. Bid picker is a
  quantity stepper + face row bounded by `raise_options`; the reveal shows all
  cups with bid-matching dice ringed. The board commits to its tavern-table art
  (`board-bg.jpg`, provided by MojoSOGO; the title is baked into the art's top
  band) in both themes — the zombie-dice game-specific-board-palette
  precedent; dice stay white with dark pips (docs/theme.md).
- **Tests:** `workers/tests/liars-dice-rules.test.js` — rules, wild counting,
  raise legality, challenge/elimination, the viewer sanitizer (opponent cups
  masked pre-reveal, public at reveal, spectators see nothing), and bot games
  played to completion, browser-free.

## Round state machine

`bidding` (turns raise or challenge) → LIAR → `reveal` (dice public in
`last_reveal`, loser named, cups emptied) → a surviving human taps *Roll the
next round* (an all-bot table auto-advances) → `bidding` with the loser
opening — until one seat holds dice: `complete`.
