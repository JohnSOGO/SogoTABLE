# Bloomwork — browser client

An original flower-garden drafting game with simultaneous picks. The rules,
projection (`bloomworkGameToDict`) and action protocol (`makeBloomworkMove`)
live in `workers/games/bloomwork/`; the game doc is `docs/game-bloomwork.md`.

The client renders the projection and captures intent: tap a flower in a
market stall or the Square (selects every flower of that kind there), then tap
a planter row or the compost heap — that sends one
`{type:"PICK", round, pick, source, flower, row}`. The server validates,
resolves clashes in `game.priority_order`, and sends back events.
`READY_NEXT` closes the round summary; `SKIP_PLAYER` is the unanimous skip vote.

## File map

| File | Owns |
|---|---|
| `manifest.js` | Descriptive metadata (`name` pinned equal to `games/registry.js`). |
| `branding.js` | **Every user-facing word** — game, flower and table names, lobby copy, status / log phrases, results text. |
| `assets.js` | **Swappable art + sound** — light/dark palette (incl. a colour set per flower), flower / bird / table image overrides, SFX file overrides. |
| `art.js` | Procedural SVG: one `<symbol>` sprite per table (five flowers with distinct shapes, Early Bird, stall pot); `tileSvg` / `birdSvg` / `potSvg`. |
| `board.js` | Market (stalls + the Square) and garden (planter rows → bed, compost heap) markup, big for you and mini for opponents. |
| `hints.js` | **Display-only** mirror of the fit check + points preview for the Helps highlight. The server stays authoritative. |
| `panels.js` | Seat chips, status + priority strip, opponents, last-pick log, round summary, results. |
| `render.js` | `renderBloomworkGame(ctx)` — module state keyed by room+epoch (selection keyed by round+pick), intents, animation clock, paint. |
| `lobby.js` | Host options over the shared `renderHostStartLobby`; store keyed by room+epoch; `getStartArg → { bloom_options }`. |
| `sfx.js` | Tone cues via `sound.js`, driven by diffing `game.events[].seq` (primed on first snapshot). |
| `styles.js` | Scoped `.bloomwork-root` CSS (`bw-*`), `#macroBoard` / `#turnStatus` neutralisers, dark tokens; palette → CSS custom properties. |

## Swapping art or sounds

1. Drop the file in this folder.
2. Point the key in `assets.js` at it, e.g.
   `flowerArt: { rose: new URL("./rose.png", import.meta.url).href, … }`.
   `birdArt`, `tableBg` and `sounds.{pick,take,clash,plant,compost,round,turn,win,tick,reject}` work the same way.
3. Leave a key `null` to keep the procedural SVG / synthesised default.
4. Re-colour the procedural art by editing `ASSETS.palette.light` / `.dark`
   (each flower has `tile`, `petal`, `deep`, `heart`). When replacing a file
   later, change its name so phones don't keep a cached copy.

## Renaming

- Words: edit `branding.js` (game name, flower names, "market stalls",
  "the Square", "planter rows", "garden bed", "compost heap", "Early Bird", phrases).
- Display name in menus: `name` in `manifest.js` **and** `games/registry.js`
  (the architecture test pins them equal). The opaque id and the rule ids
  (`rose`, `center`, `bird`, …) never change.
