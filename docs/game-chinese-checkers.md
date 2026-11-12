# ⭐ Chinese Checkers

Classic star-board Chinese Checkers (Sternhalma) for 2, 3, 4 or 6 players (5 is
allowed with one empty arm), built to the
[Game Integration Spec](game-integration-spec.md). Host-start lobby; bots fill
the table.

The SogoTable twist is **parallel play**. There are no turns. Every round each
player picks one move in secret, and the round resolves as soon as every human
has locked in. Nobody waits for one slow player, and nobody sees a move before
locking their own.

## How to play

1. Tap one of your marbles. Its legal moves light up: a solid ring for a step to
   a neighbouring hole, a pulsing ring for a hop, and a dimmer ring for every
   hole you can reach through a chain of hops.
2. Tap a hop landing to extend the chain one hop at a time, or tap any lit hole
   to have the path picked for you. **Undo hop** and **Clear** back out.
3. Tap **Lock in**. You can **Change move** until the last player locks in, or
   **Pass**.
4. When everyone has locked in, every move plays out on the board. First to fill
   the opposite point with all their marbles wins.

## Who gets a contested hole

Moves resolve one at a time in this round's **priority order**, which rotates
one seat every round (the "first player" badge). Each move is re-checked against
the board as it stands after the higher-priority moves:

- If someone with priority took the hole you were heading for, or moved a
  marble your chain needed to jump, your chain is **cut short** at the last
  hole you can still legally stop on.
- If nothing of your path survives, or your marble was captured first, your
  move **bounces** and the marble stays put.
- The round log names who had priority, so a bump is never a mystery.

Rotating priority comes from spec §6.4. It is fair over a game, it does not
depend on phone speed or network lag, and it is easy to explain.

## Host options

| Option | Values | Default | Effect |
|---|---|---|---|
| Jumps | Standard · Long | Standard | Long = "fast-paced" super-jumps: hop a marble any distance away, landing the same distance beyond it |
| Marbles | 10 · 6 | 10 | 6 = quick game (three rows) |
| Capture | Off · Send home | Off | Opponent marbles you hop are sent back to their home point. Marbles already in their own goal are safe and teammates are never captured |
| Teams | Off · On | Off | 4 or 6 players only: partners sit on opposite points, and a team wins when all its players finish |
| Stay in goal | On · Off | On | A marble that reached its goal may not leave it |
| No parking | Off · On | Off | Moves may not end in a point that is neither your home nor your goal |
| Anti-block | On · Off | On | You also finish when your goal is full and more than half the marbles there are yours, which stops spoilers camping in your goal |
| End | First finisher · All places | First finisher | Stop at the first winner (same-round finishers share it), or play on for every place |

There is a 300-round safety cap. Unfinished players then rank by remaining distance.

## Architecture

- **Server rules:** `workers/games/chinese-checkers/`. `board.js` (star
  geometry, steps, hops, long jumps, hop graph, stop rules, captures),
  `resolve.js` (round-barrier priority resolution: ok / cut / bounced),
  `rules.js` (lifecycle, options, barrier, finishing, projection), `ai.js`
  (bot levels 1–4). Legal moves are computed on the server and projected only
  to their owner. Other players' commits are hidden until the round resolves.
- **Client:** `src/sogotable/static/games/chinese-checkers/`. `render.js`,
  `board-svg.js`, `panels.js`, `lobby.js` (host options), `branding.js` (every
  word), `assets.js` (palette and file overrides), `sfx.js`, `styles.js`.
- **Wire contract:** `src/sogotable/static/games/chinese-checkers/PLAN.md`.
- **Platform rows:** registry entry, `isChineseCheckersGameState`, the
  `GAME_HANDLERS` row with options hooks, the viewer projection line, and the
  stats score row.
- **Hot-seat:** not supported. Hidden simultaneous commits on one device would
  need a hand-off screen, so it is out of scope. Use one phone per player, with
  bots for empty seats.

## Renaming and swapping assets

- **Rename:** edit `branding.js`, then `name` in `games/registry.js` and
  `chinese-checkers/manifest.js` (the architecture test keeps those two equal),
  and add the new slug to `aliases`. The opaque id `6bc129b1bbed` never changes.
- **Art and sound:** drop a file in the game folder and point the matching key
  in `assets.js` at it. `null` keeps the procedural SVG or synthesized sound.
  Change the filename when you replace art so phones don't keep a cached copy.
- **New variant:** add a key to the options table in `rules.js`
  (`normalizeChineseCheckersOptions`), handle it in `board.js` / `resolve.js`,
  add a segment to `lobby.js` with its words in `branding.js`, and update the
  table above and `PLAN.md`.
