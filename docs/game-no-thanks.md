# No Thanks! 🃏 (module id `no-thanks`)

The classic press-your-luck card auction (Thorsten Gimmler) and SogoTable's
**first card game** — its `cards.js` module is the pilot for the platform's
card look/tap/drag UI work. One card is face up at a time: pay a chip to
dodge it, or take it with every chip riding on it. Lowest score wins.
**N-player** with a 3-seat minimum (bots fill the gaps); the box says 3–7,
we don't cap.

## How it plays (v1, classic rules)

- Deck is cards **3–35**; **9 are removed unseen** (24 in play — no one, not
  even the server projection, ever reveals which 9 are missing).
- Starting chips scale with the table: **3–5 players: 11**, **6 players: 9**,
  **7+ players: 7** (the 8+ stack is our house rule — the printed game stops
  at 7 seats; the platform goal is N-player wherever a game seats 3+).
- On your turn, either:
  - **Take the card** — it joins your tableau along with every chip on it,
    and **you decide first on the next flipped card** (that's the rule, not a
    bug); or
  - **No Thanks** — pay 1 chip onto the card; the decision passes clockwise.
- **Out of chips = forced take.** The pass button disables; the server rejects
  a chipless pass.
- The game ends the moment the **last card is taken**.
- **Scoring:** cards count against you, but a **run of consecutive cards
  counts only its lowest card** ([5,6,7,30] = 35). Chips subtract one point
  each. **Lowest total wins.** Ties break toward the bigger chip stack, then
  the thinner card pile, then seat order.
- **Deliberate v1 exclusions:** hot-seat / pass-and-play — chip stacks are
  hidden information on one shared screen, so No Thanks is **multi-phone
  only** (bots fill empty seats for a small table; minimum 3 seats, no
  maximum).

## Architecture

- **Timing:** strict `turnBased`, clockwise around `seat_order`, on the
  host-start lobby path (host taps Start; `initNoThanksSeats` rejects a start
  under 3 seats — there is no upper bound).
- **Hidden information (two secrets):**
  1. **Chip stacks** — the Battleship/Liar's-Dice projection seam.
     `noThanksGameToDictForViewer` in the game's own `rules.js` masks every
     other player's `chips` to `null`; the Worker's `gameToDictForViewer`
     dispatches to it on every snapshot egress. Completion (or a completed
     room) reveals all stacks alongside the public `results` breakdown.
  2. **The draw pile** — secret from *everyone*. `noThanksGameToDict` strips
     `deck` to `deck_count` before anything leaves the Worker, and the 9
     removed cards are never stored at all.
  Cards taken, the face-up card, and the pot are public — as at a real table.
- **Worker:** `workers/games/no-thanks/rules.js` — pure, server-authoritative;
  take/pass legality, run scoring, tie-breaks, and the winner are decided here
  only; seedable RNG seam (`setNoThanksRandom`) drives the one shuffle;
  normalization clamps persisted state. One `GAME_HANDLERS` row
  (`resolvesBotsInternally`).
- **Bots:** `workers/games/no-thanks/ai.js` — a net-cost house player: judges
  the card by what it *really* adds (run extensions are cheap or free) minus
  the pot, dodges expensive cards while chips last, and loosens as its stack
  thins. Bots read their own state and the public table only.
- **Client:** `src/sogotable/static/games/no-thanks/render.js` + `cards.js` +
  injected `styles.js` — renders the projection, computes no rules. `cards.js`
  owns the card visual primitives (paper-faced card with corner indices and a
  low/mid/high danger tint, fanned run groups, chip stacks) and is deliberately
  separate from the renderer so the card look/tap/drag pilot iterates without
  touching game flow. Bot chains resolve server-side in one snapshot and are
  replayed client-side one event per ~1.1s, each event carrying the public
  table (card + pot) so mid-replay frames redraw the exact moment. The board
  rides the shell's standard light/dark tokens; cards keep a physical paper
  face in every theme (docs/theme.md).
- **Tests:** `workers/tests/no-thanks-rules.test.js` — setup/chip scaling, run
  scoring, pass/take flow (including the taker-decides-again rule and forced
  takes), completion + tie-breaks, both sanitizer secrets (chips masked,
  deck never shipped, events leak no totals), and bot games played to
  completion with chips conserved, browser-free.

## Turn state machine

`deciding` (the one live state: current player takes or passes) → on **pass**
the same card gains a chip and the decision moves clockwise → on **take** the
card + pot move to the taker and the next card flips to the *same* player →
last card taken: `complete` (public `results`, winner by lowest total).
