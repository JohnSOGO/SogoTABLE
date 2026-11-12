# 🏝️ Tradewind Isles — browser client

An original island trading game with live rounds: one table roll, then
everyone builds, trades and plays discovery cards at once. The wire contract
(projection, actions, events, options) is in [PLAN.md](PLAN.md); the server
lives in `workers/games/tradewinds/`.

The client only previews and captures intent: legal spots, monkey hexes and
victims arrive in `game.legal`, costs in `game.costs`, renown/awards/results
decided. Every action carries `round: game.round`; a server rejection comes
back as an error string and is shown in the top bar with the reject cue.

## File map

| File | Owns |
|---|---|
| `manifest.js` | Descriptive metadata (`name` pinned equal to `games/registry.js`). |
| `branding.js` | **Every user-facing word** — resource/terrain/piece/card/award names + emoji, lobby copy, help text, prompts, log icons. |
| `assets.js` | **Swappable art + sound** — light/dark palette, terrain/resource/piece/monkey image overrides, SFX file overrides. |
| `art.js` | Pure SVG builders: hex polygon, procedural terrain art (palms, clay strata, sisal, mango trees, basalt columns, volcano), hut/lodge/boardwalk pieces, dice. Seeded by hex id. |
| `board-svg.js` | Board markup (sea, beach, docks, hexes, tokens + odds dots, pieces, monkey, legal glow, selection) and `nearestTarget` (tap → nearest vertex/edge/hex of the current mode). |
| `view.js` | View model: seat lookup, names/colours, status chips, prompts, which targets are live. |
| `render.js` | `renderTradewindsGame(ctx)` — module state (room+epoch; selection keyed by round+phase), one delegated click listener, intents → `ctx.makeMove`, paint. |
| `panels.js` | Top bar, hand + build bar + discoveries + Done, scoreboard (+ skip votes), island log, help, results. |
| `flows.js` | Contextual panel under the board: setup, monkey/ranger victim, build confirm, discard picker, Bountiful Tide / Market Day pickers. |
| `trade.js` | Trade drawer: bank trades at dock rates, player offers (compose / accept / confirm / cancel). |
| `lobby.js` | Host options over the shared `renderHostStartLobby`; store keyed by room+epoch; `getStartArg → { ti_options }`. |
| `sfx.js` | Sound cues as tone data via `sound.js` `playTones`; event-log diffing by `seq`. |
| `styles.js` | Scoped `.tradewinds-root` CSS (`tw-*` classes, `--tw-*` tokens), `#macroBoard` / `#turnStatus` neutralisers, dark block. |

## Swapping art or sounds

1. Drop the file in this folder.
2. Point the key in `assets.js` at it, e.g.
   `terrain: { grove: new URL("./grove.webp", import.meta.url).href, … }`.
   Terrain images are clipped to the pointy-top hex. `resources[res]`,
   `pieces.{hut,lodge}`, `monkey` and `sounds.{roll,produce,build,upgrade,buy,play,trade,steal,monkey,award,win,reject,yourTurn}` work the same way.
3. Leave a key `null` to keep the procedural SVG / emoji / synthesised default.
4. Re-colour the procedural board by editing `ASSETS.palette.light` / `.dark`;
   panel colours are the `--tw-*` tokens in `styles.js`.
   When replacing a file, change its name (`grove-v2.webp`) so phones refetch.

## Renaming

- Words: edit `branding.js` (resource, terrain, card and piece names, phrases).
- Display name in menus: `name` in `manifest.js` **and** `games/registry.js`
  (the architecture test pins them equal). The opaque id `tradewinds` and
  every rule id (`timber`, `grove`, `ranger`, `path`…) never change.
