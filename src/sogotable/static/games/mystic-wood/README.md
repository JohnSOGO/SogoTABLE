# The Mystic Wood

An N-player, shared-table, turn-based **Board Game**: knights explore an ever-shifting
7×9 wood, reveal tiles, fight or greet its denizens, gather Things and companions,
complete a personal quest, and leave by the Enchanted Gate (or seize the Castle as King).

- **Category:** `board` · **Lobby:** `hostStart` · **Seats:** min 3, no max, bots fill.
- **Hidden info:** none (all tiles reveal to everyone) → no per-viewer projection.
- **Prototype/lab:** `AI/Mystic_Wood/` (the standalone this was promoted from; rules
  data in `COMPONENT_DATA.md` + `mystic-wood-rules-complete.md`).

See **`PLAN.md`** for the Intake Survey, the placement receipt, intended deviations,
and the Verification-Gate checklist. Build follows the **Mazewright** precedent (the
existing custom-display host-start board game) and the **RTTA** precedent (shared-table
turn-based N-player). This module is not yet wired into the registry.
