// Last Orders — spoken play callouts (presentation audio only; decides nothing).
//
// callout.js calls speakPlay() once per callout it shows. A line is the card's
// name, spoken in the voice of the patron who played it:
//   1. a pre-generated clip (ASSETS.voices[cardId], made once on SogoAI with
//      Kokoro — see docs/voices.md) played through sound.js, which owns mute
//      and volume; otherwise
//   2. the browser's speechSynthesis, shaped by the patron's profile below
//      (gender hint picks a system voice, pitch/rate give each patron a
//      distinct sound), gated on the same global mute.
// The `kokoro` field is the voice id the clip generator uses for that patron.
import { isSoundEnabled, playSoundFile, soundVolumeLevel } from "../../sound.js";
import { ASSETS } from "./assets.js";

export const VOICE_PROFILES = {
  "base:gorrum": { kokoro: "am_onyx", speed: 0.88, gender: "m", pitch: 0.55, rate: 0.85 },
  "base:tilly": { kokoro: "af_sky", speed: 1.12, gender: "f", pitch: 1.6, rate: 1.15 },
  "base:ansel": { kokoro: "bm_george", speed: 0.9, gender: "m", pitch: 0.9, rate: 0.88 },
  "base:zephyrine": { kokoro: "bf_isabella", speed: 1.0, gender: "f", pitch: 1.3, rate: 0.98 },
  "harbor:marrow": { kokoro: "bm_lewis", speed: 0.92, gender: "m", pitch: 0.7, rate: 0.92 },
  "harbor:nessa": { kokoro: "af_nicole", speed: 0.95, gender: "f", pitch: 1.1, rate: 0.9 },
  "frost:hrolga": { kokoro: "bf_alice", speed: 0.95, gender: "f", pitch: 0.8, rate: 0.95 },
  "frost:sable": { kokoro: "af_river", speed: 1.05, gender: "f", pitch: 1.2, rate: 1.05 },
  "masquerade:verrin": { kokoro: "bm_daniel", speed: 0.9, gender: "m", pitch: 0.8, rate: 0.9 },
  "masquerade:bim": { kokoro: "am_puck", speed: 1.15, gender: "m", pitch: 1.5, rate: 1.18 },
  "clockwork:sprocket": { kokoro: "af_jessica", speed: 1.15, gender: "f", pitch: 1.45, rate: 1.2 },
  "clockwork:brassbell": { kokoro: "am_echo", speed: 0.9, gender: "m", pitch: 0.4, rate: 0.85 },
  "storm:monsoon": { kokoro: "af_kore", speed: 0.92, gender: "f", pitch: 0.85, rate: 0.92 },
  "storm:longshanks": { kokoro: "am_michael", speed: 0.95, gender: "m", pitch: 0.95, rate: 0.95 },
  "storm:notepick": { kokoro: "am_liam", speed: 1.12, gender: "m", pitch: 1.55, rate: 1.15 },
};
export const NARRATOR = { kokoro: "bm_fable", speed: 1.0, gender: "m", pitch: 1.0, rate: 1.0 };

export const profileFor = (characterId) => VOICE_PROFILES[characterId] || NARRATOR;

// What is said for a card: its name, with a little punch.
export function lineFor(cardName) {
  const name = String(cardName || "").trim();
  if (!name) return "";
  return /[!?.…]$/.test(name) ? name : `${name}!`;
}

const FEMALE = /female|woman|samantha|victoria|karen|moira|tessa|zira|hazel|susan|serena|fiona|aria|jenny|libby|sonia|natasha|catherine|allison|ava|kate|emma|amy/i;
const MALE = /\bmale\b|\bman\b|daniel|alex|fred|david|mark|george|guy|ryan|thomas|oliver|arthur|aaron|tom|rishi|gordon|lee|james|brian|matthew/i;

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function synthVoice(profile, characterId) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (!synth || typeof synth.getVoices !== "function") return null;
  const english = synth.getVoices().filter((v) => /^en/i.test(v.lang || ""));
  if (!english.length) return null;
  const want = profile.gender === "f" ? FEMALE : MALE;
  const avoid = profile.gender === "f" ? MALE : FEMALE;
  let pool = english.filter((v) => want.test(v.name) && !avoid.test(v.name));
  if (!pool.length) pool = english;
  return pool[hash(characterId || "narrator") % pool.length];
}

function speakSynth(text, characterId) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
  try {
    const profile = profileFor(characterId);
    const u = new SpeechSynthesisUtterance(text);
    const voice = synthVoice(profile, characterId);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.pitch = Math.max(0, Math.min(2, profile.pitch));
    u.rate = Math.max(0.5, Math.min(2, profile.rate));
    u.volume = Math.min(1, 0.45 + 0.2 * soundVolumeLevel());
    synth.cancel();
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

// Speak one play. Returns true when something started.
export function speakPlay({ characterId, cardId, cardName }) {
  if (!isSoundEnabled()) return false;
  const url = ASSETS.voices && ASSETS.voices[cardId];
  if (url && playSoundFile(url, 0.95)) return true;
  const text = lineFor(cardName);
  return text ? speakSynth(text, characterId) : false;
}

export function stopVoice() {
  try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch { /* ignore */ }
}
