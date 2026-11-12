# Tracklayers — browser client

An original train-route game with simultaneous rounds. The wire contract
(rules, projection, actions, events, options) is in [PLAN.md](PLAN.md); the
server lives in `workers/games/tracklayers/`. Player rules and architecture:
[`docs/game-tracklayers.md`](../../../../../docs/game-tracklayers.md). The
lobby ↔ game contract: [`docs/game-integration-spec.md`](../../../../../docs/game-integration-spec.md).

The client renders the projection and captures intent. Each round it sends
one `COMMIT` (`DRAW` / `CLAIM` / `TICKETS`), after a `KEEP_TICKETS` when
tickets are pending. Buttons are pre-disabled only for plainly impossible
picks (UX); the server re-validates everything at the barrier.

## File map

| File | Owns |
|---|---|
| `manifest.js` | Descriptive metadata (`name` pinned equal to `games/registry.js`). |
| `branding.js` | **Every user-facing word**: game name, card colour names, lobby copy, status / button / results phrases, event icons. |
| `assets.js` | **Swappable art + sound**: light/dark palette (sea, land, 8 card colours + wild + gray), sea image, card art, SFX file overrides. |
| `render.js` | `renderTracklayersGame(ctx)`: module state keyed by room+epoch (selection keyed `${code}:${epoch}:${round}`), intents, view model, paint, device-local helps toggles. |
| `map-svg.js` | The board SVG: sea, procedural islands, routes as rows of cars (twins offset), owner colours, city labels (greedy placement), highlights; `nearestRoute` tap hit-test. |
| `advice.js` | Display-only hints: affordable routes, pay options, ticket connected?, suggested shortest path. Never authoritative. |
| `panels.js` | Strip, ticket picker, action area (claim / market + deck / tickets), hand + tickets, score table with Ready/Waiting chips + skip votes, round log, helps row, results. |
| `lobby.js` | Trains-each option (25/35/45) over the shared `renderHostStartLobby`; store keyed by room+epoch; `getStartArg → { tracklayers_options: { trains } }`. |
| `sfx.js` | Synth cues (`draw`, `claim`, `claimOther`, `tickets`, `reject`, `finalRound`, `win`) from event-seq diffing; file overrides first. |
| `styles.js` | Scoped `.tracklayers-root` CSS (`tl-*`), `#macroBoard` / `#turnStatus` neutralisers, dark block. |

## Swapping art or sounds

1. Drop the file in this folder (give a replacement a new name, e.g. `claim-v2.mp3`).
2. Point the key in `assets.js` at it, e.g.
   `sounds: { claim: new URL("./claim.mp3", import.meta.url).href, … }`,
   `cardArt.red`, or `seaImage`.
3. Leave a key `null` to keep the procedural SVG / synthesised default.
4. Re-colour the map and cards by editing `ASSETS.palette.light` / `.dark`.

## Renaming

- Words: edit `branding.js`. City names come from the server map
  (`workers/games/tracklayers/map.js`, `name` field; ids are permanent).
- Display name in menus: `name` in `manifest.js` **and** `games/registry.js`
  (the architecture test pins them equal). The opaque id never changes.
