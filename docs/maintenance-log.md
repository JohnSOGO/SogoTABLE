# Maintenance Log

Health receipts from the `code-steward` agent (whole-codebase sustainability
audits), newest first. The steward is read-only; each entry records what it found
and what was done in response.

Cadence is milestone-driven (game ships, lock declared, release). As a safety net,
a `SessionStart` hook (`scripts/steward-overdue-check.mjs`, wired in
`.claude/settings.json`) reads this log at every Claude launch and suggests an
audit when the newest entry is stale (>14 days or >150 commits since).

---

## 2026-07-03 — fourth steward pass (milestone: Mazewright locked, RTTA refining, theme landed)

- **Run:** Milestone, scope: whole codebase. `main` at `512780d`, 197/197 green (verified).
- **Verdict:** **SOUND** — nothing owed. All 3 findings from the 2026-07-02 pass verified
  closed (board-fx.js extracted 729c447; score-parity test landed; pre-push gate a271506;
  SogoUI/ gone). The 15-commit rtta delta placed everything correctly and added zero
  pressure to any capped file; the board.js hotspot cooled (16 → 2 commits, 742/800).
- **Placement audit:** 0 new receipts — correctly zero (both new files under standing
  decisions: games/rtta/ pattern + exempt scripts/); 15 light-path commits sampled, all
  clean; Two-Hats prep/feature split observed in practice (729c447 vs 4fd44ee).
- **Findings:** none.
- **Handoffs:** none.
- **Restraint (weighed, left alone):** wireInvites ctx ~20 entries (cold boundary, zero
  churn — revisit only when invites takes a feature); RTTA client/server duplication
  (parity-pinned; consolidation deferred to RTTA lock — re-weigh at that milestone);
  ten-thousand KNOWN_NO_MANIFEST (tracked, test-pinned, locked game); 1-line ceiling
  headroom on app.js/worker (ratchet by design); pinned worker test-file exception;
  big-but-cold mazewright/ten-thousand files.
- **Sources read:** module-ownership.md, modularity.md, doctrine.md, placement-receipts.md,
  maintenance-log.md, architecture.test.js (live ceilings), rtta-rules.test.js; git log/
  diff/churn a90375c..HEAD; wc -l across runtime source; npm test.

## 2026-07-02 — third steward pass (RTTA refinement train)

- **Run:** Milestone (RTTA live-round refinement train landed — Leadership button,
  upkeep pause, cityBoxes), scope: whole codebase. `main` at `a90375c`, 185/185 green.
- **Verdict:** **MINOR DRIFT** — structure sound and the rtta train placed everything
  correctly; drift is forward pressure on one hotspot plus two hardening gaps.
- **Placement audit:** 0 new receipts since 2026-07-01 — correctly so: all 6 new files
  fall under owned patterns (`games/rtta/`, `workers/tests/`, `scripts/`, `.claude/`).
  Light-path train sampled — every placement correct against the map.
- **Findings (ranked, handed off):**
  1. *MED — `games/rtta/board.js` is the hotspot at 778/800* (16 commits since last
     run, highest churn in the repo by 2×; already tripped the 800 backstop once,
     commit `9fe6819`). → **reorganizer**: one S-sized prep commit extracting the pure
     motion/FX helpers (`fly*`/`animate*`/`lose*Point`, ~70–80 lines) into
     `games/rtta/board-fx.js` (sibling of the `board-art.js` precedent) before the
     next refinement wave.
  2. *MED — client `scoreBreakdown` not pinned to the server's `rttaScoreByMark`*
     (the live-standings projection puts the client number on screen next to the
     server's; neither computation is parity-tested). → **implementer**: one parity
     test in `rtta-rules.test.js` asserting `scoreBreakdown(...).total ===
     rttaScoreByMark(...)` for a representative seat.
  3. *LOW-MED — the test gate is habit, not mechanism* (a red build rode to `main`
     once, self-reported in `9fe6819`'s body). → **implementer**: a mechanical
     pre-push hook / npm gate script under `scripts/` that blocks on non-zero exit.
  4. *LOW — stray untracked `SogoUI/` at the repo root* (one file, outside the `AI/`
     intake convention). → **MojoSOGO's call**: move under `AI/` or delete if absorbed
     into `docs/adding-a-game.md`; do not commit as-is.
- **Restraint (weighed, left alone):** app.js/worker parked 1 line under ceiling
  (ratchet by design — the rtta train added zero pressure to either);
  styles-games.css 1648/1700 (rtta styling correctly in injected `games/rtta/styles.js`);
  shared client/server rtta data module (still speculative pre-lock); big-but-cold
  mazewright/ten-thousand files (size without churn is cheap); the pinned worker
  test-file exception; zero receipts for the rtta train (correct per the
  directory-pattern rule); `games/rtta/PLAN.md` as a sanctioned gate artifact;
  docs kept pace (`docs/game-rtta.md` updated in 9 of the rtta commits).

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

## 2026-07-09 — fifth steward pass (Mystic Wood shell-game + bug-manager tooling era)
- **Trigger:** on-demand, ~182 commits overdue since the 2026-07-03 pass. Verdict: **MINOR DRIFT** —
  structure sound; the ~182-commit delta placed almost everything correctly.
- **Finding 1 (HIGH, time-sensitive):** `mystic-wood/render.js` at 776/800 and the repo's #1 hotspot
  (26 commits), with the incoming Phase 2 combat UI about to breach the 800 cap.
  → **Fixed:** reorganizer extracted the portal-overlay modal family into a new `encounter.js` leaf
  (+ shared pure builders to `util.js`); render.js 776 → 557. The Phase 2 combat card then added
  zero lines to render.js. Prep commit da270ce; feature 1f2557a.
- **Finding 2 (LOW-MED):** `workers/bug-reports.js` (c67a08c) shipped a new owner row with no receipt.
  → **Fixed (doc-only):** retroactive PLACEMENT RECEIPT appended to placement-receipts.md.
- **Restraint (weighed, left alone):** bug-agent.mjs (cohesive deep module, not a god-file);
  bugreport/manage.html (847 lines but an off-graph, single-user, loopback admin tool, uncapped .html);
  the 5 bug-scripts' duplicated api/passcode boilerplate (negative ROI to consolidate);
  hearts/render.js (788/800 but cold since ship day); app.js/worker parked 1 line under ceiling.
- **Handoffs:** 1 to reorganizer (render.js seam — done), 1 to implementer (retroactive receipt — done);
  0 to placement-advisor.
