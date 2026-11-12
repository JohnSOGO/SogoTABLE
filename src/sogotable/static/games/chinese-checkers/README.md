# Chinese Checkers — browser client

Sternhalma on the 121-hole star. Four play modes (PLAN.md "Play modes"):
**rounds** (secret simultaneous moves, rotating priority), **blitz** (first come
first served on a fixed clock), **live** (immediate moves, round closes when all
have moved or the clock runs out) and **turns** (classic, one at a time).

**Specs this client is built to:**

- [PLAN.md](PLAN.md) — the wire contract: geometry, options (`cc_options`),
  actions, projection, events, conflict resolution. If code and PLAN.md
  disagree, fix one of them in the same change.
- [`docs/game-integration-spec.md`](../../../../../docs/game-integration-spec.md) —
  the lobby ↔ game contract: the ctx bag (§4.5), parallel-play client behaviour
  (§5.5–5.6), renaming and asset swapping (§7).
- [`docs/game-chinese-checkers.md`](../../../../../docs/game-chinese-checkers.md) —
  the game's player-facing rules and variants.
- [`docs/adding-a-game.md`](../../../../../docs/adding-a-game.md) — the UI hard
  rules (`#macroBoard` / `#turnStatus` neutralisers, disable-don't-hide, host
  options in a module store, one layout on every device).

The server lives in `workers/games/chinese-checkers/`. The client computes no
rule outcomes: movable marbles, step targets, the hop graph and the legal stop
holes arrive in `game.legal[myMark]` / `game.stops[myMark]`. Tapping a far-away
reachable hole picks a route by BFS over that server-sent graph; the server
re-validates every `MOVE`. Move hints follow `options.assists`: **full** as
above; **moves** shows only steps and next-hop rings (no dim reach rings, no
tap-far auto-route); **off** shows nothing — `legal_lite` only lets a tap select
one of your marbles, each tapped hole is appended unchecked, and the server's
rejection is flashed with the reject sound.

Clock: `deadline` / `server_now` drive a countdown (`clock.js`) corrected for
phone clock skew. It repaints only the clock bar, ticks softly in the last 3 s,
and at zero sends one `{ type: "TICK" }` per deadline per device (seated viewers
only), because the server enforces deadlines lazily.

## File map

| File | Owns |
|---|---|
| `manifest.js` | Descriptive metadata (`name` pinned equal to `games/registry.js`). |
| `branding.js` | **Every user-facing word**: game, marble and team names, lobby copy, status, buttons, ticker phrases. |
| `assets.js` | **Swappable look and sound**: light/dark palette, seat fallback colours, marble glass params, image and SFX file overrides. |
| `render.js` | `renderChineseCheckersGame(ctx)`: module state keyed by room+epoch (selection also by round), taps, intents, assists levels, move replay animation (a resolved round, or live moves as their events arrive). |
| `controls.js` | Mode-specific play controls: who may act now, strip label/badges/"my state" line, seat status + order, skip vote, the four-slot action bar (Lock in ⇄ Change move, or Move ⇄ Moved ✓). |
| `clock.js` | Countdown bar driven by `deadline` with skew correction; last-3-seconds warn + tick; one `TICK` per deadline per device. |
| `board-svg.js` | Pure SVG builder: wooden star, seat-tinted arms, holes, glass marbles, rings, paths. Viewer's home arm at the bottom. |
| `panels.js` | Status strip, seat table, final results (HTML strings). |
| `lobby.js` | Host options over the shared `renderHostStartLobby`, grouped Mode (mode cards + per-mode clock) / Rules (collapsible) / Helps (move hints); store keyed by room+epoch; `getStartArg → { cc_options }`. |
| `sfx.js` | Synth cues as tone data via `sound.js`, plus the event-seq cursor (the first snapshot only primes it). |
| `styles.js` | Scoped `.chinese-checkers-root` CSS (`cc-*` classes), `#macroBoard` / `#turnStatus` neutralisers, dark tokens. |

## Rename

1. Words: edit `branding.js`. For example, set `MARBLE`/`MARBLES` to
   `"peg"`/`"pegs"` and rewrite `LOBBY.blurb`.
2. Display name in menus: `name` in `manifest.js` **and** `games/registry.js`
   (the architecture test pins them equal). Add the new slug to the registry
   `aliases`. The opaque id `6bc129b1bbed` never changes.

## Swap art or sounds

1. Drop the file in this folder.
2. Point the key in `assets.js` at it, e.g.
   `sounds: { hop: new URL("./hop.mp3", import.meta.url).href, … }`,
   `marble: new URL("./marble.png", import.meta.url).href`.
   When you replace a file later, give it a new name so phones don't serve a cached copy.
3. Leave a key `null` to keep the procedural SVG or synthesised default.
4. To recolour the board, edit `ASSETS.palette.light` / `.dark`. Highlight-ring
   and panel colours are the `--cc-*` tokens in `styles.js`.

## Add a variant option

1. Server: add the key, its default and clamping to `normalizeChineseCheckersOptions`
   in `workers/games/chinese-checkers/rules.js`. Then document it in the PLAN.md
   options table.
2. Client: add the key to `CC_DEFAULTS`, `CHOICES` and the `RULES` or `HELPS`
   section list in `lobby.js`, and add its
   `label` and `hint` to `LOBBY.options` in `branding.js` (plus any new value
   names in `LOBBY.values`). `getStartArg` sends it automatically.
3. If the option changes what is legal, nothing else on the client changes: the
   new rules reach the client through `legal` and `stops`.
