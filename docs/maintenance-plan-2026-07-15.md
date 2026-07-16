# Maintenance Plan — 2026-07-15 (Steward Pass 7)

Source: `code-steward` whole-codebase audit, main @ `f951c6f`, 412/412 tests green.
This plan is the execution artifact for that audit. It supersedes nothing in
`docs/doctrine.md`; it schedules the three findings the steward ranked.

## File-size verdict (answers "drastically reduce file size?")

**NOT warranted — do not run a blanket line-cutting campaign.** Justification, on
canon grounds:

- **The extract-and-ratchet gradient is already the correct mechanism and it is
  working.** Four capped files, extract-then-lower discipline, five genuine
  concern-separations landed 2026-07-12, tests green. A "shrink everything" push
  would replace a functioning gradient (Beck: small safe steps) with a heroic
  rewrite the doctrine explicitly names as an anti-pattern.
- **The large files are cohesive-by-owner, not god-files.** `app.js` is *the browser
  shell* (one role: screens + state machine + render fan + room lifecycle); the
  worker is *the entry/dispatch/DO*. Ousterhout: a large **deep module** with a
  narrow interface is healthier than the same logic sprayed across a cloud of
  80-line files.
- **The remaining big files are COLD.** `hearts/render` (788), `ten-thousand/rules`
  (784, locked), `rtta/board` (742), `mazewright/rules` (733) are per-game cohesive
  modules with near-zero churn. Size without churn is cheap debt; forcibly bisecting
  them to hit a number is the **classitis/fragmentation** failure the doctrine warns
  against.
- **Targeted relief already exists** — Findings 1 and 2 below *are* the file-size
  relief, surgical and principled, on the two files that actually bite (the active
  hotspot and the #1 shell). That is the wu-wei move: the smallest set that
  materially improves sustainability.

## Biggest files (reference)

| File | Lines | Ceiling | Churn | Disposition |
|---|---|---|---|---|
| `src/sogotable/static/app.js` | 2455 | 2456 | #1 (145) | Finding 2 reclaims headroom |
| `workers/tests/sogotable-api.test.js` | 2262 | 2263 (exc.) | 79 | On trajectory — leave |
| `src/sogotable/static/styles-games.css` | 1663 | 1700 | 8 | Watch, don't act |
| `workers/sogotable-api.js` | 1229 | 1230 | #2 (95) | Capped by design — leave |
| `src/sogotable/static/games/mystic-wood/render.js` | 756 | 800 | #4 (50) | **Finding 1** |
| `src/sogotable/static/games/battleship/client.js` | 450 | 800 | — | **Finding 2** target home |

Read live ceilings from `workers/tests/architecture.test.js`; ratchet after each
extraction. Do not trust the numbers above as gospel — they rot.

## Tasks (ordered by ROI; do in order)

### Task 1 — Open the Mystic-Wood board-input seam (MED · reorganizer) — DONE @ 15b5a0d
- **Why:** `mystic-wood/render.js` is 756/800 and the repo's #4 hotspot; it grew 29
  lines in a 3-day delta while Informed-Consent doctrine work lands. Beck: make the
  change easy *before* the next feature, as its own commit, to avoid a Two-Hats
  violation mid-batch.
- **What:** Behavior-preserving extraction of the pointer/gesture board-input cluster
  — `wireBoard`, `onBoardMove`, `onBoardUp`, `onBoardCancel`, and gesture state —
  into a new leaf `src/sogotable/static/games/mystic-wood/board-input.js` (sibling of
  the existing `encounter.js`).
- **Agent:** `reorganizer` (refactor-only hat). No behavior change, no feature.
- **Acceptance:** new module exists; `render.js` shrinks; `node --test
  workers/tests/*.test.js` stays 412 green; ratchet the mystic-wood budget/guard.
- **Commit:** one `refactor(mystic-wood): …` commit. Nothing else bundled.

### Task 2 — Relocate the Battleship reveal subsystem out of the shell (MED · reorganizer)
- **Why:** `app.js` carries **94** `battleship` references (vs TenThousand 15,
  Quoridor 8) — 11 named functions plus **5 of the 30 top-level `let`s**. A whole
  game's presentation state machine living in the shell is a Feature Envy / layer
  leak (Fowler) and violates the ownership Golden Rule. Cold, so no fire — proactive
  debt relief that reclaims real `app.js` headroom *and* frees 5 let-slots. This is
  THE targeted file-size relief, done as SRP repair, not cap-chasing.
- **What:** Extract a `wireBattleship(ctx)` controller into the existing
  `src/sogotable/static/games/battleship/client.js` (mirrors the room-sounds /
  sound-controls extractions). Move the reveal-queue, the 5 `let`s
  (`battleshipViewMode/ResultReveal/ResultTimer/RevealQueue/ReviewMark`), the timer,
  and the eleven `*Battleship*` functions; render-fan branches inject via `ctx`.
- **Agent:** `reorganizer`. Behavior-preserving; test-pinnable. Some branches are
  woven through `renderGame`/`setRoom` — needs a clean `ctx` surface.
- **Acceptance:** `app.js` battleship refs drop toward zero; top-level `let` count
  falls (guard cap 30 — ratchet it down); 412 green; ratchet `app.js` ceiling down
  by the reclaimed lines.
- **Commit:** one `refactor(battleship): …` commit.
- **Placement note:** target owner (`games/battleship/client.js`) already exists in
  `docs/module-ownership.md` — no new owner row. If the `reorganizer` disagrees on
  the seam, it decides; do not overrule mid-task.

### Task 3 — Backfill two retroactive REORG receipts (LOW · implementer)
- **Why:** `e634f18` created `workers/room-view.js` and `f37ba3d` created
  `controllers/sound-controls.js` — both added top-level owner rows to
  `module-ownership.md` with **no** receipt in `placement-receipts.md`. Codified rule
  (2nd pass): new top-level owner row = always a receipt. Doc-only audit-trail
  repair.
- **What:** Append two clearly-marked *retroactive* `REORG RECEIPT` entries to
  `docs/placement-receipts.md` for those two extractions.
- **Agent:** implementer (you). No subagent needed.
- **Acceptance:** two receipts present, marked retroactive, referencing the commits.

### Task 4 — Record the pass (doc-only)
- Append a Pass-7 entry to `docs/maintenance-log.md` summarizing this audit, the
  file-size verdict, and Tasks 1–3 with their landing commits.

## Guardrails (apply to every task)

- **Two Hats (Fowler):** structural change and behavior change never share a commit.
  Each reorg is its own commit; the feature (if any) would be a separate one.
- **Tests stay green:** `node --test workers/tests/*.test.js` (412) before and after
  every commit. If a test must change to characterize behavior, that is Feathers
  characterization-test work — call it out.
- **Ratchet, don't bump:** after an extraction, LOWER the relevant ceiling/guard in
  `architecture.test.js` to lock the win. Never raise a cap to fit.
- **Branch discipline:** topic branch per task
  (`refactor/mystic-wood-board-input`, `refactor/battleship-shell-extract`,
  `docs/backfill-reorg-receipts`); merge to `main` when the task is complete and
  green. Per repo convention, push to `main` and report the revision.
- **No file-size heroics:** touch only the named files. Do not opportunistically
  split cold cohesive modules — that is the discouraged campaign.

## Definition of done

All four tasks landed on `main`, 412 tests green, ceilings ratcheted for Tasks 1–2,
receipts + maintenance-log updated. At that point the loop stops.
