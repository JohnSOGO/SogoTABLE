// Tracklayers — sound cues as tone data (synthesised through sound.js, which
// owns mute + volume). Each cue checks ASSETS.sounds for a file override first.
//
// Cues are driven by diffing the server's event log (game.events[].seq)
// against the last seq this client has heard, so everyone hears the round
// resolve. The first snapshot of a game only primes the cursor (no burst of old
// sounds on load/reconnect).
import { playSoundFile, playTones } from "../../sound.js";
import { ASSETS } from "./assets.js";

const CUES = {
  draw: () => [
    { frequency: 900, slideTo: 1300, duration: 0.05, type: "triangle", volume: 0.035 },
    { frequency: 1100, slideTo: 1500, duration: 0.05, type: "triangle", volume: 0.03, delay: 0.08 },
  ],
  claim: () => [
    { frequency: 196, duration: 0.08, type: "square", volume: 0.025 },
    { frequency: 247, duration: 0.08, type: "square", volume: 0.025, delay: 0.1 },
    { frequency: 392, duration: 0.22, type: "triangle", volume: 0.05, delay: 0.2 },
    { frequency: 494, duration: 0.3, type: "sine", volume: 0.04, delay: 0.3 },
  ],
  claimOther: () => [
    { frequency: 180, slideTo: 140, duration: 0.09, type: "triangle", volume: 0.035 },
    { frequency: 180, slideTo: 140, duration: 0.09, type: "triangle", volume: 0.03, delay: 0.13 },
  ],
  tickets: () => [
    { frequency: 660, duration: 0.06, type: "sine", volume: 0.04 },
    { frequency: 880, duration: 0.12, type: "sine", volume: 0.04, delay: 0.07 },
  ],
  reject: () => [
    { frequency: 190, slideTo: 140, duration: 0.14, type: "sawtooth", volume: 0.018 },
    { frequency: 170, slideTo: 120, duration: 0.16, type: "sawtooth", volume: 0.016, delay: 0.16 },
  ],
  // A two-tone train horn.
  finalRound: () => [
    { frequency: 370, duration: 0.55, type: "sawtooth", volume: 0.02 },
    { frequency: 466, duration: 0.55, type: "sawtooth", volume: 0.018 },
    { frequency: 370, duration: 0.7, type: "sawtooth", volume: 0.02, delay: 0.7 },
    { frequency: 466, duration: 0.7, type: "sawtooth", volume: 0.018, delay: 0.7 },
  ],
  win: () => [
    { frequency: 523.25, duration: 0.14, type: "triangle", volume: 0.05 },
    { frequency: 659.25, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.14 },
    { frequency: 783.99, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.28 },
    { frequency: 1046.5, duration: 0.5, type: "sine", volume: 0.06, delay: 0.42 },
    { frequency: 523.25, duration: 0.5, type: "triangle", volume: 0.03, delay: 0.42 },
  ],
};

export function playCue(name) {
  const url = ASSETS.sounds && ASSETS.sounds[name];
  const volume = name === "claimOther" ? 0.35 : 0.6;
  if (url && playSoundFile(url, volume)) return;
  const build = CUES[name];
  if (build) playTones(build());
}

// Map one server event to a cue name (null = silent).
function cueFor(e, myMark) {
  const kind = String(e.kind || e.type || "");
  if (kind.includes("final")) return "finalRound";
  if (kind.includes("claim")) return e.mark === myMark ? "claim" : "claimOther";
  if (kind.includes("ticket") && e.mark === myMark) return "tickets";
  if (kind.includes("draw") && e.mark === myMark) return "draw";
  return null;
}

// ---- event diffing (module state keyed by room+epoch) ----
let cursorKey = "";
let lastSeq = -1;

// Returns the events newer than the cursor (empty on the first call for a
// key, which only primes it) and plays their cues (a few at most, spaced).
export function consumeEvents(key, events, myMark) {
  const list = Array.isArray(events) ? events : [];
  const maxSeq = list.reduce((m, e) => Math.max(m, Number(e.seq) || 0), 0);
  if (cursorKey !== key) {
    cursorKey = key;
    lastSeq = maxSeq;
    return [];
  }
  const fresh = list.filter((e) => (Number(e.seq) || 0) > lastSeq).sort((a, b) => a.seq - b.seq);
  if (maxSeq > lastSeq) lastSeq = maxSeq;
  const cues = [];
  fresh.forEach((e) => {
    const cue = cueFor(e, myMark);
    if (cue && !cues.includes(cue)) cues.push(cue);
  });
  cues.slice(0, 3).forEach((cue, i) => {
    if (i === 0) playCue(cue); else setTimeout(() => playCue(cue), i * 320);
  });
  return fresh;
}
