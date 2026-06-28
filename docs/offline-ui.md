# Building Offline UI Prototypes

The conventions for a SogoTable **Phase 0 standalone UI** — the self-contained
local app you build in the gitignored `AI/<game>/` sandbox to prove a game's feel
and rules before integration. This doc owns the **UI shape and the shell
contract**; `docs/adding-a-game.md` Phase 0 owns *why* you prototype and the
promotion gate. Read both.

The worked examples are `AI/Yahtzee/`, `AI/match-three/`, and
`AI/Dungeon Master/`.

---

## The golden rule

> **Build only the in-game screen the shell mounts — nothing the lobby owns.**

A SogoTable game module never renders the lobby, the room, identity, or seating.
By the time your code runs, the room already exists and N players are already
seated. Your prototype must make the **same assumption**: start as if the lobby
just handed you a live, seated room. Everything you build is the part that mounts
into `#macroBoard` and the chrome around it — the board, the move/intent capture,
the turn/phase status, and the player status table.

This keeps the standalone honest: what you build is what becomes `client.js`, and
nothing you build gets thrown away as "lobby scaffolding."

---

## What NOT to build

These are owned by the platform shell. A prototype that includes them is building
the wrong thing and will be torn out at integration:

- **No intro / splash / "how to play" screen** — *unless explicitly asked.* Open
  straight into the live game.
- **No game creation, room setup, or join flow.** The **lobby** creates the room
  and chooses the game. Your prototype starts already in a room.
- **No "how many players?" picker, and no fixed 2/3/4 buttons.** **Player count
  comes from the server** — build for **N players** and read the count from the
  injected player list (see *The shell seam*). Never hardcode a seat count into
  the UI.
- **No player roster across the top.** The shell does not put a player list at the
  top. Player identities and scores live in a **status table at the bottom**
  (see *Layout*).
- **No identity, login, avatar/color picker, or profile UI.** Players arrive
  already named, emoji'd, and coloured from their profiles.
- **No custom settings/options panel** unless the game genuinely needs in-game
  options (rare; flag it).

If the game truly needs one of these, that is an `AREC`-worthy exception — say
*what* and *why* in `PLAN.md`, don't add it by default.

---

## What TO build — layout

Top-to-bottom, mobile-first (design for a phone, scale up):

1. **A thin status line** — whose turn / current phase / the one piece of "what
   now?" the active player needs. Not a roster.
2. **The game board / play area** — the focus, the part that becomes the
   `#macroBoard` mount. This is where intent is captured (taps, drags, keys).
3. **The player status table — at the bottom.** Every seat, in seat order, with
   name + emoji/colour + the score/state that matters this game, the active seat
   highlighted, finished/eliminated seats marked. This is the N-player surface;
   it must render correctly for any N from the injected list, not a fixed 2–4.

Conventions:

- **Mobile-first and touch-first.** Big tap targets; `touch-action: manipulation`;
  test at a phone width. Pointer/keyboard niceties are additive, never required.
- **Scope every CSS selector** under a single `.<game>-root` wrapper. A promoted
  standalone with generic names (`.row`, `.card`, `.cell`) would clobber the shell
  globally. Inject one scoped stylesheet.
- **Emoji over binaries** on the critical path; keep large art out of the
  prototype.

---

## The shell seam — mock the room, don't build it

The shell will hand the game a **ctx bag**: the seated players, who is to move,
and callbacks to commit actions and read room state. In the standalone you
**mock that bag** at the top of the controller and mark it clearly as
shell-provided. The mock is the only place the missing lobby is faked.

```js
// === SHELL-PROVIDED at integration (the lobby/room owns this) ===
// N players, already seated, named, emoji'd, coloured. Build for ANY length.
// Swap this literal for the ctx bag the shell injects; do not build a chooser.
const MOCK_PLAYERS = [
  { id: 0, name: 'Player 1', emoji: '🧙' },
  { id: 1, name: 'Player 2', emoji: '🐉' },
  // ...N — the count comes from the server, not from UI
];
```

- **Derive everything from the list length.** Seating, the status table, turn
  rotation, and win/score logic all read `players.length` — never a constant.
- **Two layers, split on the SogoTable seam:**
  - **Rules core** (`rules.js`) — pure: no DOM, no timers, no network. Owns
    validation and state transitions behind one entry point,
    `applyAction(state, action)`, shaped like the worker's
    `applyAction(game, mark, payload)`. This becomes
    `workers/games/<id>/rules.js` unchanged.
  - **Render/controller** (`index.html` / the script) — renders prepared state
    and captures intent. This becomes `client.js`.
- **THE hook — one commit funnel:**
  ```js
  function commit(action) { applyAction(state, action); render(); }
  ```
  Standalone: applies locally. Integrated: `commit` sends the action to the
  Worker and awaits the authoritative new state. Local-only UI (selection,
  preview, "are you sure", animation) never goes through `commit` until it is an
  *actionable* event. This is the "local-first turn-taking, server-authoritative
  commits" split from `docs/adding-a-game.md` Phase 1B.

---

## State and determinism

- **Authoritative state is plain serializable data** (indices, ids, scalars,
  plain maps) — no DOM nodes, no class instances, no promises — so it round-trips
  through D1 and replays deterministically.
- **Separate local view state** (hover, selection, camera, animation) from the
  authoritative state the server will own.
- **Put randomness behind one RNG seam** (`applyAction(state, action, rng)`),
  default `Math.random`, so the Worker can own shared-outcome randomness for
  fairness/replay. Cosmetic local randomness can stay client-side.
- **Flag server-authority deltas early** in `PLAN.md`: turn ownership becomes a
  server check; shared RNG moves server-side; and **hidden information** (a hand,
  a hidden board, fog of war) needs a per-viewer sanitizer — never broadcast the
  full state. A standalone holds all state on the client, which is fine in the lab
  but fatal for a multiplayer hidden-info game; design that seam before the
  prototype hardens.

---

## Run & test

- **Serve over HTTP** (ES module imports don't work from `file://`):
  `python -m http.server <port>` then visit it. Hard-refresh (or add `?v=`) to
  beat module caching after edits.
- **Rules tests run with no browser:** `node --test` against `rules.test.mjs`.
  Pin every transition and the illegal-action rejections. The browser is for feel;
  the tests are for correctness.
- **Fail loud in the lab.** Illegal actions throw with an explicit reason — the
  server will re-validate the same way.

---

## Files

```text
AI/<game>/
├─ index.html        # render/controller (→ the future client.js)
├─ rules.js          # pure rules core (→ workers/games/<id>/rules.js)
├─ rules.test.mjs    # node --test suite, browser-free
├─ PLAN.md           # the Intake Survey answers (docs/adding-a-game.md Phase 1)
└─ README.md         # run, how-to-play, the integration hooks, status
```

Keep it in the gitignored `AI/<game>/` sandbox until it passes the survey + AREC
gate. Never commit anything under `AI/`.

---

## Pre-flight checklist

- [ ] Opens straight into the live game — **no** intro/setup/join screen.
- [ ] **No** player-count picker; seats derived from the injected player list.
- [ ] Renders correctly for **N players**, not a fixed 2–4.
- [ ] **No** player roster at the top; player **status table at the bottom**.
- [ ] One `MOCK_PLAYERS` (or ctx-bag) seam, clearly marked shell-provided.
- [ ] Pure `rules.js` core + one `applyAction` seam; `commit()` is the only funnel.
- [ ] Plain-data state; RNG behind a seam; hidden-info/authority deltas noted in
      `PLAN.md`.
- [ ] All CSS scoped under `.<game>-root`; mobile-first; emoji over binaries.
- [ ] `node --test` green; illegal actions throw.
- [ ] `PLAN.md` answers the Intake Survey; promote only after AREC.

---

## Where to go deeper

- [Adding a Game](adding-a-game.md) — Phase 0 rationale, the Intake Survey, the
  build checklist, and the shell-integration edges (neutralizing `.macro-board`,
  managing shell chrome, the `GAME_HANDLERS` row).
- [Modularity](modularity.md) — the ownership golden rule (platform/game/UI/
  persistence).
- [Wu Wei Method](wu-wei-method.md) — the flow a game must follow.
- [State Machine](state-machine.md) — the room/screen behavior your game mounts
  into.
