# Observability & Debug (AREC decision — 2026-07-10)

Decision record for game observability (audit log, capture) and a future scripted‑RNG
debug/replay mode. Raised because The Mystic Wood is the most mechanically complex game
yet and bugs are reported as *symptoms in play* that the fix agent then has to reconstruct
blind. Reviewed via AREC; **Adopt with constraints**, sequenced into four slices.

## The spine

One insight ties it together: **the game already funnels all randomness through a single
swappable seam** (`setMysticWoodRandom` in `engine.js`; the test suite drives scripted
outcomes through it). So *capture*, *replay*, and *scripted‑dice debug* are the same lever —
control the RNG source. Rules stay untouched; only the source of randomness varies.

Two randomness scopes exist: **dice** and **structural draws** (deck shuffle, tile openings,
knight assignment) — both via `rng()`. Faithful replay therefore needs the **seed** driving
the whole stream, not just fed dice. Clean layering: a seeded PRNG (mulberry32) for
reproducibility, plus an optional **override queue** that supplies the next `d6` when
hand‑scripting.

## Constraints (hold across all slices)

- **Scripted/fed dice must never reach a live public multiplayer room** — it's a cheating &
  security hole (server authority means the client can't be trusted to choose dice). The safe
  home is the **pure offline engine** (a local replay/scripting harness) or a SOGO‑admin/local
  surface — never a normal public game.
- **Bound every persisted artifact.** The event log is capped; the bug‑report snapshot is
  capped (~32 KB) so a long game can't bloat a D1 row. The live projection windows what it
  sends.
- **Mobile‑first.** Debug is a dev surface; it must not clutter the phone player UI or lobby.
- **Rules untouched** — vary only the RNG *source*.

## Scope note (what each slice actually catches)

Recent bugs (Bishop prayer, Tower escape, Mystic Horn) were **state‑machine / turn‑flow**
bugs — fed dice would not have caught any of them; the **event log / replay** would. So log +
replay is the priority; scripted‑dice helps a narrower class (probability/outcome bugs).

## Slices

### Slice 1 — In‑game log foundation ✅ (this change)
Delivers two bug reports that *are* the audit‑log surface:
- **mrfoq90c‑g6hwtr** — chronicle shows the entire (bounded) history + the turn count near the top.
- **mrfooic8‑odc1x6** — a player reads as the human's name, with the knight's quest in parens
  (`Sogo (Roland's quest)`) on the identity surfaces; log lines attribute the acting player by
  their human name (`seat.name`, which is the knight name for bots/tests — so all tests stay green).
- Log retention raised (`LOG_CAP` 80 → 300) so there's enough history for adequate debugging,
  while the projection stays a reasonable size for iPhone.

### Slice 2 — Tier 1 capture ✅ (this change)
Attach a **bounded game snapshot** (the current projection) to a bug report at submit time, so
the fix agent sees the actual board/seat/pending state + recent chronicle instead of reasoning
blind. Stored on the report (`game_state`, capped), surfaced to the fix agent, ignorable by the
human UI.

### Slice 3 — Tier 2 capture (planned)
Seed each room's game via mulberry32 (store the seed) and record the ordered move list; include
a compact **replay token** on the report. Prerequisite: production RNG is currently `Math.random`
(unseeded) — this is what makes a game deterministically replayable.

### Slice 4 — Replay + scripted‑dice, LOCAL only (planned)
A Node/local harness over the pure engine: load a replay token → deterministic re‑run → step/
inspect state, with an optional override queue to hand‑feed the next die. **Local/admin only —
never a public room.**

## Status

- [x] Slice 1 — full chronicle + turn count + human attribution
- [x] Slice 2 — snapshot on bug report
- [ ] Slice 3 — seed + move capture (replay token)
- [ ] Slice 4 — local replay/scripted‑dice harness

## Fix agents (bug manager)

The bug manager UI (`npm run bugreports:ui <passcode>`, served by
`scripts/serve-bug-manager.mjs`) launches Claude Code agents against reports. Two modes:

- **🤖 Address (one report)** — `/agent/fix`, `startFix()`. An agent fixes a single report in an
  isolated worktree branch `fix/bug-<id>`. Boxed: it does not push/deploy. With `BUG_AGENT_AUTOSHIP`
  on (default), a green test suite auto‑ships the branch to `main` (and `deploy:brain` if `workers/`
  changed); a red suite parks it.
- **🏠 Fix room (a whole playtest room)** — `/agent/room-fix`, `startRoomFix()`. One agent takes
  **every open report from a room** and works them as a set, using the batch methodology in
  `buildRoomPrompt()` (review together → group duplicates → triage fix / clarify / working‑as‑intended
  → rules are authoritative, don't invent them → smallest correct change + tests → one commit). It is
  boxed exactly like the single agent (no push/deploy/clear); the same auto‑ship test‑gate lands it on
  `main`. **Only after a green ship** does the harness clear that room's reports (delete — the reporter
  can always re‑file). A red suite = no ship, no clear. This encodes the hand‑run
  HPM2/GY3B/UHKO/1WSQ/67QG/06CK cycle so a room code is all the input needed.
