// Realmwright — sound cues as tone and noise data (synthesised through sound.js, which
// owns mute + volume). Each cue checks ASSETS.sounds for a file override first.
//
// Cues are driven by diffing the server's event log (game.events[].seq)
// against the last seq this client has heard, so every player hears everyone
// else's completed cities. The first snapshot of a game only primes the cursor
// (no burst of old sounds on load/reconnect).
import { playSoundFile, playTones } from "../../sound.js";
import { ASSETS } from "./assets.js";

// Natural, not chiptune: wood knocks and clacks are short band-passed noise
// bursts over a soft sine thump; melodic cues are marimba / bell voices (a
// sine fundamental plus quiet partials, each decaying on its own). No square
// or sawtooth waves anywhere.
const C_MAJOR = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

// One marimba note: fundamental + the bar's 4th partial, both plucked.
function marimba(f, { delay = 0, volume = 0.05, decay = 0.45 } = {}) {
  return [
    { frequency: f, duration: decay, type: "sine", volume, delay },
    { frequency: f * 3.93, duration: decay * 0.35, type: "sine", volume: volume * 0.22, delay },
    { type: "noise", frequency: f * 2, filter: "bandpass", q: 4, duration: 0.025, attack: 0.002, volume: volume * 0.35, delay },
  ];
}

// A small hand bell: inharmonic partials with long, staggered decays.
function bell(f, { delay = 0, volume = 0.03, decay = 1.2 } = {}) {
  return [
    { frequency: f, duration: decay, type: "sine", volume, delay },
    { frequency: f * 2.76, duration: decay * 0.6, type: "sine", volume: volume * 0.45, delay },
    { frequency: f * 5.4, duration: decay * 0.3, type: "sine", volume: volume * 0.2, delay },
  ];
}

// A wooden tile set down on the table: a click, a body and a low thump.
function woodClack(scale = 1) {
  return [
    { type: "noise", frequency: 2200, filter: "bandpass", q: 3, duration: 0.05, attack: 0.002, volume: 0.07 * scale },
    { type: "noise", frequency: 700, filter: "bandpass", q: 1.4, duration: 0.11, attack: 0.003, volume: 0.06 * scale },
    { frequency: 120, slideTo: 72, duration: 0.14, type: "sine", volume: 0.07 * scale },
  ];
}

const CUES = {
  // UI taps (pick a spot, rotate, buttons): a light wooden tick.
  tap: () => [
    { type: "noise", frequency: 3200, filter: "bandpass", q: 5, duration: 0.025, attack: 0.001, volume: 0.035 },
    { frequency: 1400, slideTo: 1100, duration: 0.03, type: "sine", volume: 0.02 },
  ],
  // Round timer warning: a wooden tick each second from 10 s, sharper for the
  // last 3, and a low gong when time is up.
  tick: () => [
    { type: "noise", frequency: 2400, filter: "bandpass", q: 6, duration: 0.03, attack: 0.001, volume: 0.06 },
    { frequency: 1000, slideTo: 820, duration: 0.04, type: "sine", volume: 0.03 },
  ],
  tickUrgent: () => [
    { type: "noise", frequency: 3400, filter: "bandpass", q: 7, duration: 0.035, attack: 0.001, volume: 0.08 },
    { frequency: 1500, slideTo: 1250, duration: 0.06, type: "sine", volume: 0.045 },
  ],
  timeUp: () => [
    ...bell(196, { volume: 0.06, decay: 1.8 }),
    ...bell(293.66, { volume: 0.03, decay: 1.4 }),
    { type: "noise", frequency: 300, filter: "lowpass", q: 0.7, duration: 0.25, attack: 0.004, volume: 0.05 },
  ],
  place: () => woodClack(1),
  placeOther: () => woodClack(0.55),
  // A wooden figure tapped onto its spot: a hollow "tok".
  meeple: () => [
    { frequency: 880, slideTo: 620, duration: 0.07, type: "sine", volume: 0.05 },
    { type: "noise", frequency: 2600, filter: "bandpass", q: 6, duration: 0.03, attack: 0.002, volume: 0.04 },
  ],
  // A rising marimba run; bigger scores run longer, ending on a soft bell.
  complete: (points = 4) => {
    const steps = Math.max(2, Math.min(C_MAJOR.length - 2, 2 + Math.floor(points / 3)));
    const tones = [];
    for (let i = 0; i < steps; i += 1) tones.push(...marimba(C_MAJOR[i], { delay: i * 0.085, volume: 0.045 }));
    const top = C_MAJOR[Math.min(steps + 1, C_MAJOR.length - 1)];
    tones.push(...bell(top, { delay: steps * 0.085, volume: 0.035, decay: 0.9 }));
    tones.push({ type: "noise", frequency: 7000, slideTo: 3500, filter: "highpass", q: 0.7, duration: 0.5, attack: 0.04, volume: 0.012, delay: steps * 0.085 });
    return tones;
  },
  // Two soft, low wooden knocks: "not there".
  reject: () => [
    { frequency: 180, slideTo: 130, duration: 0.11, type: "sine", volume: 0.06 },
    { type: "noise", frequency: 450, filter: "bandpass", q: 2, duration: 0.07, attack: 0.002, volume: 0.04 },
    { frequency: 160, slideTo: 115, duration: 0.12, type: "sine", volume: 0.055, delay: 0.15 },
    { type: "noise", frequency: 400, filter: "bandpass", q: 2, duration: 0.07, attack: 0.002, volume: 0.035, delay: 0.15 },
  ],
  round: () => bell(1046.5, { volume: 0.028, decay: 1.3 }),
  win: () => [
    ...marimba(523.25, { volume: 0.05 }),
    ...marimba(659.25, { delay: 0.14, volume: 0.05 }),
    ...marimba(783.99, { delay: 0.28, volume: 0.05 }),
    ...bell(1046.5, { delay: 0.42, volume: 0.045, decay: 1.6 }),
    ...marimba(523.25, { delay: 0.42, volume: 0.035, decay: 0.8 }),
  ],
};

const OVERRIDE_KEY = { tick: "tick", tickUrgent: "tick", timeUp: "timeUp", tap: "tap", place: "place", placeOther: "place", meeple: "meeple", complete: "complete", reject: "reject", round: "round", win: "win" };

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
