# Battleship Module

Battleship is a hosted SogoTable game that uses the normal selected-game lobby,
room creation, local opponent, remote invite, bot opponent, reset, exit, and
room WebSocket shell.

The Worker owns setup validation, ship placement, attack legality, hit/miss
resolution, sunk ships, turn order, and final result. The browser renders the
prepared room snapshot and sends setup or attack intent through `/api/room/move`.

## Phases

- `setup`: each player places the five-ship fleet. The browser supports manual
  tap-to-place drafting and an `Auto Place` shortcut.
- `playing`: players alternate attacks. The UI auto-switches to offence on the
  local player's turn and defence while waiting, with manual view controls.
- `complete`: the game ends when one fleet is fully sunk.


## File map

| File | Owns |
|---|---|
| `manifest.js` / `index.js` | Descriptive metadata. |
| `client.js` | Setup/play renderers, draft store, reveal timeline (radar → result), move submit; wires the sea stage. |
| `fleet-geometry.js` | Pure fleet geometry (ship cells, overlap, sunk, random draft). |
| `ship-art.js` | Pure SVG ship builders — shaded 3D-look carrier, battleship, cruiser, submarine, destroyer (horizontal, bow right; vertical = rotated). |
| `fx.js` | Reveal → effect markup/classes: explosion, splash, lingering fire, sinking, shake. No timers; negative `animation-delay` keeps rerenders from restarting effects. |
| `sfx.js` | Sound cues as tone data (`fire`, `incoming`, `hit`, `miss`, `sunk`), played at the reveal beats through `sound.js` (`type: "noise"` voices for blasts and splashes). |
| `assets.js` | **Swappable art + sound** — light/dark sea + fleet palette, per-ship image overrides, sound file overrides. |
| `settings.js` | Per-device view options (`sogotable.battleship.view`) and the "Effects & helps" row. |
| `styles.js` | Injected CSS: dark palette, sea stage, ship overlay, markers, effects, tracker, settings. |
| `phrases.js` | Reveal flavour text. |

## Effects & helps (per device)

- **Effects**: Full (waves, bobbing ships, debris, smoke, fire, shake) · Lite (single-layer bursts, static fire, no shake) · Off (static markers only). `prefers-reduced-motion` forces Off.
- **3D tilted sea**: a mild CSS perspective tilt of the board. Taps still land on cells (the ship layer is `pointer-events: none`).
- **Grid coordinates**: A–J rows and 1–10 columns.
- **Fleet tracker**: ships afloat/sunk. On offence it counts only ships the Worker has revealed as sunk; on defence it also shows damage to your own ships.

## Swapping art or sounds

1. Drop the file in this folder.
2. Point the key in `assets.js` at it, e.g.
   `ships: { carrier: new URL("./carrier.png", import.meta.url).href }`.
   Ship images are drawn **horizontal, bow to the right**, about `size` × 1 cells.
   `sounds.{fire,incoming,hit,miss,sunk}` work the same way.
3. Leave a key `null` to keep the built-in SVG / synthesised default.
4. Re-colour the sea and fleet by editing `ASSETS.palette.light` / `.dark`.
