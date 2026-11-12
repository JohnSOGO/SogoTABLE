// Battleship — sound cues as tone data, synthesised through sound.js (which
// owns mute, volume and the oscillator + filtered-noise voices). Each cue checks
// ASSETS.sounds for a file override first.
//
// client.js plays these at the existing reveal timeline beats (radar start and
// result), so offence and defence, bot and human, local and broadcast moves all
// sound the same.
import { playSoundFile, playTones } from "../../sound.js";
import { ASSETS } from "./assets.js";

const CUES = {
  // Your gun fires: a deep thump, a blast of noise, then the shell whistling away.
  fire: () => [
    { frequency: 110, slideTo: 38, duration: 0.32, type: "sine", volume: 0.09 },
    { type: "noise", filter: "lowpass", frequency: 2400, slideTo: 300, duration: 0.28, volume: 0.07 },
    { frequency: 1500, slideTo: 700, duration: 0.6, type: "sine", volume: 0.012, delay: 0.22 },
  ],
  // Enemy shot inbound: a sonar ping (with an echo) and a falling whistle.
  incoming: () => [
    { frequency: 1320, duration: 0.22, type: "sine", volume: 0.03 },
    { frequency: 1320, duration: 0.3, type: "sine", volume: 0.011, delay: 0.3 },
    { frequency: 1900, slideTo: 620, duration: 0.65, type: "sine", volume: 0.014, delay: 0.3 },
  ],
  // Impact: crack, rolling boom, low rumble and a few crackles of debris.
  hit: () => [
    { type: "noise", filter: "highpass", frequency: 1800, duration: 0.06, volume: 0.05 },
    { type: "noise", filter: "lowpass", frequency: 3200, slideTo: 140, duration: 0.85, attack: 0.004, volume: 0.11 },
    { frequency: 92, slideTo: 32, duration: 0.7, type: "sine", volume: 0.1 },
    { frequency: 58, slideTo: 30, duration: 0.5, type: "triangle", volume: 0.05, delay: 0.05 },
    { type: "noise", filter: "bandpass", frequency: 2600, q: 4, duration: 0.04, volume: 0.03, delay: 0.32 },
    { type: "noise", filter: "bandpass", frequency: 2100, q: 4, duration: 0.04, volume: 0.025, delay: 0.47 },
  ],
  // Splash: a burst of white water falling back, and a little bloop.
  miss: () => [
    { type: "noise", filter: "bandpass", frequency: 900, slideTo: 2600, q: 0.9, duration: 0.16, volume: 0.06 },
    { type: "noise", filter: "lowpass", frequency: 3000, slideTo: 500, duration: 0.7, attack: 0.03, volume: 0.05, delay: 0.1 },
    { frequency: 340, slideTo: 620, duration: 0.09, type: "sine", volume: 0.02, delay: 0.05 },
  ],
  // Going down: a creaking hull groan, then bubbles rising.
  sunk: () => {
    const tones = [
      { frequency: 96, slideTo: 44, duration: 1.3, type: "sawtooth", volume: 0.022, delay: 0.5 },
      { frequency: 70, slideTo: 36, duration: 1.4, type: "sine", volume: 0.05, delay: 0.55 },
      { type: "noise", filter: "lowpass", frequency: 600, slideTo: 120, duration: 1.4, attack: 0.3, volume: 0.04, delay: 0.6 },
    ];
    for (let i = 0; i < 7; i += 1) {
      const f = 380 + ((i * 137) % 260);
      tones.push({ frequency: f, slideTo: f * 1.9, duration: 0.06, type: "sine", volume: 0.016, delay: 1.2 + i * 0.11 });
    }
    return tones;
  },
};

export function playCue(name) {
  const url = ASSETS.sounds && ASSETS.sounds[name];
  if (url && playSoundFile(url, 0.6)) return;
  const build = CUES[name];
  if (build) playTones(build());
}
