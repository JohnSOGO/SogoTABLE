// Reefkeepers — sound cues as tone data (synthesised through sound.js, which
// owns mute + volume). Each cue checks ASSETS.sounds for a file override first.
//
// Table-wide cues (a new round, the final tally, the win) are driven by
// diffing the server's event log (game.events[].seq) against the last seq this
// client heard; the first snapshot of a game only primes the cursor. Per the
// 10,000 rule (docs/audio.md) own-seat action sounds — place, pick, bumped —
// play only on the device whose seat it is: place/pick from local intent in
// render.js, bumped only for an event naming my own mark.
import { playSoundFile, playTones } from "../../sound.js";
import { ASSETS } from "./assets.js";

const CUES = {
  // a soft "plop" of a tile settling into water
  place: () => [
    { frequency: 520, slideTo: 180, duration: 0.12, type: "sine", volume: 0.08 },
    { frequency: 900, slideTo: 1400, duration: 0.06, type: "sine", volume: 0.025, delay: 0.08 },
  ],
  // a bubble blip, pitched by rank (1st highest)
  pick: (rank = 0) => [
    { frequency: [880, 740, 622][rank] || 660, slideTo: ([880, 740, 622][rank] || 660) * 1.35, duration: 0.07, type: "sine", volume: 0.05 },
  ],
  bumped: () => [
    { frequency: 392, slideTo: 330, duration: 0.14, type: "triangle", volume: 0.04 },
    { frequency: 330, slideTo: 262, duration: 0.18, type: "triangle", volume: 0.035, delay: 0.15 },
  ],
  // a gentle wave swell
  round: () => [
    { frequency: 392, duration: 0.3, type: "sine", volume: 0.03 },
    { frequency: 587.33, duration: 0.36, type: "sine", volume: 0.025, delay: 0.1 },
    { frequency: 783.99, duration: 0.42, type: "sine", volume: 0.018, delay: 0.2 },
  ],
  score: () => [523.25, 659.25, 783.99, 1046.5].map((hz, i) => ({ frequency: hz, duration: 0.12, type: "triangle", volume: 0.045, delay: i * 0.08 })),
  win: () => [
    { frequency: 523.25, duration: 0.14, type: "triangle", volume: 0.05 },
    { frequency: 659.25, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.14 },
    { frequency: 783.99, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.28 },
    { frequency: 1046.5, duration: 0.55, type: "sine", volume: 0.06, delay: 0.42 },
    { frequency: 1567.98, duration: 0.5, type: "sine", volume: 0.02, delay: 0.5 },
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

// Returns the events newer than the cursor (empty on the first call for a
// key, which only primes it) and plays their table-wide cues.
export function consumeEvents(key, events, myMark, winner) {
  const list = Array.isArray(events) ? events : [];
  const maxSeq = list.reduce((m, e) => Math.max(m, Number(e.seq) || 0), 0);
  if (cursorKey !== key) {
    cursorKey = key;
    lastSeq = maxSeq;
    return [];
  }
  const fresh = list.filter((e) => (Number(e.seq) || 0) > lastSeq).sort((a, b) => a.seq - b.seq);
  if (maxSeq > lastSeq) lastSeq = maxSeq;
  if (!fresh.length) return fresh;
  let delay = 0;
  const schedule = (fn) => { if (delay === 0) fn(); else setTimeout(fn, delay); delay += 260; };
  if (myMark && fresh.some((e) => e.type === "bumped" && e.mark === myMark)) schedule(() => playCue("bumped"));
  if (fresh.some((e) => e.type === "final")) {
    schedule(() => playCue("score"));
    if (winner && winner === myMark) { delay += 300; schedule(() => playCue("win")); }
  } else if (fresh.some((e) => e.type === "round")) {
    schedule(() => playCue("round"));
  }
  return fresh;
}
