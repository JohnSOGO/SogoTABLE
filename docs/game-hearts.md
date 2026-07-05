# Hearts

The classic 4-player trick-taking game. First card game on the standard 52-card
deck; pilots the shared `games/playing-cards.js` face primitives.

## Ruleset (v1)

- **Always exactly 4 seats** (MojoSOGO 2026-07-04) — bots fill empty chairs.
  This is the one deliberate exception to the N-player convention.
- 13 cards each, auto-sorted (clubs, diamonds, spades, hearts — ascending).
- **Passing**: 3 cards, rotating by round — left, right, across, hold (no pass).
  Selections are simultaneous and secret; the swap happens when all four are in.
- **Play**: the 2♣ opens every round. Follow suit; hearts may not LEAD until a
  heart has been discarded ("broken"); a hand of nothing but hearts may lead them.
- **Scoring**: each ♥ = 1, Q♠ = 13. Lowest total wins when someone reaches the
  target at a round boundary (ties for the lead play another round).
- **Shooting the moon**: taking all 13 hearts + the Q♠.

## Host options (table creation)

| Option | Values | Default |
|---|---|---|
| Jack of Diamonds | taking the J♦ scores −10 | off |
| No blood on trick one | no hearts/Q♠ on the first trick (unless forced) | on |
| Moon style | old: others +26 · new: shooter −26 | old |
| Play to | 50 / 75 / 100 | 100 |

Options ride the `/api/room/start` payload via the dispatch table's
`applyStartOptions` (the 10,000 opening-bar precedent) and are carried across a
reset by `carryOptionsOnReset`.

## Architecture

- `workers/games/hearts/rules.js` — server-authoritative rules, scoring, and
  the ONLY hidden-info mask (`heartsGameToDictForViewer`): other hands arrive
  as nulls (count preserved), pass selections stay secret, and `legal_plays`
  (a subset of a hand) masks unless the viewer is the current player.
- `workers/games/hearts/ai.js` — bot policy (pass sheds the unguarded queen,
  bare high spades, high hearts; play ducks high under points, dumps Q♠ when
  void). Tuned in the `AI/hearts/` prototype: 2,000 headless games, every
  option combo, invariants green.
- `src/sogotable/static/games/hearts/render.js` — event-replay UI: the worker
  resolves whole bot chains in one snapshot; the client replays events one at
  a time (animated deal, plays slide in from each seat, finished tricks glide
  to the winner). Interactions unlock only after the replay settles.
  Tap a card to select it (tap the lone selection again to unselect — never a
  double-tap commit); commit with the always-labeled **Commit** button or an
  up-swipe toward the felt. Selection works even OFF-turn (pre-select, so
  Commit is one tap when the turn arrives; on-turn taps are limited to legal
  cards). The three received pass cards arrive already raised + highlighted;
  selecting any card for play lowers the rest (a received card tapped for play
  stays up alone). The same button commits the 3-card pass and the next deal.
  A standing score table (name left, emoji status, centered stats) always sits
  below the cards region; seat boxes carry names + turn markers only.
- `src/sogotable/static/games/playing-cards.js` — shared 52-card face/back
  builders + canonical sort (new owner row; future deck games import from here,
  never game-to-game).
- Sounds in `sound.js`: deal riffle, card snap, trick sweep, hearts-broken,
  Q♠ growl, moon fanfare.

## Sibling paths

- Public room view vs private player view — owned by the sanitizer; covered in
  `workers/tests/hearts-rules.test.js`.
- Bot vs human moves — same `makeHeartsMove` path.
- Reconnect/resume — a fresh join renders live state without replaying history.
- Hot-seat pass-and-play — **deliberately out of scope** for a hidden-hand game
  (Liar's Dice v1 precedent): multi-phone + bots only.
