// Tradewind Isles — sound cues as tone data (synthesised through sound.js,
// which owns mute + volume). Each cue checks ASSETS.sounds for a file first.
//
// Cues are driven by diffing the server's event log (game.events[].seq)
// against the last seq this client has heard, so everyone hears the table's
// roll, builds and steals. The first snapshot of a game only primes the cursor
// (no burst of old sounds on load/reconnect).
import { playSoundFile, playTones } from "../../sound.js";
import { ASSETS } from "./assets.js";

const CUES = {
  roll: () => [
    { type: "noise", filter: "bandpass", frequency: 2600, slideTo: 1400, q: 1.2, duration: 0.09, volume: 0.05 },
    { type: "noise", filter: "bandpass", frequency: 2200, slideTo: 1100, q: 1.2, duration: 0.08, volume: 0.045, delay: 0.11 },
    { type: "noise", filter: "bandpass", frequency: 1900, slideTo: 900, q: 1.2, duration: 0.07, volume: 0.04, delay: 0.2 },
    { frequency: 300, slideTo: 180, duration: 0.06, type: "triangle", volume: 0.03, delay: 0.27 },
  ],
  produce: () => [
    { frequency: 880, duration: 0.07, type: "triangle", volume: 0.04 },
    { frequency: 1174.66, duration: 0.12, type: "sine", volume: 0.04, delay: 0.07 },
  ],
  build: () => [
    { frequency: 220, slideTo: 140, duration: 0.08, type: "square", volume: 0.025 },
    { frequency: 260, slideTo: 160, duration: 0.08, type: "square", volume: 0.022, delay: 0.1 },
  ],
  buildOther: () => [{ frequency: 200, slideTo: 140, duration: 0.07, type: "triangle", volume: 0.025 }],
  upgrade: () => [
    { frequency: 392, duration: 0.09, type: "triangle", volume: 0.04 },
    { frequency: 523.25, duration: 0.09, type: "triangle", volume: 0.04, delay: 0.09 },
    { frequency: 659.25, duration: 0.18, type: "sine", volume: 0.045, delay: 0.18 },
  ],
  buy: () => [
    { type: "noise", filter: "highpass", frequency: 3000, duration: 0.06, volume: 0.03 },
    { frequency: 740, duration: 0.08, type: "sine", volume: 0.03, delay: 0.05 },
  ],
  play: () => [
    { frequency: 587.33, duration: 0.08, type: "triangle", volume: 0.04 },
    { frequency: 880, duration: 0.2, type: "sine", volume: 0.04, delay: 0.08 },
  ],
  trade: () => [
    { frequency: 660, slideTo: 990, duration: 0.09, type: "sine", volume: 0.035 },
    { frequency: 990, slideTo: 660, duration: 0.09, type: "sine", volume: 0.03, delay: 0.1 },
  ],
  steal: () => [
    { frequency: 1200, slideTo: 500, duration: 0.12, type: "triangle", volume: 0.035 },
    { type: "noise", filter: "lowpass", frequency: 900, duration: 0.08, volume: 0.03, delay: 0.1 },
  ],
  monkey: () => [
    { frequency: 900, slideTo: 1400, duration: 0.07, type: "square", volume: 0.02 },
    { frequency: 1000, slideTo: 1500, duration: 0.07, type: "square", volume: 0.02, delay: 0.1 },
    { frequency: 800, slideTo: 1300, duration: 0.09, type: "square", volume: 0.02, delay: 0.2 },
  ],
  award: () => [
    { frequency: 659.25, duration: 0.1, type: "triangle", volume: 0.045 },
    { frequency: 783.99, duration: 0.1, type: "triangle", volume: 0.045, delay: 0.1 },
    { frequency: 1046.5, duration: 0.3, type: "sine", volume: 0.05, delay: 0.2 },
  ],
  win: () => [
    { frequency: 523.25, duration: 0.14, type: "triangle", volume: 0.05 },
    { frequency: 659.25, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.14 },
    { frequency: 783.99, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.28 },
    { frequency: 1046.5, duration: 0.5, type: "sine", volume: 0.06, delay: 0.42 },
    { frequency: 523.25, duration: 0.5, type: "triangle", volume: 0.03, delay: 0.42 },
  ],
  reject: () => [
    { frequency: 190, slideTo: 140, duration: 0.14, type: "sawtooth", volume: 0.018 },
    { frequency: 170, slideTo: 120, duration: 0.16, type: "sawtooth", volume: 0.016, delay: 0.16 },
  ],
  yourTurn: () => [
    { frequency: 1046.5, duration: 0.12, type: "sine", volume: 0.035 },
    { frequency: 1318.51, duration: 0.22, type: "sine", volume: 0.035, delay: 0.12 },
  ],
};

const OVERRIDE_KEY = { buildOther: "build" };

export function playCue(name) {
  const key = OVERRIDE_KEY[name] || name;
  const url = ASSETS.sounds && ASSETS.sounds[key];
  const volume = name === "buildOther" ? 0.35 : 0.6;
  if (url && playSoundFile(url, volume)) return;
  const build = CUES[name];
  if (build) playTones(build());
}

// ---- event diffing (module state keyed by room+epoch) ----
let cursorKey = "";
let lastSeq = -1;

function gainedByMe(e, myMark) {
  const g = e && e.gains;
  if (!g || !myMark) return false;
  const mine = g[myMark];
  if (!mine) return false;
  if (typeof mine === "number") return mine > 0;
  return Object.values(mine).some((n) => Number(n) > 0);
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
  let delay = 0;
  let played = 0;
  const heard = new Set();
  const schedule = (cue) => {
    if (played >= 4 || heard.has(cue)) return;
    heard.add(cue); played += 1;
    if (delay === 0) playCue(cue); else setTimeout(() => playCue(cue), delay);
    delay += 260;
  };
  fresh.forEach((e) => {
    const mine = e.mark === myMark;
    switch (e.type) {
      case "roll": schedule("roll"); if (gainedByMe(e, myMark)) schedule("produce"); break;
      case "seven": case "monkey": schedule("monkey"); break;
      case "steal": schedule("steal"); break;
      case "build": schedule(mine ? "build" : "buildOther"); break;
      case "upgrade": schedule("upgrade"); break;
      case "buy": if (mine) schedule("buy"); break;
      case "play": schedule("play"); break;
      case "trade": case "bank_trade": if (mine || e.partner === myMark) schedule("trade"); break;
      case "award": schedule("award"); break;
      default: break;
    }
  });
  return fresh;
}
