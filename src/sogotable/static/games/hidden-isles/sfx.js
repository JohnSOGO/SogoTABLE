// Hidden Isles — sound cues as tone data (synthesised through sound.js, which
// owns mute + volume). Each cue checks ASSETS.sounds for a file override first.
//
// Cues are driven by diffing the server's event log (game.events[].seq)
// against the last seq this client has heard, so every player hears every
// reveal. The first snapshot of a game only primes the cursor (no burst of
// old sounds on load/reconnect). Whether a reveal sounds good or bad depends
// on the viewer's crew (spectators hear it from the guessing crew's side).
import { playSoundFile, playTones } from "../../sound.js";
import { ASSETS } from "./assets.js";

const CUES = {
  deal: () => [0, 1, 2, 3, 4].map((i) => ({ type: "noise", frequency: 2600, slideTo: 1400, filter: "bandpass", q: 1.4, duration: 0.07, volume: 0.05, delay: i * 0.07 })),
  clue: () => [
    { frequency: 660, duration: 0.09, type: "triangle", volume: 0.045 },
    { frequency: 990, duration: 0.18, type: "sine", volume: 0.045, delay: 0.09 },
  ],
  reveal_good: () => [
    { frequency: 523.25, duration: 0.1, type: "triangle", volume: 0.05 },
    { frequency: 659.25, duration: 0.1, type: "triangle", volume: 0.05, delay: 0.08 },
    { frequency: 1046.5, duration: 0.3, type: "sine", volume: 0.05, delay: 0.16 },
  ],
  reveal_bad: () => [
    { frequency: 392, slideTo: 330, duration: 0.18, type: "triangle", volume: 0.05 },
    { frequency: 311, slideTo: 262, duration: 0.26, type: "triangle", volume: 0.045, delay: 0.16 },
  ],
  sandbar: () => [
    { type: "noise", frequency: 900, slideTo: 300, filter: "lowpass", duration: 0.45, volume: 0.06 },
    { frequency: 330, slideTo: 300, duration: 0.2, type: "sine", volume: 0.03, delay: 0.05 },
  ],
  kraken: () => [
    { frequency: 110, slideTo: 55, duration: 0.7, type: "sawtooth", volume: 0.035 },
    { frequency: 165, slideTo: 82, duration: 0.6, type: "square", volume: 0.015, delay: 0.1 },
    { type: "noise", frequency: 500, slideTo: 120, filter: "lowpass", duration: 0.8, volume: 0.07, delay: 0.05 },
  ],
  turn: () => [
    { frequency: 880, duration: 0.12, type: "sine", volume: 0.03 },
    { frequency: 1174.66, duration: 0.22, type: "sine", volume: 0.025, delay: 0.1 },
  ],
  mark: () => [{ frequency: 1500, duration: 0.03, type: "triangle", volume: 0.03 }],
  win: () => [
    { frequency: 523.25, duration: 0.14, type: "triangle", volume: 0.05 },
    { frequency: 659.25, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.14 },
    { frequency: 783.99, duration: 0.14, type: "triangle", volume: 0.05, delay: 0.28 },
    { frequency: 1046.5, duration: 0.5, type: "sine", volume: 0.06, delay: 0.42 },
    { frequency: 523.25, duration: 0.5, type: "triangle", volume: 0.03, delay: 0.42 },
  ],
  lose: () => [
    { frequency: 392, duration: 0.2, type: "triangle", volume: 0.045 },
    { frequency: 349.23, duration: 0.2, type: "triangle", volume: 0.045, delay: 0.2 },
    { frequency: 293.66, duration: 0.5, type: "triangle", volume: 0.045, delay: 0.4 },
  ],
};

export function playCue(name) {
  const url = ASSETS.sounds && ASSETS.sounds[name];
  const volume = name === "mark" ? 0.35 : 0.6;
  if (url && playSoundFile(url, volume)) return;
  const build = CUES[name];
  if (build) playTones(build());
}

function revealCue(e, myTeam) {
  if (e.key === "trap") return "kraken";
  if (e.key === "neutral") return "sandbar";
  const side = myTeam || e.team;
  return e.key === side ? "reveal_good" : "reveal_bad";
}

// ---- event diffing (module state keyed by room+epoch) ----
let cursorKey = "";
let lastSeq = -1;

// Returns the events newer than the cursor (empty on the first call for a
// key, which only primes it). Plays their cues unless `silent`.
export function consumeEvents(key, events, me, { silent = false } = {}) {
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
  const myTeam = me && me.team;
  const myMark = me && me.mark;
  let delay = 0;
  let played = 0;
  const schedule = (name) => {
    if (played >= 4) return;
    played += 1;
    if (delay === 0) playCue(name); else setTimeout(() => playCue(name), delay);
    delay += 380;
  };
  fresh.forEach((e) => {
    if (e.type === "deal") schedule("deal");
    else if (e.type === "clue") schedule("clue");
    else if (e.type === "reveal") schedule(revealCue(e, myTeam));
    else if (e.type === "turn" && !fresh.some((x) => x.type === "win")) schedule("turn");
    else if (e.type === "win") schedule(myTeam && e.team !== myTeam ? "lose" : "win");
    else if (e.type === "mark" && e.by !== myMark && fresh.length === 1) schedule("mark");
  });
  return fresh;
}
