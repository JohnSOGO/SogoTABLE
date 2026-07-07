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
- **Not yet implemented:** jousts, Queen's boon, obligation/rescue companions, Magician's Storm
  (undefined in sources), Illusion "send to an area", Prince's low-roll attack. Knight selection
  is random at start; per-seat interactive picking is a planned fast-follow.

## Status

Code-complete and green on `feature/mystic-wood-port` (full worker suite, incl. architecture gates;
plus headless rules + render smokes). **Before ship:** in-browser verification and the four
Verification Gates (rules-fidelity, projection, sibling-parity, resilience) per
`docs/adding-a-game.md`. Lab/prototype: `AI/Mystic_Wood/` (`COMPONENT_DATA.md`,
`mystic-wood-rules-complete.md`); build plan + receipts: the module's `PLAN.md`.
