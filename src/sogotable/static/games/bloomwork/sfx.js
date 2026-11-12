// Bloomwork — sound cues as tone data (synthesised through sound.js, which
// owns mute + volume). Each cue checks ASSETS.sounds for a file override first.
//
// Cues are driven by diffing the server's event log (game.events[].seq)
// against the last seq this client has heard. The first snapshot of a game
// only primes the cursor (no burst of old sounds on load/reconnect). Your own
// takes / misses / compost get their own cue; other gardeners' picks share
// one soft "take" per batch so a 6-seat table isn't noisy.
import { playSoundFile, playTones } from "../../sound.js";
import { ASSETS } from "./assets.js";

const CUES = {
  pick: () => [
    { frequency: 880, duration: 0.05, type: "triangle", volume: 0.04 },
    { frequency: 1320, duration: 0.07, type: "sine", volume: 0.035, delay: 0.05 },
  ],
  take: () => [
    { frequency: 620, slideTo: 760, duration: 0.08, type: "sine", volume: 0.045 },
    { frequency: 940, duration: 0.06, type: "triangle", volume: 0.03, delay: 0.07 },
  ],
  clash: () => [
    { frequency: 330, slideTo: 250, duration: 0.14, type: "triangle", volume: 0.045 },
    { frequency: 262, slideTo: 196, duration: 0.18, type: "triangle", volume: 0.04, delay: 0.12 },
  ],
  plant: () => [
    { frequency: 523.25, duration: 0.09, type: "sine", volume: 0.045 },
    { frequency: 783.99, duration: 0.09, type: "sine", volume: 0.045, delay: 0.09 },
    { frequency: 1046.5, duration: 0.18, type: "triangle", volume: 0.04, delay: 0.18 },
  ],
  compost: () => [
    { frequency: 160, slideTo: 90, duration: 0.18, type: "sine", volume: 0.08 },
    { frequency: 120, slideTo: 70, duration: 0.14, type: "triangle", volume: 0.03, delay: 0.1 },
  ],
  round: () => [
    { frequency: 659.25, duration: 0.08, type: "triangle", volume: 0.04 },
    { frequency: 880, duration: 0.08, type: "triangle", volume: 0.04, delay: 0.09 },
    { frequency: 1174.66, duration: 0.16, type: "sine", volume: 0.04, delay: 0.18 },
  ],
  turn: () => [
    { frequency: 659.25, duration: 0.09, type: "sine", volume: 0.045 },
    { frequency: 987.77, duration: 0.16, type: "sine", volume: 0.045, delay: 0.1 },
  ],
  win: () => [
    { frequency: 523.25, duration: 0.14, type: "triangle", volume: 0.05 },
    { frequency: 659.25, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.14 },
    { frequency: 783.99, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.28 },
    { frequency: 1046.5, duration: 0.5, type: "sine", volume: 0.06, delay: 0.42 },
  ],
  tick: () => [{ frequency: 1400, duration: 0.03, type: "square", volume: 0.015 }],
  reject: () => [
    { frequency: 190, slideTo: 140, duration: 0.14, type: "sawtooth", volume: 0.018 },
    { frequency: 170, slideTo: 120, duration: 0.16, type: "sawtooth", volume: 0.016, delay: 0.16 },
  ],
};

export function playCue(name) {
  const url = ASSETS.sounds && ASSETS.sounds[name];
  if (url && playSoundFile(url, name === "tick" ? 0.3 : 0.6)) return;
  const build = CUES[name];
  if (build) playTones(build());
}

// ---- event diffing (module state keyed by room+epoch) ----
let cursorKey = "";
let lastSeq = -1;

function cueFor(e, myMark) {
  const mine = e.mark === myMark;
  switch (e.type) {
    case "take": return mine && e.bumped_by ? "clash" : "take";
    case "missed": return mine ? "clash" : null;
    case "plant": return "plant";
    case "compost": return mine ? "compost" : null;
    case "round": return Number(e.round) > 1 ? "round" : null;
    case "game_over": return null; // render.js plays "win" once the results show
    default: return null;
  }
}

// Returns the events newer than the cursor (empty on the first call for a
// key, which only primes it) and plays their cues, spaced out a little.
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
  const seen = new Set();
  let delay = 0;
  fresh.forEach((e) => {
    const cue = cueFor(e, myMark);
    if (!cue || seen.has(cue) || seen.size >= 3) return; // one of each per batch
    seen.add(cue);
    const at = delay;
    if (at === 0) playCue(cue); else setTimeout(() => playCue(cue), at);
    delay += 200;
  });
  return fresh;
}
