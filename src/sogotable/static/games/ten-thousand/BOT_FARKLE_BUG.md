# 10,000 — Bot double-counts farkles (for CODEX)

**Reviewer:** Claude (filling in) · **Date:** 2026-06-20 · Read-only review (no code changed)

## Symptom

New game; **before the human rolled once, bot "Corner Cade" already showed TWO
farkles.** Hypothesis was "AI players get extra rounds." Actual cause: bots do
**not** get extra rounds — a bot's farkle counter is **incremented twice per
farkle**.

## Root cause — `playTenThousandBotRound` resolves a farkle twice

File: `workers/sogotable-api.js`, `playTenThousandBotRound` (~line 1813).

On a busted bot roll the farkle is counted twice:

1. `rollTenThousandDice` / `rerollTenThousandDice` → `finishTenThousandRoll`
   (line 1704). On a bust it calls `resolveTenThousandFarkle(seat, false)`.
   `countFarkle` defaults to `true` → **`seat.farkles += 1`** (first count).
   Leaves `phase="farkled"`, `finish_state="farkled_pending_ack"`, `resolved=false`.
2. Back in the loop, `if (seat.resolved) return; // farkled` (line 1817) does
   **not** fire — a fresh farkle leaves `resolved === false`. Flow falls through
   to `bestTenThousandKeep` → no scoring dice → `if (!keep.ids.length) {
   resolveTenThousandFarkle(seat, true); return; }` (line 1819). `countFarkle`
   defaults to `true` again → **`seat.farkles += 1`** (second count).

Net: **every bot farkle adds 2.** Bots resolve round 1 at game start
(`initTenThousandSeats` → `resolveTenThousandBots`), so a bot that busts its
opening round shows `2` before the human acts — exactly the report.

The **human path is correct (+1)**: `finishTenThousandRoll` counts once, then the
human's `acknowledgeTenThousandFarkle` (line 1715) calls
`resolveTenThousandFarkle(seat, true, false)` — `countFarkle = false`, so the ack
does not recount. Only the bot path double-counts.

### Secondary issues (same function)

- `if (seat.resolved) return; // farkled` (line 1817) is **dead/misleading** —
  after a farkle `resolved` is `false`, so it never returns there; the comment
  contradicts the guard.
- The loop-end safety call `resolveTenThousandFarkle(seat, true)` (line 1828)
  would also double-count if reached post-farkle.

## Fix

Detect the farkle by **phase** right after the roll and acknowledge it **without
recounting**:

```js
if (seat.phase === "ready") rollTenThousandDice(seat);
else if (seat.phase === "selected") rerollTenThousandDice(seat);
if (seat.phase === "farkled") {          // already counted by finishTenThousandRoll
  resolveTenThousandFarkle(seat, true, false);   // ack, do NOT recount
  return;
}
```

This replaces the misleading `if (seat.resolved) return;`. The `!keep.ids.length`
branch (1819) is then effectively unreachable for farkles; for safety, also pass
`countFarkle = false` there and in the loop-end safety call (1828) so no path can
double-count.

## Verification

Add a worker test (`workers/tests/sogotable-api.test.js`) using `withMockRandom`
to force a bot's opening roll to bust (no 1s/5s/triples):

- Seat 1 human + 1 bot, start the game.
- Assert the bot ends round 1 with `farkles === 1` (not 2),
  `finish_state === "farkled_acked"`, `resolved === true`.
- Regression: human farkle + `ack_farkle` still yields `farkles === 1`.

`node --test workers/tests/*.test.js`

Fix is **backend-only** (`workers/sogotable-api.js`) → needs `npm run deploy:brain`
to go live (Pages does not deploy the Worker).

— Claude (for CODEX 🎲❤️👾)
