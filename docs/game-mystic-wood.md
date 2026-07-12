# The Mystic Wood

A digital re-creation of Terence Donnelly's 1980s tabletop **The Mystic Wood** (base game),
as SogoTable's first game with a bespoke **explorable-board** display. Category: **Board Games**.

> **Authoritative rules:** `docs/mystic-wood-rulebook.md` (extracted from the official Version 2.0
> rulebook; PDF at `docs/reference/mystic-wood-rules-v2.0.pdf`). When code or this doc conflicts with
> it, the rulebook wins. It arrived 2026-07-10 and unblocks features previously deferred for lack of
> the text.

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
you to the **Tower** (companions return to the wood); the **Enchantress** never jails — vanquished by
her you **remain in her glade** and your companions scatter (§18.7). Combined Prowess+Strength may not
exceed **10** (Prince & Sage are exempt).

Powers activate from the action bar when held: **🔮 Scry** (Crystal), **🔄 Rotate** (Wand),
**⛲ Drink** (on the Fountain), **✨ Transport** (Arch-Mage companion). Tap a tile to zoom
(7→5→3→2 wide); 🔍 resets.

## Architecture

Follows the standard one-game contract (`docs/adding-a-game.md`), Mazewright/RTTA precedent.

- **Server (authoritative, pure):** `workers/games/mystic-wood/{data,engine,events,spells,rules,ai}.js`.
  One seeded RNG seam; board gen (T-junction/crossroads tiles), movement, a recycling denizen deck,
  combat/greet/spell/power resolution, the turn machine, and human-path bots. Dispatch row in
  `workers/games/handlers.js`. `events.js` is the pure leaf that writes the seq'd board-event
  descriptors (`recordRotation` / `recordHorn`) — engine and spells import it; it imports nothing.
- **Client:** `src/sogotable/static/games/mystic-wood/{render,styles,manifest}.js` — the 7×9
  board + 3-level zoom, seat list, encounter Greet/Challenge prompt, power buttons, end screen.
  Idempotent snapshot render from `mysticWoodGameToDict`; intents via `ctx.makeMove`. Joins the
  shared host-start render branch in `app.js`. `horn.js` owns the Mystic Horn's token tour; `herald.js`
  owns the generic self-clearing banner (title/tale/dismiss over the chronicle strip, keyed by an event
  seq) that the Horn — and any future board event — raises to tell its tale.
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
  A resolution reads its own lines back through `logMark`/`logSince` (`narration.js`), which count
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
- **The Magician's Storm** (§18.11) is a `tile.storm = { turns, fresh }` on the board. `raiseStorm`
  sets it (rules `doStorm`: Magician companion, one/turn, never from/at the Tower); `decayStorms` ages
  every storm once per `advanceTurn` (`fresh` frees the creating turn, then 3 more). `reachableFrom`
  returns `[]` from a stormy tile and skips stormy neighbours — so *normal* movement is barred both
  ways, while `relocate`-based magical movement (transport/horn) bypasses it entirely. The projection
  sends `tile.storm` = turns left; the client shows a badge and a tap-to-target "Storm" mode
  (`stormMode` in render.js), mirroring the block in its own `reachableSet`. Bots don't raise storms
  yet (a fast-follow) but handle being storm-blocked (no reachable → they pass).

## Rulebook alignment (2026-07-11: the code follows the rulebook — prior "deviations" were bugs)

Per MojoSOGO, the previously-documented "intended deviations" were mistakes. The rules audit
(`docs/mystic-wood-audit.md`) is authoritative; the code now follows the rulebook. Corrected:
**Chapel is +1 Prowess** in a challenge/greeting (§17.2, was +2); the **Enchantress never captures** —
you remain in her glade and lose companions (§18.7, was jail-with-escape-on-a-6).

Still faithful to the rulebook (not deviations, just noted):
- **Dragon flees → recycles** when defeated by a non-George knight (only George's kill removes it);
  **fight-loss sends companions back to the wood** (§10: they become independent) — both match §18.4/§10.
- **A greeting rolls only when the die can change the outcome** — a UX choice; the outcome is identical
  to rolling, so it doesn't diverge from the rules (just skips theatre rolls).

Flagged for MojoSOGO's call (an ADDITION, not in the base rulebook — keep or remove):
- **Nymph → Crystal → Scry** is an extension item.
- **Bishop** grants the Ring after a 3-turn prayer (see below); **Dwarf** gives Armour directly;
  **Ring/Potion/Shield** bonuses are placeholders (source `[TBD]`). Generic tiles orient on reveal
  to stay connected.
- **A greeting rolls only when the die can change the outcome.** The Dwarf (→ Armour), the Nymph
  (→ Crystal), the Sage (always befriends) and the Bishop (always kneels to pray) have one fixed
  reaction, so `resolveGreet` rolls no die and the result card shows none (`greetNeedsDie`,
  `engine.js`). Every varying reaction table still rolls, as before.
- **Now implemented (2026-07-07):** jousts (same-tile challenge, both S+P, winner chooses
  Tower / take a Thing / take a companion); Prince's low-roll attack (greet 2–7 → fight →
  vanquish him and he joins); Bishop's 3-turn prayer for the Ring; Guyon's Cave now counts
  3 turns *spent* (not entries); Illusion "does your bidding" → relocates to an empty glade;
  Queen's boon (5–6 casts a rival into the Tower).
- **Bishop prayer holds the knight (2026-07-10, report `mrfof9ip-to1swn`).** Kneeling is a
  commitment: while `praying`, `beginSeatTurn` (`rules.js`) returns `"skip"`, so the turn machine
  auto-holds the seat and counts the prayer each round until the Ring is earned (bots already held
  via `ai.js`). Previously a human was handed a normal, active turn and any move silently *lapsed*
  the prayer, so a human playing naturally never accumulated the count — "it starts but doesn't
  count." On the turn the prayer completes, `praying` is false and the freed knight plays on.
- **A foregone fight is "no match" — no pick (2026-07-10, report `mrfr29hn-yv3t9s`).** When the
  rolled red leaves *every* white face a win-or-tie (no `lose`/`captured` face), the "pick one of
  six" is empty ceremony — and worse, landing on the lone tie face rerolls a *fresh* red that could
  be losable, so the ceremony could cost you the sure thing. `openCombatPick` (`rules.js`) now detects
  the no-losing-face case, logs "*<foe>* is no match for *<knight>*", and resolves the win outright on
  a winning face — straight to the victory reveal, no pending pick. Fights that can still be lost are
  unchanged; bots already auto-resolve via `resolveChallenge`.
- **The Mystic Horn is staged, not silent (2026-07-08; hardened 2026-07-10).** A scatter used to
  look like a teleport, so knights lost their own token. `horn.js` plays it: a horn call, every
  token touring each knight's landing place in turn before it settles (~2s, one-shot per
  `horn.seq`), and the chronicle strip becomes a flashing herald (`herald.js`) that narrates the
  Horn. Reduced-motion skips the tour and the flashing.
  Two fixes (bug `mrdk3cws-996mir`): (1) the tour now **resumes on every render** while it is in
  flight — a snapshot render rebuilds the tokens, so a mid-tour re-render (a bot's turn, a poll)
  used to strand the knights half-way and you'd never see the full scatter. (2) The herald
  **clears itself** after a readable window (~8s) instead of sitting over the chronicle until the
  player taps **Silence** — which they rarely did, so the Horn's message lingered across later
  turns and read as a phantom re-trigger (e.g. it appeared to "sound" while a knight was being
  beaten by a beast). The **Silence** button still dismisses it early. The server never triggers a
  Horn on a defeat; `resolveSpell` is the only source, and a Horn always ends the drawer's turn.
- **Magician's Storm — NOW IMPLEMENTED (2026-07-10)** once the rulebook arrived (§18.11): the
  Magician companion's owner may, on their turn, raise a storm on any area (not from/at the Tower);
  for three full turns after, no one may enter or leave it by *normal* movement (magical movement —
  transport/horn/relocate — bypasses).
- **§8.2.1 the snub — NOW ENFORCED (2026-07-11, room 4LSI):** a denizen who "remains" *ignores that
  knight* until they have "challenged or greeted a Denizen in another area, or jousted with another
  Knight". The bar is **per-knight** (`seat.snub = {card,r,c}`; another knight may still be heard),
  and only an encounter **elsewhere** — or a joust — lifts it. Standing still and retrying does
  nothing, and neither does stepping off the tile and back on; the area may be **passed through
  freely** meanwhile, and a two-card area still yields its *other* denizen. Enforced on **both**
  paths — `openEncounter` (human, `rules.js`) and `botEnter` (bot, `ai.js`) — or the bots would
  quietly play by different rules. Was previously unenforced: you could re-roll a denizen for free.
- **§9 more than one card in an area — NOW ANNOUNCED AND BINDING (2026-07-12, room QZCS):** an area can
  hold two cards (the Palace/Altar deal two; the Horse can *run into* an occupied glade), and the rule is
  "you must approach all Denizens individually, and your turn is not over until you have done so or have
  been sent to another place". The engine already met the second — but silently, so a fresh card appearing
  the moment the first was dealt with read as a bug ("I get a Merlin card after capturing horse; rules
  ok?"). It now **names §9** in the chronicle and on the card (`pending.second`). Two halves were also
  *wrong*: (1) withdraw stayed on offer for the second denizen, though §9 spends the withdrawal on
  **entering** the area — barred in `doWithdraw`, and `canWithdraw:false` in the projection; (2) `botEnter`
  met only the **first** card and walked away from the second — bots now loop the area like the human path
  (`afterEncounter`), stopping only if the knight is carried out of it (Tower/transport).
- **§18.10 the crown REPLACES the quest — now said out loud (2026-07-12, room 4T6D).** Vanquishing the
  King swaps the Knight card for the King card, and the quest with it ("his quest is now to occupy the
  Castle rather than to visit the cave"). `becomeKing` always set `seat.q = "king"`, but `seatToDict`
  projected the quest text straight off the **knight** card — so a George who took the crown was still
  told to slay the Dragon, was then (correctly) refused the kill under §18.4, and finally found the
  Enchanted Gate shut against him. The engine was right the whole way; the screen was lying. The
  projection now derives `quest`/`label` from `isKing` (`KING_QUEST`, `data.js`), the swap is announced
  in the chronicle (and rides both the fight and joust result modals via their `detail` capture), and
  the Gate now **says why it will not open** for an unfinished quest — or, for a King, that it is no
  longer his road at all.
- **§18.15 the Prince is spent only when his arm DECIDED the fight (2026-07-12, room 4T6D).** He was
  auto-added to the first eligible challenge and always spent — so on a fight already won he cost his
  knight *twice*: the Prince himself, and (per §18.15) the prowess for the kill. §12 says a knight **may**
  use a companion's aid, so he now follows the same rule the **Sage** already did: he stands in the line
  (his +3 shows in the odds), but he is only billed when the margin without him was ≤ 0. A fight won
  without him keeps him — and keeps the prowess. A **lost** fight never spends him. And §18.15's other
  half now holds too: "if you approach him again, you must greet him in the usual way" — a re-won Prince
  **fights again** (`_princeUsed` was a once-a-game latch the rules never asked for, so a knight could
  re-befriend him and find him a dead weight).
- **Chivalry (§15) is implemented** — `game.chivalry` holds each obligation's bearer; merely *seeing*
  a Boy/Damsel in an area you enter lays the duty on you, **withdrawing does not shed it** (the
  rulebook's own example: "He withdraws from the area, but he must take the Save Boy card"), it
  passes to the last knight to see them, and delivery (Boy → Earthly Gate, Damsel → Queen) fulfils it.
- **Still not implemented:** knight selection is random at start; per-seat interactive picking is a
  planned fast-follow. Joust refinements (once-per-game Queen boon, player-chosen boon target,
  Castle defender +2) pending. **Known gap:** a bot credits its *arrival* turn toward the Cave vigil
  (`ai.js` `botEnter`) while a human must sit three turn-*starts* — unreported, but a real bot/human
  asymmetry worth closing.

## Informed Consent (design doctrine, 2026-07-12)

The 4T6D bug batch was, to a fault, **one failure repeated**: the game changed a player's
situation — or offered a deal — without saying *what changed, what it cost, what it granted*, or
letting the player choose. The crown silently swapped George's quest; the Dragon was "vanquished"
then fled; the Gate would not open and would not say why; the Damsel was delivered in the chronicle
alone. So we adopt a standing principle.

**Informed Consent.** Whenever an action changes a player's state, or an approach/deal is offered:

1. **Informed (always).** Show the *terms* — what changes, what it costs, what it grants — on the
   screen where it happens (a modal), **not** the chronicle (which is for review, and on a phone is
   easy to miss). The terms are **computed server-side** and carried in the prepared state
   (`pending` / `results`), then rendered by the client. The UI never invents them (Wu Wei: rules
   own the transition and prepare the state; UI renders and captures intent).
2. **Consent (only where the rules allow it).** Let the player accept or decline **exactly where the
   rulebook grants a choice — and only there.** Where a `§` *forces* the act, there is no decline;
   the obligation itself is the rule (chivalry is the archetype — see the carve-out). Adding a
   decline where a rule forces the act is itself a rules violation.

The split is the whole point: **you can always be *told*; you can only *decline* where the rulebook
says you may.** Do not gate a downside-free boon behind a tap — inform, and move on. Reserve consent
prompts for choices that are both **rules-legal** and **meaningful** (a real cost or trade-off).

### Classification — every state-change / approach (the source of truth)

**FORCED (inform only — no decline; a `§` dictates the outcome):**

| Mechanic | Rule | Status |
| --- | --- | --- |
| Chivalry: Boy/Damsel obligation laid on you | §15 — the carve-out; obligation is mandatory | forced (correct) |
| Take the crown once you beat the King | §18.10 — vanquisher *becomes* King | forced; **informed** (pre-fight warning + swap notice, 2026-07-12) |
| Greeted-denizen reaction (remains / transport / transportYou / befriend / tower / give / horse-runs) | §8 — you chose to greet; the die/denizen dictates the reaction | forced; inform via result modal |
| Fight loss → Tower; Enchantress ensnare | §8 / §18.7 | forced; informed |
| Spell events: Mystic Horn scatter, Mystic Wind (sweeps Things), Mystic Fog (rotates), Magician's Storm | §6 / §18.11 — drawn from the deck, resolve on reveal | forced; staged/narrated |
| Queen's boon casts a rival into the Tower | §ext | forced; informed |
| Power-Limit *that you exceed* must be resolved | §18 — surrender is mandatory | forced **to resolve** — but *which* cards is a choice (below) |

**OPTIONAL (inform AND allow the choice — a `§` grants it):**

| Mechanic | Rule | Status |
| --- | --- | --- |
| Withdraw vs approach; greet vs challenge | §7 flow | ✅ consent exists |
| Move or stay put (movement is voluntary) | §5 (“movement is voluntary”) | ✅ exists |
| Guyon's +1 after the roll | §8.2 | ✅ toggle exists |
| Joust prize (Tower / Thing / companion) | §12 | ✅ choice exists |
| **Power-Limit: *which* card(s) to shed** | §14/§18 — the player chooses | ❌ **auto-picks & deletes** — first consent slice |
| Voluntary Thing drop | §11 | ❌ not built |
| Voluntary Horse release (declare where it runs) | § (Horse) | ❌ not built |
| Exchange Things / hand a companion to a knight in your area | §13 | ❌ not built |

The `❌` rows are the rules-legal gaps the audit (`docs/mystic-wood-audit.md`) already lists as
pending — this doctrine names them under one banner rather than inventing new rules.

### Follow-through (so the principle sticks)

- **Every new mechanic must declare, in code and in its result/pending, (a) its terms and (b)
  forced-or-optional with a `§` citation.** A new `results`/`pending` that mutates state without
  surfacing terms is a review finding.
- Bot parity is mandatory: every consent point needs a deterministic bot auto-resolution (bots are
  never prompted). Sibling path: bot vs human.
- An outstanding consent `pending` must re-surface on reconnect/resume (multiplayer resilience).
- Rollout is **incremental and rules-audited**, never a big-bang refactor: doctrine + transparency
  first (presentation, low risk), then one consent slice at a time via the `placement-advisor`
  (each crosses the rules/transport boundary). Power-Limit choice (§14/§18) is the first slice.

## Open issues — AWAITING SOGO'S INPUT (do not close without it)

These came from Sogo's in-app bug reports (room PM0T, 2026-07-08). Each is **blocked on a
decision or detail only Sogo can give** — a future AI should surface these to Sogo, get the
answer, then take the close-out path. Do **not** guess the rules; per doctrine, published
rules win. (Report IDs are the in-app `bugreports` slugs.)

1. ~~**[mrc1f6xw] Combat: opposed roll, or roll-vs-fixed?**~~ — **CLOSED 2026-07-11 by the rulebook.**
   §8.1: *"Roll the two dice. The white die gives your basic score, and the red die gives the Denizen's
   basic score."* Combat **is opposed** — both roll. `resolveChallenge` (both dice) was already correct;
   no change. (The Enchantress is opposed like every foe; she just doesn't jail on a loss — §18.7.)
2. ~~**[mrc1uwxb] Tower/capture escape roll is invisible.**~~ — **CLOSED 2026-07-10.** Sogo
   confirmed the ask ("make it obvious every turn I am trying to escape and whether it succeeds;
   use the pick one of the six emoji screens"). No rules change — escape is still 5–6 / auto-free
   on the 4th turn / Key frees at once (Tower) and a 6 (Enchantress); the answer to "am I forced to
   stay three turns?" is **no** (any 5–6 frees you, the 4th turn is the guaranteed release). (The
   Enchantress no longer jails at all — §18.7; escape is Tower-only now.) The fix
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
