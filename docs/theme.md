# Dark / Light Theme — Color Scheme Spec

Status: active. Owner doc for SogoTable's dark/light theming. Read this before
adding colors to `styles.css`, `styles-games.css`, or any game module.

## Goal

One per-device dark/light choice that re-skins the **whole screen** (the
platform shell/chrome) plus any game that opts in. Light mode is the original
SogoTable look, unchanged. Dark mode is a coordinated low-light palette.

## Mechanism (how the switch works)

- The active theme is a `data-theme="dark" | "light"` attribute on `<html>`
  (`document.documentElement`).
- An inline script in `index.html` `<head>` resolves and sets it **before
  paint**, so themed surfaces never flash the wrong palette. Order of precedence:
  1. stored choice in `localStorage["sogotable.theme"]` (`"dark"`/`"light"`), else
  2. the device's `prefers-color-scheme`.
- The **Dark mode** checkbox in the Menu (`#optionDarkMode`) flips it live and
  persists the choice. Wiring: `controllers/game-options.js`; helpers
  (`themePreference`, `effectiveTheme`, `setDarkMode`, `applyTheme`): `storage.js`.
- CSS reacts purely off the attribute (`:root[data-theme="dark"] { … }`), so the
  live screen restyles instantly with no re-render.

Keep the inline `<head>` script and `storage.js`'s `effectiveTheme()` in sync —
they encode the same precedence.

## Scope (what is themed today)

| Area | Themed? | Notes |
|---|---|---|
| Platform shell — body background, headers, panels, modals, game list, player setup, rosters, lobby | **Yes** | Driven by the token override block. |
| Mazewright — lobby ("table") **and** live board ("game") | **Yes** | Its `--mw-*` palette has dark + light variants; the light variant inherits the platform tokens. |
| Battleship board | **Yes** | "Dark ocean" palette: deep-navy water, teal ships, hot-red hits, muted misses, amber radar kept. Injected from `games/battleship/client.js` (`BATTLESHIP_DARK_CSS`), theme-gated; the light naval palette in `styles-games.css` is unchanged. |
| Quoridor board | **Yes** | Dark slate board/cells; pawn/legal/goal tints re-mixed toward the dark base, walls lightened to read on dark, amber wall cues kept. Injected from `games/quoridor/client.js` (`QUORIDOR_DARK_CSS`), theme-gated; the turn-colored toolbar chip is left as-is (matches the shell). |
| Super Tic Tac Toe board (+ Tactical variant) | **Yes** | Dark board/cells; `--x`/`--o` marks and turn-soft active boards are already theme-aware, amber win/pickup cues kept, pickup tints darkened. Injected from `games/super-tic-tac-toe/render.js` (`SUPER_TTT_DARK_CSS`); the Tactical variant renders through the same module. |
| Boxes board | **Yes** | Dark score pills / box cells / edges; claimed edges+boxes use the inline player colour, danger box darkened. Injected from `games/boxes/client.js` (`BOXES_DARK_CSS`); the board container was already `var(--surface)`. |
| Yahtzee | **Yes** | Its self-contained `.yz-root` token palette gets a dark override (re-points `--panel`/`--head`/`--ink`/`--muted`/`--line`/`--accent`/`--green`); **dice stay white** (read as real dice on a dark table); canscore/zeroplay row tints tuned. In `games/yahtzee/render.js` (appended to the injected `.yz-root` styles). |
| 10,000 (dice) | **Mostly** | Shell surfaces (scoreboard, lobby, message, standings) themed in the shared dark block; **dice keep white faces**; status/notice text colours lifted for contrast. The colour-coded action buttons (green/red/amber) are kept vivid by design. |
| `#intro` opening screen | **Yes** | Brand red→black hero in both modes; dark mode deepens it (less neon) and lands the tail on the page dark base so it merges into the shell. White primary button keeps a dark-red label; admin action uses the dark danger tokens. Override in `styles.css`. |

The boundary is deliberate: the chrome is token-driven and flips safely, but each
game board carries a bespoke light palette (often `color-mix(... #fff)`) whose dark
variant needs per-game design and contrast checking. Don't blanket-darken a game
board — you will get dark-on-dark text.

## Token architecture

All tokens live in `:root` in `styles.css` (`styles-games.css` defines none — it
only consumes them). Light values are the source of truth; the dark block
overrides them. Three layers:

1. **Brand / semantic** — the original tokens: `--bg`, `--ink`, `--muted`,
   `--line`, `--panel`, `--accent` (brand red), `--accent-strong`, `--warn`,
   `--active`, `--active-soft`, `--x`, `--o`. Plus aliases `--text` (→ `--ink`)
   and `--border` (→ `--line`) that some tables/scoreboards reference.
2. **Surface** — added for theming the formerly-hardcoded chrome surfaces:
   `--surface` (cards/tables/rows/inputs/buttons), `--surface-sunken` (disabled /
   inset boards), `--ring` (green selection ring), `--scrim` (modal backdrop),
   `--shadow` (modal/card shadow), `--secondary-bg`/`--secondary-border`
   (secondary buttons, badges), `--danger-bg`/`--danger-border`/`--danger-ink`,
   `--notice-bg`/`--notice-border`/`--notice-ink`/`--notice-sub`, `--pill-bg`/
   `--on-pill` (dark chips), `--bg-top`/`--bg-bottom` (body gradient stops).
3. **Runtime turn tokens** — `--turn-color`, `--turn-soft`, `--turn-soft-strong`,
   `--turn-text`, `--turn-glow`. JS sets these inline per player/turn; CSS sites
   read them as `var(--turn-soft, <light-fallback>)`. The dark block defines dark
   defaults so the fallbacks aren't light on a dark board. JS-set inline values
   still win where present.

### The override seam

```css
:root[data-theme="dark"] {
  color-scheme: dark;
  /* re-point every themed token to its dark value */
}
```

Because the shell already consumes tokens, one block does most of the work.
Remaining hardcoded translucent/gradient values (where tokenizing would shift the
light look) get small additive `:root[data-theme="dark"] <selector> { … }` rules
instead of being tokenized.

## Palette

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#fff5f5` | `#14181f` | page base tint |
| `--bg-top` / `--bg-bottom` | `#ffffff` / `#f7dada` | `#1b212c` / `#0e1117` | body radial-gradient stops |
| `--ink` / `--text` | `#171717` | `#e8eaef` | primary text |
| `--muted` | `#5f5b5b` | `#9aa3b2` | secondary/label text |
| `--line` / `--border` | `#e7d4d4` | `#2c3340` | borders, dividers, rules |
| `--panel` | `#ffffff` | `#1b212b` | panels, modal body |
| `--surface` | `#ffffff` | `#232b38` | cards, tables, rows, inputs, buttons |
| `--surface-sunken` | `#eef2f8` | `#161b24` | disabled cards, inset boards |
| `--accent` | `#d71920` | `#ef4d52` | brand red; selected borders, links |
| `--accent-strong` | `#8f1116` | `#ff8d90` | emphasis text (must stay legible on bg) |
| `--ring` | `rgba(31,122,95,.16)` | `rgba(120,200,170,.22)` | green selection ring |
| `--scrim` | `rgba(23,32,51,.54)` | `rgba(0,0,0,.62)` | modal backdrop |
| `--shadow` | `rgba(23,32,51,.28)` | `rgba(0,0,0,.5)` | modal/card shadow |
| `--secondary-bg` / `--secondary-border` | `#e8f3ef` / `#b7d8cd` | `#213039` / `#2f4a44` | secondary buttons, badges |
| `--danger-bg` / `--danger-border` / `--danger-ink` | `#fff1f2` / `#fecdd3` / `#9f1239` | `#3a1d22` / `#6e2f37` / `#ff8d9c` | danger/delete buttons |
| `--notice-bg` / `--notice-border` / `--notice-ink` / `--notice-sub` | `#fff7d6` / `#f0d17a` / `#4b3710` / `#6b551c` | `#2c2613` / `#6a5a26` / `#f1dca2` / `#d4c089` | warning banner |
| `--pill-bg` / `--on-pill` | `#172033` / `#ffffff` | `#2b3546` / `#ffffff` | dark chips (turn badge, die pip) |
| `--x` / `--o` | `#1e63d6` / `#c43d5d` | `#5b9bff` / `#e889a0` | player marks |
| `--turn-soft` (default) | *(unset; fallback `#e8f3ef`)* | `#213039` | soft turn fill |
| `--turn-glow` (default) | *(unset; fallback green)* | `rgba(120,200,170,.30)` | board glow |

Mazewright keeps its own `--mw-*` palette (dungeon dark by default). Its **light**
variant points the neutral tokens (`--mw-stage/-panel/-ink/-muted/-grid`) at the
platform tokens so it matches the rest of the light UI, while keeping its game
colors (exit green, gold, start blue, accent indigo).

## Conventions (follow these when adding colors)

- **Never hardcode a theme-sensitive color.** Use a token. If none fits, add one
  to `:root` (light) and give it a dark value in the override block.
- A new surface/card/row/input background → `var(--surface)`; its border →
  `var(--line)`; its text → `var(--ink)`/`var(--muted)`.
- Status colors (success/warn/danger) that must pop in both modes → use/extend the
  `--notice-*` / `--danger-*` families or add a `--success-*` family rather than a
  raw hex.
- Translucent fills layered over the page gradient: keep the light literal and add
  a dark override rather than tokenizing (tokenizing to a solid changes the light
  look).
- `#intro` keeps its brand red→black hero in both modes; dark mode only deepens
  the gradient and merges its tail into the page dark base (don't flatten it to a
  neutral surface — it is still the brand hero).
- Verify contrast: body/emphasis text on its surface should clear WCAG AA
  (`color-utils.js` has luminance/contrast helpers if you need to compute).

## Theming a game board (standard procedure)

Every shipped board now supports dark mode, and **a new game must too** — theme
it during the Phase 0 offline UI build so it lifts in with the rest of the UI
(see [adding-a-game.md](adding-a-game.md) / [offline-ui.md](offline-ui.md)). The
recipe:

1. Identify the board's surface, line, and text colors (often `#fff`,
   `#f8fafc`, `color-mix(... #fff)`).
2. Replace surfaces with `var(--surface)` / `var(--surface-sunken)` and `#fff`
   mix targets with a token (or a dark base) so dark mixes toward dark.
3. Add a theme-gated `:root[data-theme="dark"] .<game>-… { … }` block for values
   that can't be tokenized cleanly, **injected from the game module** (a
   `<GAME>_DARK_CSS` string) — not in the line-capped shared stylesheet. This is
   the pattern every current board uses.
4. Keep physical pieces that read naturally light (dice, white tokens) light —
   don't blanket-darken.
5. Check every text-on-surface pair for contrast in both modes.
6. Update the scope table above.

## Files

- `index.html` — `<head>` resolver script + `#optionDarkMode` checkbox.
- `storage.js` — `THEME_STORAGE_KEY`, `themePreference`, `effectiveTheme`,
  `setDarkMode`, `applyTheme`.
- `controllers/game-options.js` — toggle wiring.
- `styles.css` — `:root` tokens (light) + `:root[data-theme="dark"]` override.
- `styles-games.css` — consumes tokens; small dark block for in-game shell
  surfaces (lobby, win card/overlay, menu inputs).
- `games/mazewright/render.js` — `MW_CSS` with dark + light `--mw-*` variants.
- `games/battleship/client.js` — `BATTLESHIP_DARK_CSS`, injected once; theme-gated dark-ocean board palette (light palette stays in `styles-games.css`).
- `games/quoridor/client.js` — `QUORIDOR_DARK_CSS`, injected once; theme-gated dark board palette (light palette stays in `styles-games.css`).
- `games/super-tic-tac-toe/render.js` — `SUPER_TTT_DARK_CSS`, injected once; dark board palette shared with the Tactical variant.
- `games/boxes/client.js` — `BOXES_DARK_CSS`, injected once; dark board palette (the live Boxes client; `games/boxes/render.js` is an unwired lab).
- `games/yahtzee/render.js` — dark `:root[data-theme="dark"] .yz-root { … }` override appended to the injected `.yz-root` styles.
- `styles.css` — `#intro` opening-screen dark override (in the dark-fixups block).
- `styles-games.css` — 10,000 dice-game dark fixes live in its in-game-shell dark block.
