# The Mystic Wood

A digital re-creation of Terence Donnelly's 1980s tabletop **The Mystic Wood** (base game),
as SogoTable's first game with a bespoke **explorable-board** display. Category: **Board Games**.

- **Seating:** host-start, **3–5 knights** (only five knights exist), bots fill empty seats.
- **Coupling:** shared-table, **turn-based** (Move/Turn-Locked). No hidden information.
- **Lobby:** the shared host-start lobby; knights are dealt **at random** at start (v1).

## How to play

Each knight starts at the Earthly Gate and has a **personal quest**:

| Knight | P/S | Quest |
|---|---|---|
| George | 1/3 | Slay the Dragon (only he can *kill* it), then leave the Wood |
| Perceval | 3/1 | Leave the Wood bearing the Holy Grail |
| Roland | 2/2 | Leave the Wood with the Princess |
| Guyon | 2/1 | Spend 3 full turns in the Cave (needs the Golden Bough) |
| Britomart | 3/1 | Leave the Wood with the Prince (and she ignores the King) |

On your turn you make **one move** into a connected adjacent tile. Unexplored tiles reveal on
entry and may hold a denizen: **fight** beasts (Strength), magic-users (Prowess), and warriors
(both), or **greet** the rest and roll for their reaction. Gather **Things** and **companions**,
finish your quest, then **hold the Enchanted Gate through a full turn** to win — or vanquish the
**King** and **hold the Castle** a full turn to win as King (not Britomart). Losing a fight sends
you to the **Tower** (companions return to the wood); the **Enchantress** captures instead
(escape on a 6). Combined Prowess+Strength may not exceed **10** (Prince & Sage are exempt).

Powers activate from the action bar when held: **🔮 Scry** (Crystal), **🔄 Rotate** (Wand),
**⛲ Drink** (on the Fountain), **✨ Transport** (Arch-Mage companion). Tap a tile to zoom
(7→5→3→2 wide); 🔍 resets.

## Architecture

Follows the standard one-game contract (`docs/adding-a-game.md`), Mazewright/RTTA precedent.

- **Server (authoritative, pure):** `workers/games/mystic-wood/{data,engine,rules,ai}.js`. One
  seeded RNG seam; board gen (T-junction/crossroads tiles), movement, a recycling denizen deck,
  combat/greet/spell/power resolution, the turn machine, and human-path bots. Dispatch row in
  `workers/games/handlers.js`.
- **Client:** `src/sogotable/static/games/mystic-wood/{render,styles,manifest}.js` — the 7×9
  board + 3-level zoom, seat list, encounter Greet/Challenge prompt, power buttons, end screen.
  Idempotent snapshot render from `mysticWoodGameToDict`; intents via `ctx.makeMove`. Joins the
  shared host-start render branch in `app.js`. `horn.js` owns the Mystic Horn scatter effect.
- **State** is plain serializable data; the projection carries inventory names + an encounter
  combat preview so the client does zero rules math.
- **Discrete one-shot events** ride the projection as monotonically-seq'd records the client fires
  exactly once, never replaying on re-render or reload: `results[mark].seq` (a knight's last roll)
  and `horn.seq` (the Mystic Horn scatter — `{ seq, byName, marks, tour }`, where `tour` is each
  scattered knight's landing cell in seat order). The seq only ever advances; nothing clears it.
  On a fresh mount the client adopts the current seq without playing it.
- **A roll record always states its consequence.** Both encounter records carry the chronicle lines
  the resolution produced — `detail` for a challenge, `result` for a greet — so the modal says *what
  happened* (the Dragon slain, a Thing taken, the crown claimed), not just who rolled higher. Resolve
  first, `recordRoll` last; the headline (`Victory! — 9 vs 6`) is not repeated in the detail.
  A resolution reads its own lines back through `logMark`/`logSince` (`engine.js`), which count
  events (`game.log_n`) rather than index into `game.log` — the chronicle is capped at 80 lines, and
  an index goes stale the instant the cap starts trimming the front. **Never `game.log.slice(n)`.**
- **A greeting tells a story.** `DEN_TALES` (`data.js`) gives every reaction a greet table can roll
  one line of original chivalric-romance prose (`{k}` = the knight), the way `KNIGHT_INTRO` does for
  the send-off; the rulebook prints a reaction table and no story. The result card shows the tale as
  its headline and drops the bookkeeping (the Thing, the new S/P) to the detail line. A test pins the
  coverage, so a new `tbl` row can't quietly fall back to bare narration. Denizens marked `proper`
  (Merlin) take no article: "You greet Merlin", never "the Merlin".
- **Every card is met with its own line.** `DEN_INTRO` (`data.js`) gives each *encounterable* denizen
  a unique first-sight sentence (`{k}` = the knight), pushed through `pendingToDict` as `pending.intro`
  and shown atop both the encounter card and the "pick one of six" grid — so a fight foe, a companion,
  and a greet denizen are each introduced in the same voice, not just the greet denizens. Spells are
  never "met" (they resolve on arrival) and are exempt; a test pins coverage of the rest. A missing
  key falls back to engine's plain "{k} comes upon …".

## Intended deviations from the rulebook (product decisions, not bugs)

- **Nymph → Crystal → Scry** (an extension item) is deliberately included.
- **Chapel +2 is Prowess-only** (helps magic/warrior fights & companion greeting rolls).
- **Dragon flees → recycles** (only George's kill removes it) and **fight-loss returns companions
  to the deck** — both keep quests always completable (they closed real unwinnable-state stalls).
- **Bishop** gives the Ring instantly; **Dwarf** gives Armour directly; **Ring/Potion/Shield**
  bonuses are placeholders (source `[TBD]`). Generic tiles orient on reveal to stay connected.
- **A greeting rolls only when the die can change the outcome.** The Dwarf (→ Armour), the Nymph
  (→ Crystal), the Sage (always befriends) and the Bishop (always kneels to pray) have one fixed
  reaction, so `resolveGreet` rolls no die and the result card shows none (`greetNeedsDie`,
  `engine.js`). Every varying reaction table still rolls, as before.
- **Now implemented (2026-07-07):** jousts (same-tile challenge, both S+P, winner chooses
  Tower / take a Thing / take a companion); Prince's low-roll attack (greet 2–7 → fight →
  vanquish him and he joins); Bishop's 3-turn prayer for the Ring; Guyon's Cave now counts
  3 turns *spent* (not entries); Illusion "does your bidding" → relocates to an empty glade;
  Queen's boon (5–6 casts a rival into the Tower).
- **The Mystic Horn is staged, not silent (2026-07-08).** A scatter used to look like a teleport,
  so knights lost their own token. Now `horn.js` plays it: a horn call, every token touring each
  knight's landing place in turn before it settles (~2s, one-shot per `horn.seq`), and the
  chronicle strip becomes a flashing herald that narrates the Horn and holds the tale until the
  player taps **Silence the Mystic Horn**. Reduced-motion skips the tour and the flashing.
- **Still not implemented:** the **obligation/rescue subsystem** (Boy/Damsel/Child + chivalry
  cards + delivery — a dedicated feature), and **Magician's Storm** (the recovered rules never
  state what a Storm *does* — blocked pending the rulebook text; won't be invented). Knight
  selection is random at start; per-seat interactive picking is a planned fast-follow. Joust
  refinements (once-per-game Queen boon, player-chosen boon target, Castle defender +2) pending.

## Open issues — AWAITING SOGO'S INPUT (do not close without it)

These came from Sogo's in-app bug reports (room PM0T, 2026-07-08). Each is **blocked on a
decision or detail only Sogo can give** — a future AI should surface these to Sogo, get the
answer, then take the close-out path. Do **not** guess the rules; per doctrine, published
rules win. (Report IDs are the in-app `bugreports` slugs.)

1. **[mrc1f6xw] Combat: opposed roll, or roll-vs-fixed?** — Today `resolveChallenge`
   (`engine.js`) rolls a d6 for **both** the knight and the denizen (yourP+die vs foeP+die).
   Sogo questions whether the Enchantress fight should be opposed at all. **Ask:** does the
   rulebook have the denizen use a **fixed** value you roll against, or does it also roll?
   **Close-out (if fixed):** drop the foe's die in `resolveChallenge`, set `foe = foe stat
   total` (no `red` die), update `combatPreview`, the dice-reveal card (`showDice`), and the
   unit tests; `deploy:brain`. This affects **all** combat, not just the Enchantress.
2. ~~**[mrc1uwxb] Tower/capture escape roll is invisible.**~~ — **CLOSED 2026-07-10.** Sogo
   confirmed the ask ("make it obvious every turn I am trying to escape and whether it succeeds;
   use the pick one of the six emoji screens"). No rules change — escape is still 5–6 / auto-free
   on the 4th turn / Key frees at once (Tower) and a 6 (Enchantress); the answer to "am I forced to
   stay three turns?" is **no** (any 5–6 frees you, the 4th turn is the guaranteed release). The fix
   is purely surfacing: a HUMAN's imprisoned turn now stops on a **player-triggered `escape_pick`**
   (the same "pick one of six" as combat/greet), resolved in `doEscapePick` (`rules.js`) via
   `resolveEscape`/`escapeOutcomes` (`engine.js`), which `recordRoll`s the attempt so the client
   pops a result modal (`showEscapePick` + the `escape` branch of `showDice`, `encounter.js`).
   **Bots still auto-roll** in `beginSeatTurn` (they can't tap). A freed knight keeps the turn to
   move (rulebook: "may move same turn"); a held one ends it. Needs `deploy:brain`.
3. ~~**[mrbu91ij] "Horses running away doesn't work." / "is there a path where I get the horse?"**~~
   — **CLOSED 2026-07-10.** No question needed: the rulebook settles it (`AI/Mystic_Wood`
   COMPONENT_DATA + rules-complete §6) — *1,2→N · 3,4→S · 5→E · 6→W **if a road leads that way;
   else it befriends***. The Horse **runs one glade along the road**, it does not leave the wood.
   `applyReaction` was `clearCard`-ing it (recycled into the deck), so on an open crossroads it
   simply disappeared and only a *walled* direction ever yielded a catch — the player's "I never
   get the horse". Now `horseRunsTo` (`engine.js`) relocates `tile.card` to the neighbour (chase
   it); no road / board edge / no free card slot there → caught, `clearCard(…, false)` so a held
   Horse is **not** reshuffled into the deck, and `enforcePower` runs (the Horse counts toward the
   Power Limit of 10, per §6). `greetOutcomes` now shows the real per-board catch odds. Needs
   `deploy:brain`.
4. ~~**[mrbty83d / mrc79i4d] Dwarf rolls but always gives Armour.**~~ — **CLOSED 2026-07-08.**
   Sogo re-asked ("Does dwarf always give armor? Why roll?") — yes, it always did; the die was
   cosmetic. `greetNeedsDie` (`engine.js`) now suppresses the roll for any denizen whose reaction
   never varies (Dwarf, Nymph, Sage, Bishop) and `showDice` (`render.js`) omits the die from the
   result card. **No rules change** — the outcome was already unconditional. Needs `deploy:brain`.
   *If* the rulebook turns out to give the Dwarf a varying table, that is a separate `data.js` fix
   and the roll returns on its own.
5. **[mrbu6ls6] "Can't move to a tile that's my quest."** — Likely the **Cave** (Guyon needs
   the Golden Bough to enter — by rules) or a named tile whose fixed roads don't connect.
   **Ask:** which knight + which tile (r,c)? **Close-out:** if it's the Cave, it's by-design
   (surface a "needs Golden Bough" hint); if a named tile's `open` doesn't align with the
   approach road, fix orientation in `buildBoard`/`assignOpenings`.
6. **[mrc21fpc] Intro-story popup at game start.** — A one-time modal where the absent knight
   asks the player to fulfil his quest, before the first move. **Ask:** Sogo to provide the
   copy, and whether it's one shared framing or per-knight. **Close-out:** one-time modal in
   `render.js` (gate per `view.gameKey`), text in `content.js`.
7. **[mrbtylnl / mrc24ovl] Double-tap zoom on phone — REWRITTEN to pointer events (`ddd2ba6`),
   needs Sogo to verify.** — Root cause found: iOS Safari withholds the **2nd click** of a
   double-tap, so click-based zoom could never fire on iPhone (single-tap move worked because
   the 1st click does). Board input is now fully pointer-event driven (tap / double-tap / pan),
   tapped cell mapped from coordinates. **Ask:** Sogo to confirm on iPhone. **Close-out if STILL
   broken:** the peek's `touchstart.preventDefault()` may cancel the pointer stream on holdables
   (watch for `pointercancel`), or widen the 400ms window — capture pointer-event diagnostics
   from the device. See `docs/lessons.md` (iOS double-tap).

## Status

Code-complete and green on `feature/mystic-wood-port` (full worker suite, incl. architecture gates;
plus headless rules + render smokes). **Before ship:** in-browser verification and the four
Verification Gates (rules-fidelity, projection, sibling-parity, resilience) per
`docs/adding-a-game.md`. Lab/prototype: `AI/Mystic_Wood/` (`COMPONENT_DATA.md`,
`mystic-wood-rules-complete.md`); build plan + receipts: the module's `PLAN.md`.
