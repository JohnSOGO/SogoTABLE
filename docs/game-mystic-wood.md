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
  shared host-start render branch in `app.js`.
- **State** is plain serializable data; the projection carries inventory names + an encounter
  combat preview so the client does zero rules math.

## Intended deviations from the rulebook (product decisions, not bugs)

- **Nymph → Crystal → Scry** (an extension item) is deliberately included.
- **Chapel +2 is Prowess-only** (helps magic/warrior fights & companion greeting rolls).
- **Dragon flees → recycles** (only George's kill removes it) and **fight-loss returns companions
  to the deck** — both keep quests always completable (they closed real unwinnable-state stalls).
- **Bishop** gives the Ring instantly; **Dwarf** gives Armour directly; **Ring/Potion/Shield**
  bonuses are placeholders (source `[TBD]`). Generic tiles orient on reveal to stay connected.
- **Now implemented (2026-07-07):** jousts (same-tile challenge, both S+P, winner chooses
  Tower / take a Thing / take a companion); Prince's low-roll attack (greet 2–7 → fight →
  vanquish him and he joins); Bishop's 3-turn prayer for the Ring; Guyon's Cave now counts
  3 turns *spent* (not entries); Illusion "does your bidding" → relocates to an empty glade;
  Queen's boon (5–6 casts a rival into the Tower).
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
2. **[mrc1uwxb] Tower/capture escape roll is invisible.** — Rules are right (escape 5–6, or
   freed on the 4th turn, Key frees at once), but the roll auto-resolves inside
   `beginSeatTurn`/`beginAndAdvance` and only hits the chronicle. **Ask:** surface it as a
   visible dice roll each turn? **Close-out:** `recordRoll(game, mark, …)` the escape attempt
   so the client pops the dice modal; consider making escape **player-triggered** (a "roll to
   escape" action) instead of auto in the bot loop. `deploy:brain`.
3. **[mrbu91ij] "Horses running away doesn't work."** — The Horse greet vanishes the card
   when it "runs" (`applyReaction` `run*` branch). **Ask:** should it instead **flee to an
   adjacent tile** (move the card, so you can chase it)? **Close-out:** relocate `tile.card`
   to the neighbour in the rolled direction rather than `clearCard`. `deploy:brain`.
4. **[mrbty83d] Dwarf rolls but always gives Armour.** — Its whole reaction table is one
   outcome, so the die is cosmetic. **Ask:** skip the roll for single-outcome denizens?
   **Close-out:** detect a denizen whose `tbl` has one distinct effect and skip the die
   display (client) / roll (server).
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
