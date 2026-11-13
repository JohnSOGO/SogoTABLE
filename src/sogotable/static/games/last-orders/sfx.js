// Last Orders — sound cues as tone data (synthesised through sound.js, which
// owns mute + volume). Each cue checks ASSETS.sounds for a file override first.
//
// Cues are driven by diffing the server's event log (game.events[].seq)
// against the last seq this client has heard, so every player hears every
// punch, pour and pot. The first snapshot of a game only primes the cursor
// (no burst of old sounds on load/reconnect).
import { playSoundFile, playTones } from "../../sound.js";
import { ASSETS } from "./assets.js";

const CUES = {
  play: () => [
    { frequency: 520, slideTo: 300, duration: 0.07, type: "triangle", volume: 0.05 },
    { frequency: 180, slideTo: 90, duration: 0.12, type: "sine", volume: 0.07, delay: 0.05 },
  ],
  react: () => [
    { frequency: 880, duration: 0.05, type: "square", volume: 0.025 },
    { frequency: 1175, duration: 0.09, type: "triangle", volume: 0.04, delay: 0.06 },
  ],
  negate: () => [
    { frequency: 660, slideTo: 220, duration: 0.22, type: "sawtooth", volume: 0.025 },
  ],
  drink: () => [
    { frequency: 300, slideTo: 420, duration: 0.09, type: "sine", volume: 0.05 },
    { frequency: 260, slideTo: 380, duration: 0.09, type: "sine", volume: 0.045, delay: 0.13 },
    { frequency: 230, slideTo: 340, duration: 0.11, type: "sine", volume: 0.04, delay: 0.26 },
  ],
  coins: () => [
    { frequency: 1975, duration: 0.05, type: "triangle", volume: 0.035 },
    { frequency: 2637, duration: 0.07, type: "triangle", volume: 0.03, delay: 0.06 },
  ],
  pot: () => [
    { frequency: 1568, duration: 0.05, type: "triangle", volume: 0.035 },
    { frequency: 1975, duration: 0.05, type: "triangle", volume: 0.035, delay: 0.07 },
    { frequency: 2349, duration: 0.05, type: "triangle", volume: 0.035, delay: 0.14 },
    { frequency: 3136, duration: 0.14, type: "sine", volume: 0.035, delay: 0.21 },
  ],
  hit: () => [
    { frequency: 140, slideTo: 55, duration: 0.16, type: "sine", volume: 0.1 },
    { frequency: 90, duration: 0.05, type: "square", volume: 0.03 },
  ],
  gamble: () => [
    { frequency: 392, duration: 0.06, type: "square", volume: 0.025 },
    { frequency: 523.25, duration: 0.06, type: "square", volume: 0.025, delay: 0.08 },
    { frequency: 659.25, duration: 0.1, type: "triangle", volume: 0.04, delay: 0.16 },
  ],
  out: () => [
    { frequency: 392, slideTo: 330, duration: 0.2, type: "triangle", volume: 0.045 },
    { frequency: 330, slideTo: 262, duration: 0.2, type: "triangle", volume: 0.045, delay: 0.22 },
    { frequency: 262, slideTo: 140, duration: 0.4, type: "triangle", volume: 0.045, delay: 0.44 },
  ],
  win: () => [
    { frequency: 523.25, duration: 0.14, type: "triangle", volume: 0.05 },
    { frequency: 659.25, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.14 },
    { frequency: 783.99, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.28 },
    { frequency: 1046.5, duration: 0.5, type: "sine", volume: 0.06, delay: 0.42 },
    { frequency: 523.25, duration: 0.5, type: "triangle", volume: 0.03, delay: 0.42 },
  ],
  // "Ah-ha!" sting when a card is aimed at me: a stab, then a rising hit.
  attacked: () => [
    { frequency: 196, duration: 0.09, type: "sawtooth", volume: 0.05 },
    { frequency: 233.08, duration: 0.09, type: "sawtooth", volume: 0.05, delay: 0.11 },
    { frequency: 311.13, slideTo: 466.16, duration: 0.32, type: "square", volume: 0.045, delay: 0.22 },
    { frequency: 98, slideTo: 60, duration: 0.3, type: "sine", volume: 0.09, delay: 0.22 },
  ],
  tick: () => [{ frequency: 1400, duration: 0.03, type: "square", volume: 0.015 }],
  turn: () => [
    { frequency: 659.25, duration: 0.09, type: "sine", volume: 0.045 },
    { frequency: 987.77, duration: 0.16, type: "sine", volume: 0.045, delay: 0.1 },
  ],
  reject: () => [
    { frequency: 190, slideTo: 140, duration: 0.14, type: "sawtooth", volume: 0.018 },
    { frequency: 170, slideTo: 120, duration: 0.16, type: "sawtooth", volume: 0.016, delay: 0.16 },
  ],
};

const OVERRIDE_KEY = { attacked: "attacked", play: "play", react: "react", negate: "react", drink: "drink", coins: "coins", pot: "coins", hit: "hit", gamble: "gamble", out: "out", win: "win", tick: "tick", turn: "turn" };

export function playCue(name) {
  const url = ASSETS.sounds && ASSETS.sounds[OVERRIDE_KEY[name]];
  if (url && playSoundFile(url, name === "tick" ? 0.3 : 0.6)) return;
  const build = CUES[name];
  if (build) playTones(build());
}

// ---- event diffing (module state keyed by room+epoch) ----
let cursorKey = "";
let lastSeq = -1;

function cueFor(e, myMark) {
  switch (e.type) {
    case "play":
      if (e.kind === "drink") return "drink";
      return e.target === myMark && e.mark !== myMark ? "attacked" : "play";
    case "react": return e.target === myMark && e.mark !== myMark ? "attacked" : "react";
    case "negated": return "negate";
    case "grit": return Number(e.n) < 0 ? "hit" : null;
    case "gold": return Number(e.n) > 0 ? "coins" : null;
    case "gamble_start": case "gamble_lead": return "gamble";
    case "gamble_win": return "pot";
    case "out": return "out";
    case "win": return null; // render.js plays it once the results show
    case "turn": return e.mark === myMark ? "turn" : null;
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
  if (!fresh.length) return fresh;
  const seen = new Set();
  let delay = 0;
  // A card aimed at me jumps the queue: its sting plays first.
  const ordered = [...fresh].sort((a, b) => (cueFor(b, myMark) === "attacked") - (cueFor(a, myMark) === "attacked"));
  ordered.forEach((e) => {
    const cue = cueFor(e, myMark);
    if (!cue || seen.has(cue) || seen.size >= 4) return; // one of each per batch
    seen.add(cue);
    const at = delay;
    if (at === 0) playCue(cue); else setTimeout(() => playCue(cue), at);
    delay += 180;
  });
  return fresh;
}
