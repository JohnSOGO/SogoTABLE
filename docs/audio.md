# SogoTable Audio

This file tracks the first sound-effects implementation plan and progress.

## AREC

### Abstract

Add a small, shared sound vocabulary to the SogoTable browser UI so actions and game events feel more tactile without adding assets, libraries, or background noise.

### ReExplain

Sound belongs in the browser presentation layer. The Worker still owns multiplayer truth and game rules; the browser listens to user actions and room-state transitions, then plays short generated Web Audio effects through one central module.

### Evaluate

This fits SogoTable if it stays quiet and centralized. It would become bad architecture if every game invented its own audio system, if sounds replayed during polling refreshes, or if the app required audio files before the product needs them. Mobile autoplay rules also mean audio must unlock from a user gesture, not from page load.

### Conclude

Adopt with constraints: procedural Web Audio only, global mute toggle, no background music, no external assets, and state-diff dedupe for multiplayer/game-event sounds.

## Checklist

- [x] Read `AI/Audio in SogoTable.md` as input context.
- [x] Add a centralized Web Audio module.
- [x] Add named sounds for click, confirm, cancel, invalid move, turn change, invite, join, room create, win, and lose.
- [x] Add a persisted global sound setting.
- [x] Add persisted five-level volume control through the compact speaker button.
- [x] Add compact global audio controls on the main live screens.
- [x] Wire core UI action sounds.
- [x] Wire room and game event sounds through room-state transitions.
- [x] Dedupe invite, join, turn, tactical-event, and game-over sounds so fallback refreshes do not replay old events.
- [x] Wire Dots and Boxes to the same shared sound vocabulary.
- [x] Keep all audio browser-only; no Worker, D1, or rules-engine changes.

## Progress

### 2026-06-07

Implemented the first sound pass. Sound is enabled quietly by default, unlocks after the first user gesture, and can be muted/unmuted from the global `Audio` button. Future games should reuse `src/sogotable/static/sound.js` and should emit browser sounds from UI intent or received room snapshots, not from game-rule code.

The turn-change sound now uses a close two-note language by player mark: X keeps the original cue, and O plays the same cue one semitone higher. The global sound toggle uses speaker icons, with `🔊` for sound on and `🔇` for muted.

### 2026-06-09

The compact speaker button now cycles through five persisted volume levels, then mute. When sound is on, the button shows `🔊` plus a green bottom progress bar from one to five steps. When muted, it shows `🔇` and no volume bar. The generated Web Audio module scales every cue from the selected level instead of changing each sound effect separately, using a wide enough multiplier curve that phone speakers should make each level audibly distinct.
