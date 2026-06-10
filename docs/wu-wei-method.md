# Wu Wei Method

This document adapts Ozymandias2's Wu Wei / downhill-flow doctrine for
SogoTable. Ozy remains reference material only; SogoTable should own its own
version of the method.

## Core Idea

Wu Wei programming does not mean passive programming.

For SogoTable, it means:

> Shape the app so correct play flows naturally through the right path.

The system should not need scattered special cases, hidden fallback state, or a
giant function remembering every possible screen and room situation. It should
have clear channels:

```text
player intent -> browser state machine -> Worker API -> shared room state -> game rules -> room snapshot -> browser rendering
```

When the path is shaped well, each layer does its own job and passes clean
state to the next layer.

The game-space language should stay equally clear:

```text
Table -> Board -> Zone -> Cell
```

The hosted room is the multiplayer container. The table is the full game-state
experience inside it. The board is the visible play surface, zones are major
areas on the board, and cells are the smallest playable squares.

## Why It Matters For SogoTable

SogoTable is meant to feel easy at a family table:

- open a phone browser
- choose who you are
- choose a game
- create, join, invite, or re-enter the room
- play without setup drama

That experience breaks when the architecture fights itself. If the browser
creates local fallback players, phones split into separate realities. If the UI
guesses room ownership instead of asking the hosted brain, stale rooms appear
alive. If game rules leak into rendering code, future games become painful to
add.

Wu Wei keeps the app honest by making the natural route also the correct route.

## SogoTable Flow

The current runtime riverbed is:

```text
Browser UI -> Cloudflare Worker API -> D1 state row -> Worker game rules -> JSON state -> Browser UI
```

The product state-machine riverbed is:

```text
Intro -> Player & Game Select -> Game Selected -> Game Screen
```

The room hosts the table. The game screen is the room's playable table view. Do
not add a separate room-entry screen unless the product model is deliberately
changed.

Future games may use different timing modes, but they should still flow through
the same riverbed:

```text
player intent -> timing mode -> room authority -> game rules -> room snapshot -> browser rendering
```

For live-round games, the timing mode is not fixed turn order. It is a
turnless round system: every active player may act once per round, actions
resolve through the server as they arrive, and the round advances when all
active players have acted.

## Layer Responsibilities

### Browser UI

The browser should:

- render screens and modals
- hold the device/home selected player id
- handle local hot-seat actor switching without overwriting device identity
- poll the hosted brain
- show visible API failures
- disable actions that cannot safely continue

The browser should not:

- create local fallback players or rooms
- silently invent shared state when the Worker is unavailable
- validate game outcomes as the final authority
- hide stale hosted state behind optimistic UI guesses

### Worker API

The Worker should:

- own the shared multiplayer truth
- validate player, room, invite, reset, exit, and move requests
- run game rules for hosted play
- save state with optimistic locking
- return clear room snapshots to the browser

The Worker should not:

- become a pile of unrelated game and UI concerns
- treat read-only polling as a write
- let stale writes overwrite newer game state
- depend on a browser's local assumptions to preserve invariants

### Game Rules

Game rules should:

- be testable without DOM rendering
- accept clear inputs
- return clear state changes or rejection reasons
- stay separated by game where practical
- make future game modules easier to add
- declare their timing model where it affects move authority

Game rules should not:

- reach into browser storage
- decide screen navigation
- publish UI text as their main output
- share hidden mutable state across unrelated games
- smuggle a custom lobby architecture into a timing-mode decision

### Documentation

Docs should:

- record durable product decisions
- explain current screen and room flow
- capture user-approved preferences
- keep future Codex sessions from rediscovering the same rules

Docs should not:

- replace tests for game rules
- preserve dead design ideas as if they are still active
- make Ozymandias2 a runtime dependency

## Practical Rules

- Design the flow before adding control logic.
- Prefer one clear owner for each responsibility.
- Let room state drive screen state.
- Let game definitions drive game availability.
- Let game timing metadata drive turn/round authority.
- Let table, board, zone, and cell names describe game space consistently.
- Let the Worker be the multiplayer authority.
- Let browser state stay local and explicit.
- Make failure visible instead of pretending play can continue.
- Add future games through clear game modules and definitions.
- Treat `liveRound` as rounds without fixed turns, not as unlimited realtime action.
- Keep the public Cloudflare path as the real play path.
- Prefer event-driven room snapshots over aggressive interval polling once a room has an active live channel.
- Use small, testable improvements before larger architecture changes.

## Safe Failure

Wu Wei includes knowing when not to force an outcome.

For SogoTable:

- no selected player means game buttons stay disabled
- Worker unavailable means multiplayer actions fail visibly
- stale room data means fetch fresh room data before joining or re-entering
- invalid move means reject it at the hosted brain
- unavailable game means show it as unavailable instead of pretending it is playable
- conflicting player colors should be adjusted for the room seat, not by mutating the persistent roster preference

Silence or refusal is sometimes the correct action. A false playable state is
worse than an honest blocked state.

## Future Game Rule

When adding a game, the Wu Wei question is:

> What is the smallest clear channel that lets this game flow from selection to room to rules to render?

A new game should usually add:

- a game definition
- timing metadata such as `turnBased`, `liveRound`, or `liveRoundRegroup`
- a game-specific rule owner
- tests for the rule owner
- room/state handling that reuses the existing Worker path
- rendering that consumes the returned game snapshot
- documentation for the new game behavior

It should not add a custom room flow, custom identity system, or hidden local
backend unless the product model explicitly changes.

If a new game uses live rounds, the key question is:

> Who has not acted in this round yet?

Not:

> Whose turn is next?

That distinction is the whole point.

## Anti-Patterns

Avoid:

- browser-only fallbacks that split public players into separate realities
- game rules buried inside click handlers
- UI screens that guess room truth instead of fetching it
- one giant app brain that owns players, rendering, rules, transport, and docs
- repeated defensive patches in every caller instead of one upstream boundary
- adding WebSockets, auth, frameworks, or new storage because they sound grown-up
- showing future games as ready before they are actually playable
- implementing live rounds with `currentPlayerId` and `nextPlayer()`
- implementing live rounds as unlimited realtime movement
- using `board`, `sector`, `region`, and `area` interchangeably for the same game-space level

## Review Checklist

Before non-trivial SogoTable changes, ask:

- What layer owns this responsibility?
- What data enters that layer?
- What data leaves that layer?
- Does room state drive the UI state?
- Does the Worker remain the shared authority?
- Does the timing mode have one clear authority boundary?
- Can the game rule change be tested without the browser?
- Does this preserve one-phone hot-seat play and multi-phone public play?
- Does the failure mode tell the user the truth?
- Did docs capture the durable decision?

If the answer is muddy, shape the riverbed before pushing more water through it.
