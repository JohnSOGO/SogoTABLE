# Maintenance Log

Health receipts from the `code-steward` agent (whole-codebase sustainability
audits), newest first. The steward is read-only; each entry records what it found
and what was done in response.

---

## 2026-07-01 — second steward pass (receipts-audit shakedown)

- **Run:** On-demand (first exercise of the new receipts-vs-commits placement audit,
  procedure step 3), scope: whole codebase. `main` at `d848c85`, 155/155 green.
- **Verdict:** **SOUND** — no structural change since the first pass (delta was docs +
  one test); the only debt found was a paper-trail gap in the receipts log itself.
- **Placement audit (new step, first run):** 3 receipts (the full log) reconciled
  against commits — substance clean on all three; 6 light-path commits sampled — all
  placed correctly per the map.
- **Finding (actioned):** `7b8bb89` added a new owner row (`games/game-kinds.js`) with
  no receipt — the one full-path trigger the log missed; entries 2–3 also lacked their
  commit hashes. → **Fixed:** retroactive receipt appended (clearly marked), hashes
  `dd48d88`/`9ff4fbd` backfilled, and the `games/<id>/` directory-pattern reading
  (new game subtree = standing decision, no per-game receipt; new top-level owner row =
  always a receipt) codified in `placement-receipts.md`.
- **Restraint (weighed, left alone):** no receipts demanded for the RTTA game train
  (directory pattern is the standing decision; commit bodies documented placement;
  Two-Hats followed in substance); 1-line ceiling headroom on app.js/worker (the
  ratchet by design); `rtta/board.js` (700) and `mazewright/render.js` (775) cohesive
  with no pressure; the pinned worker-test-file exception (already tracked); CSS
  sitting outside the JS ownership map (deliberate); no fresh hotspot measurement
  (zero source churn in the delta).
- **Handoffs:** 1 to implementer (actioned this pass); 0 to reorganizer;
  0 to placement-advisor.

## 2026-07-01 — first steward pass (post-RTTA)

- **Run:** On-demand milestone (after shipping Roll Through the Ages — game #7, first
  live-round — and adding the steward agent itself), scope: whole codebase. `main` at
  `923c5e5`, 153/153 green.
- **Verdict:** **MINOR DRIFT** — running code sound and well-modularized; drift in
  ceiling-number prose + one client/server data-duplication seam. No god-file
  regression, no layer leak.
- **Findings (both actioned):**
  1. *Ceiling numbers hardcoded in prose had drifted from the live source*
     (`reorganizer.md` cited app 2566 / worker 1810 vs live 2498 / 1801;
     `architecture-debt.md` counts ~700 lines stale, CSS-split + RTTA not reflected).
     → **Fixed:** de-hardcoded `reorganizer.md` to read the live `CEILINGS` (copying
     the placement-advisor pattern); refreshed `architecture-debt.md` current-state
     counts, CSS-split status, and game roster.
  2. *RTTA duplicates its MONUMENTS/DEVELOPMENTS tables across client and server*
     in different shapes, with no test pinning them equal (silent-divergence risk on
     a not-yet-locked game's balance).
     → **Fixed (minimal path):** added a data-parity guard test to
     `rtta-rules.test.js` asserting the shared cost/VP fields agree across the two
     runtimes. A fuller shared-data module remains an optional follow-up (a placement
     decision).
- **Restraint (weighed, left alone):** app.js/worker parked 1 line under ceiling (the
  ratchet working as designed — RTTA landed with app.js shrinking); `board.js` (700)
  and `mazewright/render.js` (775) cohesive with no pending pressure (splitting would
  be fragmentation); dated `2566` values in placement receipts (correctly historical);
  the already-tracked worker test-file split.
- **Handoffs:** 2 to implementer (both actioned this pass); 0 to reorganizer;
  0 net to placement-advisor (Finding 2 took the guard-test path; the shared-module
  option is deferred, not owed).
