# The Mystic Wood — Integration PLAN (Intake Survey + receipts)

> First game in the **Board Games** category to be built with a bespoke display.
> Promoted from the `AI/Mystic_Wood/` standalone (Phase 0 — done). This file is the
> Phase 1 survey + the durable decision record the Verification Gates check against.
> **Nothing here is a bug if it's listed as an intended deviation.**

Status: **vertical slice complete** (branch `feature/mystic-wood-port`). Server rules + client
(`render.js`/`styles.js`/`manifest.js`) + minimal app.js wiring done; **`availability:"ready"`**.
Full worker suite green (323, incl. app.js let-cap/ceiling, manifest reconcile, review-export).
**Remaining before ship:** in-browser verification (MojoSOGO) + the four fresh-session Verification
Gates. The client is coded against the platform contract but **not yet browser-verified**.

---

## Phase 1 — Intake Survey

### A. Seating, coupling & timing
- **Who plays:** multi-device rooms (the platform default). Hot-seat on one device
  must also work (shared-table turn rotation stays local between commits).
- **Coupling:** **Shared-table** — all knights explore *one* board; the shared truth
  is the board + all players' state, not a leaderboard. (NOT Game-Locked.)
- **Sync mode:** **Move/Turn-Locked** — strict turn order; the server validates each
  committed action and broadcasts the board. This is the fully-built path.
- **Timing:** `turnBased`.
- **Seats:** **N-player, minimum 3, no maximum, bots fill** (RTTA convention).
  `lobbyMode:"hostStart"`, `host_start:true`, `player_count:null`.

### B. Client vs server split — actionable events
Local (no round-trip): rendering, the 3-level map zoom/pan + top-menu, tile/knight
selection & hover peeks, "are you sure" affordances, animation, turn rotation while
hot-seat. **Actionable events sent to the server (the minimal set):**
1. `move` — commit a move to an adjacent connected tile (may reveal a tile + draw).
2. `encounter-choice` — Greet vs Challenge (and any withdraw, if added).
3. `power` — activate a held power: Drink (Fountain), Scry (Crystal), Rotate (Wand),
   Transport (Arch-Mage). Each is an authoritative state change.
4. `end-turn`.
5. `start-game` (host) with the knight-assignment start arg (see AREC §2).
Everything else is local view state.

### C. Hidden information
- **None.** Tiles reveal to *all* players on exploration; there is no private hand,
  no fog of war, no hidden fleet. → **No per-viewer sanitizer / `…ToDictForViewer`.**
  Do **not** add one (placement-advisor explicitly flagged this).

### D. Authoritative state shape (plain, serializable, replayable)
- `board`: 63 tiles (7×9), each `{r,c,half,open:{N,E,S,W}, _openSet, revealed, name,
  label, fixed, card, card2, seed, _used?, remains?}` — all scalars/ids.
- `deck` / `discard`: arrays of denizen **ids** (strings).
- `players[]`: `{id(knight), r, c, things[], prowess[], companions[], horse, tower,
  towerTries, captured, caveTurns, questDone, isKing, castleHold, _atGate, _princeUsed,
  won, bot}` — ids + scalars only.
- `cur`, `running`, `over`, plus an **RNG seed** (see below).
- Purely **local view state** (never sent): `zoom`, `focus`/camera, selected tile,
  open menu/panel. **These live in the game module, never as new `app.js` `let`s.**
- **RNG seam (server-owned):** board generation, tile-opening assignment on reveal,
  card draws/shuffle/discard-reshuffle, and **combat/greet dice** are shared-outcome
  randomness → the **server owns them, seeded for replay**. The standalone calls
  `Math.random()` inline; the lift must route every one through one seeded RNG the
  server controls. This is the single biggest lift delta.

### E. Assets
- **No binaries.** Tiles/denizens are inline **SVG**, recoloured via CSS custom
  properties (theme-aware). Per-game CSS is injected as scoped `MYSTIC_WOOD_CSS` +
  `MYSTIC_WOOD_DARK_CSS` under `.mystic-wood-root`. (Optional AI-gen art is a
  documented later opt-in; not in scope.)

### F. Bots
- **Required** (bots fill empty seats). v1 lifts the prototype's heuristic bot
  (head for the Enchanted Gate when quest done; else explore unrevealed; resolve
  encounters via the same rules path — no bot-only shortcuts). Difficulty ladder is
  a later enhancement. Bots must **run the human rules path**.

### G. Reuse
- Reuse **lobby, room, invite, presence, stats** unchanged. The only category-level
  novelty is the **custom board display** (per-game module concern, not shell).

### H. Rules source & deviations
- **Clone.** Rulebook + recovered data live in `AI/Mystic_Wood/` (`COMPONENT_DATA.md`,
  `mystic-wood-rules-complete.md`). The **Rules-Fidelity gate** holds the build to them.
- **Intended deviations (a listed difference is a product decision, not a bug):**
  - **Nymph → Crystal → Scry** is an *extension* item, deliberately **included**.
  - **Bishop** gives the Ring instantly (rule: pray 3 turns). **Dwarf** gives Armour
    directly (rule: reveals its location).
  - **Ring/Potion/Shield** bonuses are placeholders (Ring +1P, Potion +1S, Shield +1S)
    — the source is `[TBD]`.
  - **Chapel +2 is Prowess-only** (MojoSOGO ruling 2026-07-06): helps magic/warrior
    fights & companion greeting rolls; nothing in a beast/Strength fight.
  - **T-junction/crossroads tiles oriented on reveal** so the entry road stays open
    (digital stand-in for "place the tile to connect").
  - **Deck recycles** (denizens that leave a tile reshuffle from a discard when the
    deck empties) so encounters never run dry on the larger board.
  - **Deferred (not yet built)** — carry as known gaps until scheduled: **jousts**,
    **Queen's boon**, **obligation/rescue companions** (Boy/Damsel/Child/Crone),
    **Magician's Storm** (no defined effect in sources — will not be faked),
    **Illusion "send to an area"**, **Prince's low-roll attack**, Dragon-flee relocation.

---

## Sync mode summary
**Move/Turn-Locked · shared-table · turnBased · N-player (min 3, bots fill).**

---

## PLACEMENT RECEIPT (from `placement-advisor`, 2026-07-06)
All concerns → **existing owners**; **no new owner row** for the default path.

| Concern | Owner (all existing) |
|---|---|
| Category grouping | `games/registry.js` row `category:"board"` (rendered by `games/game-list-view.js`; the `board` group already exists — Battleship/Quoridor/Mazewright ship in it) |
| Server rules + `is<Game>` + id | **NEW file** `workers/games/mystic-wood/rules.js` (existing dir-pattern owner; global 800-line cap) |
| Worker dispatch row | `workers/games/handlers.js` (~275/800) — **one import + one row**. *Not* `workers/sogotable-api.js` (adding-a-game.md is stale on this). |
| Client display (7×9, zoom/pan, top-menu) | **NEW file** `src/sogotable/static/games/mystic-wood/render.js` (+ `manifest.js`, `index.js`?, `styles.js`, `README.md`, this `PLAN.md`) |
| Client kind predicate | `games/game-kinds.js` — add `isMysticWoodGameState` |
| Render fan wiring | `src/sogotable/static/app.js` — **minimal-additive only** (import + append to the **shared host-start branch**; ~1–3 lines) |
| Knight-pick lobby | `games/lobby.js` `renderHostStartLobby(host, ctx, opts)` — pass `wrap:"mystic-wood-root"` |
| Registry/manifest | one `GAME_REGISTRY` row + `GAME_IDS.mysticWood`; reconciling `manifest.js`; add all new files to `review-export.js` allowlist |

**Hard constraints (from live ceilings in `workers/tests/architecture.test.js`):**
- `app.js` is **2476/2497 lines (21 free) AND at the 30/30 top-level `let` cap.** →
  **Ride the SHARED host-start render branch** (RTTA/Mazewright precedent). Do **not**
  add a bespoke `if (isMysticWoodGameState) {…}` block or **any** new top-level `let`.
  All zoom/pan/selection/menu state is **module-owned** (closure), not shell state.
  Adding shell state or a bespoke branch is a **reorganizer trigger** — stop and
  extract the host-start render fan first if the game can't ride the generic ctx bag.
- `rules.js` must be **pure**: no `document`/`window`/`localStorage`/`fetch`/timers
  (architecture test enforces). Watch the 800-line cap; if the board engine nears it,
  split *within the module* (board-gen vs turn-resolution), never into the shell.
- `render.js` reaches the shell **only** through the injected ctx bag; never imports
  `app.js`; never imports another game. If it exceeds 800, split board layer vs HUD.
- `workers/sogotable-api.js` (1370 cap) and `styles-games.css` (1700 cap) **untouched**.

---

## AREC resolutions (routed by the advisor as product/architecture calls)
1. **No shared "board-game display/lobby framework" now.** A category is display
   *grouping* only; there is no category-level display/lobby machinery. Building a
   shared board-game framework for game #1 is YAGNI. → Build the display in
   `games/mystic-wood/render.js`; extract a shared seam only when a *second* board
   game demonstrably needs the same one.
2. **Knight selection = rules-bearing state.** Knights differ in P/S, quest, and start
   — so "which knight is seat N" is **authoritative game state owned by `rules.js`**,
   assigned & validated at **seat-init**, duplicates rejected. The lobby only captures
   intent; the UI must never smuggle the stat differences.
   - **v1 (this build):** reuse `renderHostStartLobby` **unchanged** — knights assigned
     at seat-init (distinct, random or by seat order) with an optional host start-arg,
     exactly the `getStartArg` shape 10,000 uses. No shared-lobby change.
   - **Fast-follow (separate AREC + a new shared-lobby capability):** *per-seat
     interactive* "pick your knight or random at join." This needs a new capability on
     the shared `games/lobby.js` (a shared-owner change) — **not** a forked bespoke
     lobby. Scheduled after single-game play is solid.

---

## Vertical slice — file checklist (Phase 2)
- [x] `workers/games/mystic-wood/rules.js` (+ `engine.js`, `data.js`, `ai.js`) — pure, module-seam
      RNG; exports `MYSTIC_WOOD_GAME_ID, isMysticWoodGame, newMysticWoodGame, initMysticWoodSeats,
      makeMysticWoodMove, mysticWoodGameToDict, setMysticWoodRandom`. All ≤800 lines, purity-clean.
- [x] `workers/tests/mystic-wood-rules.test.js` — 11 browser-free tests (stats, combat win/loss,
      Sage/Princess audit fixes, contract, min/max, seeded full-game integration).
- [x] `src/sogotable/static/games/mystic-wood/{render,manifest,styles}.js` — 7×9 board, 3-level
      zoom, seat list, encounter Greet/Challenge, power buttons, end screen; scoped themed CSS.
      (No `index.js` — no game module has one.) render.js reads `toDict`, posts via `ctx.makeMove`.
- [x] `games/registry.js` — `GAME_IDS.mysticWood` + `GAME_REGISTRY` row, **`availability:"ready"`**.
- [x] `games/game-kinds.js` — `isMysticWoodGameState`.
- [x] `workers/games/handlers.js` — one import + one dispatch row.
- [x] `app.js` — minimal-additive: 1 import + 4 in-place identifier insertions on the shared
      host-start branch. No new top-level `let`; within the 2497-line ceiling.
- [x] `review-export.js` — allowlisted the four server + three client files.
- **Projection enrichment:** `toDict` emits inventory *names* + an encounter `preview` (`combatPreview`
      in engine) so the client renders "Prowess — 6 vs 4" without re-implementing any rules math.
- **v1 knight assignment:** random distinct at seat-init (no lobby start-arg). Per-seat interactive
      picking remains the documented fast-follow (needs a shared-lobby capability + an `applyStartOptions`
      row).

### Turn model + termination fixes (found by the seeded integration test)
- **One move per turn**, then the turn ends (encounter → Greet/Challenge choice → ends; empty → ends).
  Powers (Scry/Rotate) are pre-move; Drink/Transport relocate and end the turn.
- **Dragon flees → recycles** (only a George-slain Dragon is removed) so George's quest stays possible.
- **Losing a fight returns your companions to the deck** (recycle) so quest companions (Grail/Prince/
  Princess) can't be permanently locked by the wrong knight — this closed a genuine unwinnable-state
  stall. Rogue/Queen sends keep companions. *(Both fixes also back-ported to the `AI/` prototype.)*

## Verification Gates — receipts (run each in a fresh session; no receipt → not done)
- [ ] GATE Rules-fidelity — build the Rules Ledger from the rulebook; diff vs code.
- [ ] GATE Projection — every field the client reads is emitted by `toDict`.
- [ ] GATE Sibling-parity — bot/human, hot-seat/rooms, reconnect/join, min/max seats.
- [ ] GATE Resilience — duplicate/stale/out-of-order submits, refresh, socket drop.

*(A standalone rules-compliance audit ran 2026-07-06 against the prototype: highly
faithful; 5 fixes applied, Prince low-roll attack deferred. That audit is not a
substitute for the Rules-Fidelity gate on the ported `rules.js`.)*
