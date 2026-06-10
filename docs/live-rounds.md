# Live Rounds

This document captures the SogoTable timing-mode ideology from the incoming `AI/live_round Variants.md` and `AI/live_Round rounds_without_turns.md` notes.

## Core Idea

SogoTable should support digital board games with rounds but no fixed turns.

The parent concept is:

```text
Turnless Round System
```

The simplest user-facing explanation is:

```text
Players act once per round in any order. Actions resolve immediately. The next round begins when all active players have acted.
```

This is not the same as classic turn order:

```text
Player 1 acts -> Player 2 acts -> Player 3 acts
```

It is also not uncontrolled realtime play. The key rule is:

```text
One action per active player per round.
```

## Why It Fits SogoTable

SogoTable is digital and multi-device. Every player can hold a phone, see the same shared board, and submit intent without waiting for a physical token or a fixed seat order.

That creates a useful identity for future SogoTable games:

- Faster than classic board games.
- More structured than full realtime chaos.
- Better for 3-4 player restaurant-table play.
- Distinct from simply cloning physical board games.
- Friendly to short rounds, immediate feedback, and funny table moments.

## Timing Modes

Future game definitions should be able to describe timing explicitly. Current ready games are still turn-based, but future games may use one of these timing modes.

### `turnBased`

Classic fixed turn order. One active player is allowed to act, then turn ownership advances.

Current games use this model:

- Super Tic Tac Toe
- Super Tic Tactical Toe

### `simultaneousSubmit`

Players submit actions privately or publicly during a planning window. Actions resolve together when the round closes.

Good for hidden planning, bluffing, fairness, and tactical games where speed should not matter.

### `liveRound`

Every active player is unlocked at the start of the round. Actions resolve immediately in the server's received order. After a player acts, that player is locked until the next round.

Core state:

```ts
type LiveRoundState = {
  roundNumber: number;
  phase: "open" | "resolving" | "complete";
  activePlayerIds: string[];
  actedPlayerIds: string[];
};
```

Required invariant:

```text
If a player has already acted this round, reject additional actions.
```

### `liveRoundRegroup`

Actions resolve immediately during a live phase. After all active players have acted, the game enters a regroup phase for rewards, power-ups, spending, drafting, healing, or next-round preparation.

This is the preferred default direction for future SogoTable games that want more than two-player turn order.

### `timedLiveRound`

Players may act during a short timer. This can create party-game energy, but should be used carefully because speed, device latency, and hand speed can dominate strategy.

### `actionBudgetRound`

Each active player gets a small action budget per round and may spend it in any order.

Example:

```text
Move = 1 action
Grab coin = 1 action
Use power-up = 1 action
Attack = 2 actions
```

This supports bursty play without becoming unlimited realtime spam.

### `hybridRound`

Some effects resolve immediately, some queue until the end of the round, and some resolve during regroup.

Use this only when the game rules clearly need it; otherwise prefer a simpler mode.

## Resolution Rules

Server authority is non-negotiable.

For `liveRound`, the server must:

- Confirm the player belongs to the room.
- Confirm the game is in a live-round timing mode.
- Confirm the round phase is open.
- Confirm the player is active.
- Confirm the player has not already acted this round.
- Validate the action against current official room state.
- Resolve the action immediately.
- Mark the player as acted.
- Broadcast the updated room snapshot.
- Advance the round when all active players have acted.

Conflicts resolve in official server-processing order.

Do not let clients decide who got there first.

## UI Language

Avoid telling a player:

```text
Wait for Player 2's turn.
```

Prefer:

```text
You are ready to act.
```

After the player acts:

```text
Action locked. Waiting for other players.
```

When the next round opens:

```text
New round. You are ready.
```

The UI should show round status compactly:

```text
Red: Ready
Blue: Acted
Green: Ready
Yellow: Acted
```

## Architecture Guidance

Do not model timing modes as separate custom lobby architectures.

Bad shape:

```text
if gameName === "LiveRoundSomething"
if gameName === "QueuedSomething"
```

Preferred shape:

```ts
timing: {
  mode: "turnBased" | "simultaneousSubmit" | "liveRound" | "liveRoundRegroup" | "timedLiveRound" | "actionBudgetRound" | "hybridRound";
  moveResolution: "instant" | "queued";
  conflictResolution: "server_order" | "end_of_round" | "priority";
  rewardTiming: "instant" | "regroup";
  hasRegroupPhase: boolean;
}
```

The exact schema can stay simple until the first live-round game is built. The important ideology is:

```text
Timing is game metadata and room state, not a separate app architecture.
```

## First Candidate

The strongest first candidate is a future Sorry-inspired game, working title:

```text
Sorry, Not Sorry
```

It would use `liveRound` or `liveRoundRegroup`:

- Everyone can act once per round.
- Faster players can grab bonuses or bump opponents first.
- Slower players can react to the changed board.
- The next round starts when all active players have acted.

## Current Decision

Adopt with constraints:

- Keep current Super Tic Tac Toe games `turnBased`.
- Treat `liveRound` as a major future SogoTable identity.
- Prefer `liveRoundRegroup` for future games with power-ups or rewards.
- Do not implement full realtime unlimited movement under the live-round label.
- Do not add a custom lobby per timing mode.
- Add timing metadata to future game definitions when the first non-turn-based game is implemented.
