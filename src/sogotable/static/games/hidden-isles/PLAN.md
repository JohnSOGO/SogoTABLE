# Hidden Isles — build plan and wire contract

An original team word-clue game for SogoTable. Two crews race to find their own
islands on a 5×5 sea chart of words. Each crew has one **Navigator** who can see
the secret chart and gives one-word clues with a number; the rest of the crew
taps words. Hit the **Kraken** and your crew loses on the spot.

Mechanic family: team word-association (two teams, secret key, clue + number,
one instant-loss tile). Everything else — name, theme, art, words, bots — is ours.

## Display vs. rule ids (game-integration-spec §7.2)

The rules speak only in stable ids. Every name, emoji and colour lives in
`branding.js` / `assets.js` on the client.

| Rule id | Default display |
|---|---|
| team `"A"` | 🦜 Parrot Crew (coral) |
| team `"B"` | 🐬 Dolphin Crew (teal) |
| tile key `"A"` / `"B"` | that crew's island |
| tile key `"neutral"` | 🏝️ Sandbar (empty) |
| tile key `"trap"` | 🐙 The Kraken |
| role `"guide"` | Navigator (sees the chart, gives clues) |
| role `"guesser"` | Crew (taps words) |

## Files

Worker (pure, no DOM/fetch/timers):

- `workers/games/hidden-isles/words.js` — word list + association tags (content).
- `workers/games/hidden-isles/clues.js` — clue normalising/legality + association scoring (shared by rules and bots).
- `workers/games/hidden-isles/ai.js` — bot Navigator (clue choice) and bot crew (guess choice).
- `workers/games/hidden-isles/rules.js` — state, actions, projection.

Client (`src/sogotable/static/games/hidden-isles/`):

- `manifest.js`, `branding.js` (every user-facing word), `assets.js` (palette, art + sound overrides, all `null` by default),
  `art.js` (inline SVG), `styles.js` (scoped CSS tokens + dark), `lobby.js` (host options),
  `render.js` (entry), `board-view.js`, `panels.js`, `sfx.js`, `bot-tick.js`.

## Game flow

1. **setup** phase (after host Start). Seats are split into crews alternately in
   seat order (P1 A, P2 B, P3 A, …); the first seat of each crew is its Navigator.
   On a rematch, crews are kept and the Navigator role rotates to the next crew
   member. Any human may switch crew, take the Navigator role for their crew, or
   shuffle crews. Any human may tap **Set sail** (`DEAL`) once each crew has a
   Navigator and at least one other member. Bots never block setup.
2. **Deal.** 25 words from the chosen pack. The starting crew is random; it gets
   9 islands, the other 8, 7 sandbars, 1 Kraken.
3. **clue** phase. The active crew's Navigator sends a one-word clue + a number
   0–9, or "unlimited". Number N allows N+1 guesses; 0 or unlimited allow
   unlimited guesses (at least one guess is still required before passing).
4. **guess** phase. Any member of the active crew (not the Navigator) taps a
   word. First tap the server receives wins (live round); a second tap on the
   same, already-revealed word in the same turn is ignored silently.
   - own island → keep guessing if guesses remain;
   - sandbar → turn ends;
   - other crew's island → it counts for them, turn ends;
   - Kraken → game over, the other crew wins.
   A crew that has all its islands revealed wins immediately (even if the other
   crew revealed the last one).
   Crew members may **PASS** after at least one guess.
5. **complete.** Whole chart revealed to everyone.

## State (authoritative, server-only fields marked *)

```js
{
  game_id, status: "playing" | "complete",
  phase: "setup" | "clue" | "guess",
  options: { pack: "classic" | "easy" | "mixed", clue_ideas: bool, team_marks: bool },
  seat_order: ["P1", …],
  players: { P1: { is_bot, level, name?, team: "A"|"B", role: "guide"|"guesser", act_at } },
  board: [ { word, key*, revealed, revealed_by, revealed_turn } ] × 25,
  start_team, turn_team, turn: 1,          // turn = barrier stamp; bumps on every clue→guess→switch cycle
  phase_started_at,                        // server epoch ms
  clue: null | { word, count, unlimited, by, turn },
  guesses_made, guesses_left,              // guesses_left null = unlimited
  marks: { [index]: [mark…] },             // crew pointers for the current turn (cleared on switch)
  log: [ { turn, team, by, word, count, unlimited, results: [ { index, word, key } ] } ],
  remaining: { A, B },
  winner_team, end_reason: "found_all" | "kraken" | null, winner,
  events: [ { seq, type, … } ], event_seq, move_count, carry*
}
```

## Actions (all stamped with `turn` except setup ones)

| type | who | phase | payload |
|---|---|---|---|
| `JOIN_TEAM` | human | setup | `{ team: "A"|"B" }` |
| `BE_GUIDE` | human | setup | `{}` (becomes Navigator of own crew; old one becomes crew) |
| `SHUFFLE_TEAMS` | human | setup | `{}` |
| `DEAL` | human | setup | `{}` |
| `CLUE` | active Navigator (human) | clue | `{ turn, word, count, unlimited }` |
| `GUESS` | active crew member (human, not Navigator) | guess | `{ turn, index }` |
| `PASS` | active crew member | guess, ≥1 guess made | `{ turn }` |
| `MARK` | active crew member, `team_marks` on | guess | `{ turn, index }` toggles your pointer |
| `BOT_TICK` | any seated human | clue/guess | `{ turn }` — releases a bot whose `act_at` passed |
| `NUDGE` | any seated human | clue/guess, phase open ≥ 90 s | `{ turn }` — away-player rescue: a bot gives this clue / ends this crew's guessing |

Stale `turn` → loud error "refresh to catch up". Wrong role/phase → readable error.

## Clue legality (clues.js)

Normalise: trim, lowercase, letters plus internal `-`/`'` only, one word, 2–20
chars. Reject if it equals an **unrevealed** board word, or either contains the
other (when the shorter is ≥ 3 letters), or they match after stripping a plural
`s`/`es`. Error text names the reason without leaking which word, beyond the
word the player can already see.

## Bots

- Pacing via `act_at` + client `BOT_TICK` (Realmwright pattern): Navigator thinks
  ~5–9 s, each crew guess ~2.5–4 s. A table with no humans resolves instantly.
- Bot crew members only guess when their crew has no human guessers; with human
  crew mates, bot crew members drop a pointer `MARK` on their best guess instead.
- Levels 1–4 scale clue ambition (how many words a clue aims at, how strictly it
  avoids risky words) and guess accuracy / when to stop.

## Projection (`hiddenIslesGameToDictForViewer`)

- `board[i].key` is shown only if revealed, the viewer is a Navigator, or the game
  is complete. Otherwise `key: null`.
- `you: { mark, team, role }` for the viewer.
- Navigators of the active crew get `clue_ideas` (when the option is on):
  `[ { word, count, targets: [indexes] } ]` up to 6, safest-first.
- `server_now` for bot-tick clock offset; `act_at` per bot seat.
- `players` as an array in seat order: `{ mark, is_bot, level, team, role, act_at }`.

## Options (host lobby, all helps optional)

- `pack`: `classic` (default) / `easy` (kid-friendly words) / `mixed`.
- `clue_ideas`: Navigator clue suggestions — default **off** (it is a strong help).
- `team_marks`: crew pointer markers — default **on**.

## Stats

Win-only: `winner` = the winning crew's Navigator mark (stats has no team concept
yet). `hiddenIslesScoreByMark` returns `null` (no leaderboard entry). Follow-up:
team-aware wins.
