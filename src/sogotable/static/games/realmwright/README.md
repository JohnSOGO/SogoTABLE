# Realmwright — browser client

An original tile-laying realm builder with parallel rounds. The wire contract
(projection, TileDef ports, events, actions, options) is in [PLAN.md](PLAN.md);
the server lives in `workers/games/realmwright/`.

The client only previews and captures intent: legal cells, rotations and
meeple spots arrive in `game.legal[myMark]`, scores and statuses arrive
decided, and one `PLACE_TILE` (tile + optional meeple) is sent per round.

## File map

| File | Owns |
|---|---|
| `manifest.js` | Descriptive metadata (`name` pinned equal to `games/registry.js`). |
| `branding.js` | **Every user-facing word** — game/piece/feature names, lobby copy, status + ticker phrases. |
| `assets.js` | **Swappable art + sound** — light/dark palette, tile/meeple image overrides, SFX file overrides. |
| `art.js` | Pure SVG builders: `tileSvg` / `tileArt` (drawn from any TileDef's features + ports), `featureAnchor`, `featureHighlight`, `meepleSvg` / `meepleShape`. Deterministic (seeded by type id). |
| `render.js` | `renderRealmwrightGame(ctx)` — module state keyed by room+epoch, selection, intents, paint. |
| `board-svg.js` | Board markup: tile symbols, meeples, legal cells, preview + meeple spots, score glow. |
| `board-view.js` | Camera + gestures: drag-pan, pinch / wheel zoom, tap → world coords, fit, `tweenCamera` (rAF ease-out, used by the auto-zoom on the meeple step). |
| `panels.js` | Status strip, action tray, score table, final results (HTML strings). |
| `lobby.js` | Host options over the shared `renderHostStartLobby`; store keyed by room+epoch; `getStartArg → { realm_options }`. |
| `fx.js` | Animation timeline (view only): one queue of timed beats from new events — tile drop, meeple drop ~1 s later, scoring jump + "+N", round banner, last-tile pulse, score count-up, game-over sequence. Absolute start times + negative `animation-delay`, so re-renders never restart it; `prefers-reduced-motion` skips it. |
| `bot-tick.js` | Bot think-time nudger: maps the earliest unplaced bot's `act_at` onto the local clock (`server_now` offset) + a per-seat stagger and sends `BOT_TICK`; errors are silent, retries back off. |
| `sfx.js` | Sound cues as tone data via `sound.js` `playTones`, event-log diffing so everyone hears completions. |
| `styles.js` | Scoped `.realmwright-root` CSS (`rw-*` classes), `#macroBoard` / `#turnStatus` neutralisers, dark block. |

## Swapping art or sounds

1. Drop the file in this folder.
2. Point the key in `assets.js` at it, e.g.
   `tiles: { "base:city1": new URL("./city1.png", import.meta.url).href }`.
   Tile images are drawn **unrotated** (north up); the board rotates them.
   `meeple`, `tileFeatureArt[kind]` and `sounds.{place,meeple,complete,reject,round,win}` work the same way.
3. Leave a key `null` to keep the procedural SVG / synthesised default.
4. Re-colour the procedural art by editing `ASSETS.palette.light` / `.dark`.

New tiles (e.g. an expansion tileset on the server) render with no client
change: the art keys off feature kinds + ports, never tile ids.

## Renaming

- Words: edit `branding.js` (game name, piece name, feature names, phrases).
- Display name in menus: `name` in `manifest.js` **and** `games/registry.js`
  (the architecture test pins them equal). The opaque id `realmwright` never changes.
