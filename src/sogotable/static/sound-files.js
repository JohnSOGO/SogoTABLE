// Global sound cues: optional recorded files.
//
// Each key names a global cue in sound.js. A URL plays that file instead of the
// synth cue; null keeps the synth. The synth always remains the fallback (muted
// device, no <audio>, or the file cannot start). UI ticks (click, confirm,
// cancel, turn, invalid move) are synth-only and deliberately absent here.
//
// Only list files that are committed in ./sounds/: a missing file fails
// asynchronously, after the synth fallback has already been skipped.
// Sources and licences for every file: docs/SOUNDS.md.
const file = (name) => new URL(`./sounds/${name}.mp3`, import.meta.url).href;

export const SOUND_FILES = {
  invite: null,
  playerJoined: null,
  roomCreated: null,
  win: null,
  lose: null,
  diceRoll: file("dice-roll"),
  scorePick: null,
  bank: file("bank"),
  farkle: null,
  cardDeal: file("card-deal"),
  cardPlay: file("card-play"),
  trickTake: file("trick-take"),
  heartsBroken: null,
  queenSpades: null,
  mysticHorn: null,
  moonShot: null,
};
