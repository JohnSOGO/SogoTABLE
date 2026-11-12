# Chess Tutor

A solo trainer for chess openings. It teaches standard openings move by move,
explains why each move is good, and then drills the lines against a "defender"
that plays the book replies and the common deviations. Practice works by
repetition: short lines played many times on a spaced-repetition schedule, not
full games.

## Where it lives

- **Client-only.** It has no room, no registry entry, no `GAME_HANDLERS` row and
  no Worker change. It opens from **Learn → ♞ Chess Tutor** on the Games screen,
  which is the `#chessTutor` screen in `index.html`. `app.js` makes one wiring call,
  `wireChessTutor({ deviceSelectedPlayer })`.
- **Progress is device-local.** It is stored in `localStorage`, keyed by the
  selected player (`sogotable.chessTutor.progress.<playerId>`, helpers in
  `storage.js`). Syncing it across devices would need a new Worker owner; see
  Follow-ups below.
- The placement receipt is in [placement-receipts.md](placement-receipts.md),
  dated 2026-11-12.

| File (`static/games/chess-tutor/`) | Job |
|---|---|
| `openings.js` | **Swappable content.** The openings, their lines, a "why" note per move, curated `wrong` and `ok` moves, and the display identity (`TUTOR`: name, icon, piece set, credits) |
| `course.js` | Compiles lines into plies and builds a position tree per opening. It validates legality, notes, and that each position has one student answer |
| `rules.js` | The drill engine (learn, quiz, review and spar modes), the weighted defender, the hint ladder and mistake explanations. Pure |
| `scheduler.js` | Leitner spaced repetition. Pure, with the clock passed in |
| `session.js` | Picks the next new line, finds due lines (mixed across openings) and gives weak lines extra weight in spar |
| `progress.js` | The only module that does I/O: load, save, record a drill, and the streak |
| `render.js`, `drill-view.js`, `board.js`, `styles.js`, `index.js` | Screens, the board wrapper, scoped CSS with dark tokens, and orchestration |

Vendored libraries live in `static/vendor/`, one folder per library with its
LICENSE, unmodified:

- **chess.js 1.4.0** (BSD-2): move legality, SAN and FEN.
- **cm-chessboard 8.15.4** (MIT): an SVG board with tap or drag input, plus the
  markers and arrows extensions. It ships with the Wikimedia "standard" pieces,
  which are CC BY-SA 3.0 and credited on the home screen.

We deliberately did not use:

- Chessground, because it is GPL-3.
- Stockfish, because it is GPL-3 and v1 does not need an engine.

## How a study session works

1. **Learn.** The student plays each move of a new line, guided by an arrow and a
   note. The defender's replies come with their own notes. These moves are not
   graded.
2. **From memory.** The same line is replayed straight away with no arrows
   (retrieval practice). This first graded pass schedules each position.
3. **Review.** Lines with due positions come back, mixed across openings, and
   oldest first. A line that had mistakes repeats once at the end of the session.
4. **Spar.** The defender picks book replies at random, weighted by line
   popularity. Lines with weak or due positions get three times the weight, so
   the drill steers toward what the student is shaky on. A spar ends when the
   game leaves the book.

### Grading (one card per position where it is the student's move)

| Box | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| Next review | now | 4 h | 1 day | 3 days | 1 week | 2 weeks | 1 month | 3 months |

- **Correct without help:** up one box. This only happens when the card was due, so
  practising early never inflates the schedule.
- **Correct with Hint or Show move:** the card stays in its box.
- **Wrong:** back to box 0, and a lapse is counted. The student still has to play
  the right move before the line continues.
- **Mastered:** box 5 or higher.

### Mistakes

A wrong move snaps back. The explanation shows the curated text for that
move if there is one. It then adds the concrete checks that apply:

- the move allows mate in one;
- it leaves a piece hanging or loses material in a trade;
- an early queen move;
- a king move that gives up castling;
- a knight on the rim;
- an early edge-pawn move.

The style checks are skipped when curated text already exists. A move listed
under `ok` is "also fine". It is not counted as a mistake, and the student is
asked to play the course move.

### Optional helps

Every help can be switched off with the chips on the home screen, and each setting
is saved per player:

- the explanation after each move;
- the Hint button (the first tap highlights the piece, the second shows the arrow);
- the arrow on the opponent's last move;
- the detail on why a mistake is a mistake.

## Adding or editing an opening

Edit `openings.js`. In a line, a shared prefix only needs its notes once. Run
`npm test`. `workers/tests/chess-tutor.test.js` checks the following:

- every move is legal and every student move has a note;
- each position has exactly one student answer;
- every curated `wrong` and `ok` move is legal;
- every line can be drilled from start to finish.

To restyle the tutor, edit `TUTOR` and the `--ct-*` tokens in `styles.js`. To change
the pieces, drop another sprite into `vendor/cm-chessboard/assets/pieces/` and
point `TUTOR.pieceSet` at it.

## Sibling paths

- **Mobile touch and desktop pointer:** cm-chessboard handles both tap-tap and
  drag. Both were exercised in Playwright with a phone viewport and a desktop
  viewport.
- **Reconnect and resume:** the screen renders lazily whenever `#chessTutor` becomes
  active, so a resume after an app update reopens it with content. Leaving
  mid-drill keeps the grades earned so far.
- **Room, hot-seat and bot paths:** not applicable, since the tutor is solo and makes
  no server calls.

## Follow-ups

- Sync progress across devices with a Worker/D1 owner, `workers/trainer-progress.js`.
  This needs its own placement receipt.
- Bring in names and lines from the Lichess `chess-openings` dataset (CC0) to widen
  coverage, plus a "biggest gap" picker.
- Tactics and endgame drills, built as new modes over the same scheduler.
- Optional engine checks of the student's own moves through a separate Stockfish
  worker. This needs MojoSOGO's OK because of the GPL licence.
