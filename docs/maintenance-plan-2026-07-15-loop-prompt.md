# Loop prompt — Steward Pass 7 execution

Paste this whole block after `/loop ` at the Claude Code prompt (self-paced, no
interval — it works one task per iteration and stops itself when done):

---

/loop Work through `docs/maintenance-plan-2026-07-15.md` one task at a time, in order (Task 1 → 2 → 3 → 4). Each iteration: pick the FIRST task not yet marked done, complete only that task, then stop for the next iteration.

Rules that override speed:
- Follow the plan's Guardrails exactly: Two Hats (structural and behavior changes never share a commit), 412 tests green before and after every commit (`node --test workers/tests/*.test.js`), ratchet ceilings down after Tasks 1–2 (never bump), topic branch per task, push to `main` when the task is green.
- Task 1 and Task 2 are structural refactors — delegate them to the `reorganizer` subagent (refactor-only hat, behavior-preserving). Do not hand-refactor them yourself; you land nothing but the reorganizer's behavior-preserving result plus the ceiling ratchet + receipt.
- If the `reorganizer` reports the seam is different from the plan's suggestion, obey the reorganizer — do not overrule placement mid-task.
- Task 3 and Task 4 are doc-only; do them yourself.
- After each task lands on `main`, edit `docs/maintenance-plan-2026-07-15.md` to check off that task (append " — DONE @ <commit>" to its heading) so the next iteration knows where to resume.
- Do NOT touch any file outside the one named in the current task. No opportunistic splitting of cold cohesive modules — that is the discouraged campaign the plan forbids.

Stop the loop (ScheduleWakeup stop) when all four tasks show DONE and `node --test workers/tests/*.test.js` is 412 green on `main`. Report the four landing commits.

---

## Notes

- Self-paced (no interval) is intentional: these are finite tasks, not a poll. The
  loop advances when each subagent/commit completes, and halts at the definition of
  done in the plan.
- If a `reorganizer` pass comes back "target has room — no refactoring needed" or
  finds the seam unsafe, record that in the plan and move to the next task rather than
  forcing an extraction.
