# 10,000 — Round Status Audit (for CODEX)

**Reviewer:** Claude (filling in) · **Date:** 2026-06-20
**Question:** the standings "status" column doesn't update during a round (appears
stuck on ⏳, while the Score column *does* update).

## Spec being audited

| Icon | Meaning |
|------|---------|
| ⏳ | in play (rolling/active) |
| ✅ | banked |
| ❌ | farkled, **un**-acknowledged |
| ❌✅ | farkled, acknowledged |

Round advances only when **every** seat holds a ✅ (banked, or farkled-and-acked).
Status must update several times per round.

## Verdict: the code is correct — the live **Worker is stale**

The current working tree (tip `1fd0b73`) already implements the spec. The reason it
looks frozen in production is a **deploy mismatch**, not a code bug.

### The code already does the right thing

- `standingStatusIcon` (`render.js:231-248`) maps states exactly to the spec, incl.
  ⏳ + inline live `turn_score` for an active seat, and ❌✅ for `farkled_acked`.
- Header is "Status" (`render.js:202`).
- Finish-state machine centralized in `resolveTenThousandFarkle(seat, acknowledged,
  countFarkle)` (`workers/sogotable-api.js:1803`); set on every transition:
  - farkle roll → `farkled_pending_ack` (`finishTenThousandRoll:1708`)
  - ack → `farkled_acked` (`acknowledgeTenThousandFarkle:1717`)
  - bank → `banked` (`bankTenThousandScore:1744`)
  - new round → `active` (`startTenThousandRound:1780`)
- Bots end a farkle as `farkled_acked` / `resolved=true` (`1819`, `1828`) — no stuck ❌.
- Barrier requires all seats `resolved` to advance (`maybeAdvanceTenThousandRound:1757`);
  banked and farkled-acked both set `resolved=true`, enforcing "all hold a ✅". Advance
  is deferred via `round_pending_advance` until the next roll.
- Re-render is sound: remote/bot moves push `room_snapshot` → `setRoom` on every client
  (`app.js:3188`); `roomRenderKey` includes per-seat `finish_state`/`score`/`turn_score`
  (`app.js:3428-3439`), so it is not deduped; `renderTenThousandPlay` rebuilds the whole
  table each render (`render.js:74`).

### Root cause: Worker not deployed

Cloudflare **Pages auto-deploys the frontend from `main`**, so the new `render.js` (which
reads `finish_state`) is live. The **Worker does not auto-deploy** — it ships only via
`npm run deploy:brain`. The last Worker deploy was at merge `10e7ce1`, which predates the
entire `finish_state` / `ack_farkle` / `round_pending_advance` flow.

So the live (old) Worker emits seats **without `finish_state`** → the new status icon has
nothing to switch on → every seat shows the fallthrough ⏳.

**Confirming symptom:** "the score updates, but not the emojis." Exactly what new-frontend
+ old-Worker produces — `seat.score` is still emitted (Score column updates, table is
re-rendering) but `finish_state` is not (status frozen). A render/transport bug would have
frozen the score too.

**30-second confirm (read-only):** create a 10,000 room on the live site →
`await fetch('/api/room?code=XXXX').then(r=>r.json())` → inspect
`room.game.players[0]`. Missing `finish_state` ⇒ Worker is stale.

## What needs to be done

1. **Deploy the Worker** — `npm run deploy:brain`. This is the fix; the frontend already
   expects `finish_state`.
2. Verify the status column cycles ⏳ → ⏳+turn → ✅/❌/❌✅ and that the round advances
   only when all seats hold a ✅.

### Separate robustness gap (worth fixing regardless of deploy)

The only thing that sends `ack_farkle` is the popup (`app.js:1800`). The tray
(`render.js:114-119`) has **no acknowledge control**, and the Worker blocks every other
action while `phase==="farkled"` (`workers/sogotable-api.js:1649`). If the popup is ever
missed, the seat soft-locks. Add an explicit "OK — Continue" button in the tray when
`seat.phase==="farkled"` (calls `makeMove({type:"ack_farkle"})`), and drive the popup
from seat state on every render rather than from a one-shot move-diff.

### Suggested test to add

Worker test asserting `finish_state` transitions (active→banked;
active→farkled_pending_ack→farkled_acked; bot→farkled_acked) and that
`maybeAdvanceTenThousandRound` only advances when all seats are `resolved`.

— Claude (for CODEX 🎲❤️👾)
