// Realmwright — sound cues as tone data (synthesised through sound.js, which
// owns mute + volume). Each cue checks ASSETS.sounds for a file override first.
//
// Cues are driven by diffing the server's event log (game.events[].seq)
// against the last seq this client has heard, so every player hears everyone
// else's completed cities. The first snapshot of a game only primes the cursor
// (no burst of old sounds on load/reconnect).
import { playSoundFile, playTones } from "../../sound.js";
import { ASSETS } from "./assets.js";

const C_MAJOR = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

const CUES = {
  place: () => [
    { frequency: 150, slideTo: 70, duration: 0.14, type: "sine", volume: 0.09 },
    { frequency: 320, slideTo: 180, duration: 0.05, type: "triangle", volume: 0.03 },
  ],
  placeOther: () => [
    { frequency: 140, slideTo: 80, duration: 0.1, type: "sine", volume: 0.04 },
  ],
  meeple: () => [
    { frequency: 1250, duration: 0.028, type: "triangle", volume: 0.05 },
    { frequency: 880, duration: 0.03, type: "triangle", volume: 0.045, delay: 0.06 },
  ],
  complete: (points = 4) => {
    const steps = Math.max(2, Math.min(C_MAJOR.length - 2, 2 + Math.floor(points / 3)));
    const tones = [];
    for (let i = 0; i < steps; i += 1) {
      tones.push({ frequency: C_MAJOR[i], duration: 0.11, type: "triangle", volume: 0.045, delay: i * 0.075 });
    }
    const top = C_MAJOR[Math.min(steps + 1, C_MAJOR.length - 1)];
    tones.push({ frequency: top, duration: 0.32, type: "sine", volume: 0.05, delay: steps * 0.075 });
    tones.push({ frequency: top / 2, duration: 0.32, type: "triangle", volume: 0.025, delay: steps * 0.075 });
    return tones;
  },
  reject: () => [
    { frequency: 190, slideTo: 140, duration: 0.14, type: "sawtooth", volume: 0.018 },
    { frequency: 170, slideTo: 120, duration: 0.16, type: "sawtooth", volume: 0.016, delay: 0.16 },
  ],
  round: () => [
    { frequency: 1318.51, duration: 0.5, type: "sine", volume: 0.03 },
    { frequency: 1975.53, duration: 0.42, type: "sine", volume: 0.018, delay: 0.09 },
  ],
  win: () => [
    { frequency: 523.25, duration: 0.14, type: "triangle", volume: 0.05 },
    { frequency: 659.25, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.14 },
    { frequency: 783.99, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.28 },
    { frequency: 1046.5, duration: 0.5, type: "sine", volume: 0.06, delay: 0.42 },
    { frequency: 523.25, duration: 0.5, type: "triangle", volume: 0.03, delay: 0.42 },
  ],
};

const OVERRIDE_KEY = { place: "place", placeOther: "place", meeple: "meeple", complete: "complete", reject: "reject", round: "round", win: "win" };

export function playCue(name, arg) {
  const url = ASSETS.sounds && ASSETS.sounds[OVERRIDE_KEY[name]];
  const volume = name === "placeOther" ? 0.35 : 0.6;
  if (url && playSoundFile(url, volume)) return;
  const build = CUES[name];
  if (build) playTones(build(arg));
}

// ---- event diffing (module state keyed by room+epoch) ----
let cursorKey = "";
let lastSeq = -1;

// Returns the events newer than the cursor (empty on the first call for a
// key, which only primes it). Plays their cues unless `silent`.
export function consumeEvents(key, events, myMark, { silent = false } = {}) {
  const list = Array.isArray(events) ? events : [];
  const maxSeq = list.reduce((m, e) => Math.max(m, Number(e.seq) || 0), 0);
  if (cursorKey !== key) {
    cursorKey = key;
    lastSeq = maxSeq;
    return [];
  }
  const fresh = list.filter((e) => (Number(e.seq) || 0) > lastSeq).sort((a, b) => a.seq - b.seq);
  if (maxSeq > lastSeq) lastSeq = maxSeq;
  if (silent || !fresh.length) return fresh;
  let delay = 0;
  const schedule = (fn) => { if (delay === 0) fn(); else setTimeout(fn, delay); delay += 220; };
  let placedOthers = 0;
  let scores = 0;
  fresh.forEach((e) => {
    if (e.type === "place" && e.mark !== myMark && placedOthers < 2) {
      placedOthers += 1;
      schedule(() => playCue("placeOther"));
    } else if (e.type === "score" && scores < 3) {
      scores += 1;
      const points = Number(e.points) || 0;
      schedule(() => playCue("complete", points));
    } else if (e.type === "round") {
      schedule(() => playCue("round"));
    }
  });
  return fresh;
}
