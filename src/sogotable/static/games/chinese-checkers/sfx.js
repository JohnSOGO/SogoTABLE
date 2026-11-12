// Chinese Checkers — sound cues as tone data (synthesised through sound.js,
// which owns mute + volume). Each cue checks ASSETS.sounds for a file override
// first (assets.js).
//
// Move sounds are played by the round replay in render.js, hop by hop, so they
// stay in sync with the animation. consumeEvents only diffs the server's event
// log (game.events[].seq) against the last seq this client saw: the first
// snapshot of a game primes the cursor (no burst of old sounds — or replay — on
// load/reconnect).
import { playSoundFile, playTones } from "../../sound.js";
import { ASSETS } from "./assets.js";

// Pentatonic ladder for hop chains: each hop in a chain rings a little higher.
const LADDER = [880, 987.77, 1174.66, 1318.51, 1567.98, 1760, 1975.53, 2349.32];

const CUES = {
  // Glass marble set down on wood: a short bright click over a soft knock.
  step: () => [
    { frequency: 2400, slideTo: 1500, duration: 0.025, type: "triangle", volume: 0.045 },
    { frequency: 210, slideTo: 120, duration: 0.07, type: "sine", volume: 0.05 },
  ],
  // Glassy tick for hop #i of a chain.
  hop: (i = 0) => {
    const f = LADDER[Math.min(LADDER.length - 1, Math.max(0, i))];
    return [
      { frequency: f, duration: 0.07, type: "sine", volume: 0.05 },
      { frequency: f * 2, duration: 0.04, type: "sine", volume: 0.018 },
    ];
  },
  // Landing at the end of a move: a wooden thunk.
  land: () => [
    { frequency: 170, slideTo: 85, duration: 0.12, type: "sine", volume: 0.08 },
    { frequency: 1900, slideTo: 1300, duration: 0.02, type: "triangle", volume: 0.03 },
  ],
  // A captured marble flying home.
  capture: () => [
    { frequency: 1400, slideTo: 260, duration: 0.32, type: "sawtooth", volume: 0.014 },
    { frequency: 700, slideTo: 180, duration: 0.3, type: "triangle", volume: 0.03, delay: 0.03 },
  ],
  // A bounced or cut move: a little boing.
  bounce: () => [
    { frequency: 300, slideTo: 520, duration: 0.09, type: "triangle", volume: 0.045 },
    { frequency: 520, slideTo: 240, duration: 0.16, type: "triangle", volume: 0.04, delay: 0.09 },
  ],
  // Lock-in chime.
  lock: () => [
    { frequency: 1046.5, duration: 0.12, type: "sine", volume: 0.045 },
    { frequency: 1567.98, duration: 0.22, type: "sine", volume: 0.04, delay: 0.08 },
  ],
  round: () => [
    { frequency: 1318.51, duration: 0.4, type: "sine", volume: 0.025 },
    { frequency: 1975.53, duration: 0.34, type: "sine", volume: 0.015, delay: 0.08 },
  ],
  finish: () => [
    { frequency: 783.99, duration: 0.12, type: "triangle", volume: 0.045 },
    { frequency: 1046.5, duration: 0.12, type: "triangle", volume: 0.045, delay: 0.1 },
    { frequency: 1318.51, duration: 0.3, type: "sine", volume: 0.05, delay: 0.2 },
  ],
  win: () => [
    { frequency: 523.25, duration: 0.14, type: "triangle", volume: 0.05 },
    { frequency: 659.25, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.14 },
    { frequency: 783.99, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.28 },
    { frequency: 1046.5, duration: 0.55, type: "sine", volume: 0.06, delay: 0.42 },
    { frequency: 1567.98, duration: 0.4, type: "sine", volume: 0.025, delay: 0.5 },
  ],
  // Last-seconds clock tick: a soft wood-block tap, a little higher on 1.
  tick: (secs = 3) => [
    { frequency: secs <= 1 ? 1500 : 1200, duration: 0.035, type: "triangle", volume: 0.03 },
  ],
  // "Your turn!" (turns mode).
  turn: () => [
    { frequency: 987.77, duration: 0.1, type: "sine", volume: 0.045 },
    { frequency: 1318.51, duration: 0.18, type: "sine", volume: 0.045, delay: 0.1 },
    { frequency: 1975.53, duration: 0.26, type: "sine", volume: 0.025, delay: 0.2 },
  ],
  reject: () => [
    { frequency: 190, slideTo: 140, duration: 0.14, type: "sawtooth", volume: 0.018 },
    { frequency: 170, slideTo: 120, duration: 0.16, type: "sawtooth", volume: 0.016, delay: 0.16 },
  ],
};

export function playCue(name, arg) {
  const url = ASSETS.sounds && ASSETS.sounds[name];
  if (url && playSoundFile(url, 0.6)) return;
  const build = CUES[name];
  if (build) playTones(build(arg));
}

// ---- event diffing (module state keyed by room+epoch) ----
let cursorKey = "";
let lastSeq = -1;

// Returns the events newer than the cursor, in seq order. The first call for
// a key only primes the cursor and returns [] (the client was not watching).
export function consumeEvents(key, events) {
  const list = Array.isArray(events) ? events : [];
  const maxSeq = list.reduce((m, e) => Math.max(m, Number(e.seq) || 0), 0);
  if (cursorKey !== key) {
    cursorKey = key;
    lastSeq = maxSeq;
    return [];
  }
  const fresh = list.filter((e) => (Number(e.seq) || 0) > lastSeq).sort((a, b) => a.seq - b.seq);
  if (maxSeq > lastSeq) lastSeq = maxSeq;
  return fresh;
}
