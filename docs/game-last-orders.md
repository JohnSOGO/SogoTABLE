# 🍻 Last Orders

An **original** tavern-brawl card game. The mechanics come from the familiar
drinking-and-brawling card game family: two tracks that meet, coins, one action
a turn, buying rivals drinks from a shared drink deck, reactions that answer any
card, gambling rounds, and last one standing wins. The name, patrons, card
names, card text and art (procedural SVG) are SogoTable's own. Host-start lobby,
2+ players, bots fill the table.

Full design and wire contract: `src/sogotable/static/games/last-orders/PLAN.md`.

## How to play

Every patron has **Grit** (20), **Buzz** (0) and **Coins** (10). You're out when
your Buzz reaches your Grit (passed out), your Grit hits 0 (knocked out), or your
Coins hit 0 (broke). Last patron standing wins.

On your turn, in order around the table:

1. **Discard & draw**: discard up to 3, draw back to 7.
2. **Action**: play one action card (some are free or grant another), or skip.
3. **Order a round**: send the top drink of the drink deck to a rival's drink
   line, optionally spiked with a card from your hand.
4. **Drink**: flip the top drink of your own line and drink it.

### Reaction windows

Every action, drink and gamble play opens a short **timed window** (host option,
default 8 s) where anyone allowed may answer with a reaction. Each answer
restarts the clock. When it runs out, or everyone eligible taps **Pass**, the
stack resolves last-played first. A negate cancels the card under it, so it can
itself be negated. You can't answer your own card on top. Bots always take a
think-time, whether they react or pass, so nobody can tell early who holds an
answer.

### Gambling

A gamble action makes everyone ante 1 coin; the starter leads. Others may play
gamble cards to take the lead (or raise: everyone pays more). When a gamble
window closes with nobody taking over, the leader takes the pot.

### Closing time

From table round 8 every drink adds +1 Buzz, +2 from round 12, +3 from 16, so a
night always ends (host can switch it off).

## Packs

| Pack | Adds |
|---|---|
| The Tipsy Lantern (base) | 4 patrons + the base drink deck |
| Brine & Barrels | 2 patrons + harbour drinks |
| Frostmead Hall | 2 patrons + northern drinks |
| Midnight Masquerade | 2 patrons + masquerade drinks |
| Clockwork Cellar | 2 patrons + workshop drinks |
| Rowdy Nights | a tavern event deck: one event flips each table round |

## Host options

Reaction seconds 5/8/12/20 · expansion packs · closing time on/off · random
patrons · playable-card glow on/off. Per-device helps (all optional): card tips,
rules primer, auto-pass when you hold nothing playable.

## Timing without timers

The Worker has no timers. Window close times and bot think times are
timestamps; the projection carries `next_due_at` + `server_now`, and a seated
human's phone sends `TICK` when it passes (the Realmwright bot-tick pattern).
Every action first catches the table up to "now". Actions are stamped with
`step`; a stale stamp is rejected loudly. A stuck human can be auto-played by
the bot brain after a unanimous skip vote, until they act again.

## Architecture

- **Server:** `workers/games/last-orders/`. `packs/*.js` + `packs.js` (card
  data, the expansion seam), `catalog.js` (id lookup, deck builders),
  `engine.js` (effects, stack, drinks, gambling, outs), `legal.js` (the one
  legality owner: validator, bots and `me.playable` all ask it), `ai.js` (bot
  levels 1–4), `rules.js` (lifecycle, turns, windows, projection).
- **Client:** `src/sogotable/static/games/last-orders/`. `content.js` (all card
  and patron display text), `branding.js` (UI words), `art.js` + `assets.js`
  (procedural SVG + swappable overrides), `describe.js` (rules text from defs),
  `render.js` and helpers, `lobby.js`, `tick.js`, `sfx.js`, `fx.js`, `styles.js`.
- **Platform rows:** registry entry, `isLastOrdersGameState`, the
  `GAME_HANDLERS` row with options hooks, the viewer projection line, the stats
  score row (placement points: winner = seat count).

## Adding an expansion

Add `packs/<id>.js` exporting `{ id, characters, drinks, events }` using only the
effect vocabulary in PLAN.md §2, list it in `packs.js`, add display entries in
`content.js`, and run `npm test` (the content test checks every id and op).
