const STORAGE_KEY = "sogotable.soundEnabled";
const VOLUME_LEVEL_KEY = "sogotable.soundVolumeLevel";
const DEFAULT_VOLUME = 0.045;
const DEFAULT_VOLUME_LEVEL = 4;
const MAX_VOLUME_LEVEL = 5;

let audioContext = null;
let unlocked = false;

function audioAvailable() {
  return typeof window !== "undefined" && Boolean(window.AudioContext || window.webkitAudioContext);
}

function getAudioContext() {
  if (!audioAvailable()) return null;
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

export function isSoundEnabled() {
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

export function soundVolumeLevel() {
  const parsed = Number(localStorage.getItem(VOLUME_LEVEL_KEY) || DEFAULT_VOLUME_LEVEL);
  if (!Number.isFinite(parsed)) return DEFAULT_VOLUME_LEVEL;
  return Math.min(MAX_VOLUME_LEVEL, Math.max(1, Math.round(parsed)));
}

export function setSoundEnabled(value) {
  localStorage.setItem(STORAGE_KEY, String(Boolean(value)));
}

export function setSoundVolumeLevel(level) {
  const next = Math.min(MAX_VOLUME_LEVEL, Math.max(1, Math.round(Number(level) || DEFAULT_VOLUME_LEVEL)));
  localStorage.setItem(VOLUME_LEVEL_KEY, String(next));
  return next;
}

export function toggleSound() {
  if (!isSoundEnabled()) {
    setSoundEnabled(true);
    setSoundVolumeLevel(1);
    unlockAudio();
    return true;
  }
  const level = soundVolumeLevel();
  if (level < MAX_VOLUME_LEVEL) {
    setSoundVolumeLevel(level + 1);
    unlockAudio();
    return true;
  }
  setSoundEnabled(false);
  return false;
}

export function unlockAudio() {
  if (!isSoundEnabled()) return;
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }
  unlocked = true;
}

function playTone({
  frequency = 440,
  duration = 0.08,
  type = "sine",
  volume = DEFAULT_VOLUME,
  slideTo = null,
  delay = 0,
} = {}) {
  if (!isSoundEnabled()) return;
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    context.resume().catch(() => {});
    if (!unlocked) return;
  }

  const start = context.currentTime + delay;
  const stop = start + duration;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), stop);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(scaledVolume(volume), start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(stop);
}

function scaledVolume(volume) {
  const level = soundVolumeLevel();
  const multipliers = [0.2, 0.45, 0.75, 1.1, 1.55];
  return volume * multipliers[level - 1];
}

function playSequence(tones) {
  tones.forEach((tone) => playTone(tone));
}

export function playClick() {
  playTone({ frequency: 420, duration: 0.035, type: "square", volume: 0.018 });
}

export function playConfirm() {
  playTone({ frequency: 620, duration: 0.075, type: "sine", volume: 0.032, slideTo: 860 });
}

export function playCancel() {
  playTone({ frequency: 340, duration: 0.08, type: "triangle", volume: 0.03, slideTo: 210 });
}

export function playInvalidMove() {
  playTone({ frequency: 135, duration: 0.12, type: "sawtooth", volume: 0.026, slideTo: 90 });
}

export function playTurnChanged(mark = "X") {
  const step = mark === "O" ? 2 ** (1 / 12) : 1;
  playTone({
    frequency: 520 * step,
    duration: 0.055,
    type: "triangle",
    volume: 0.026,
    slideTo: 720 * step,
  });
}

export function playInviteReceived() {
  playSequence([
    { frequency: 620, duration: 0.075, type: "sine", volume: 0.034 },
    { frequency: 830, duration: 0.1, type: "sine", volume: 0.034, delay: 0.09 },
  ]);
}

export function playPlayerJoined() {
  playSequence([
    { frequency: 440, duration: 0.06, type: "triangle", volume: 0.028 },
    { frequency: 660, duration: 0.08, type: "triangle", volume: 0.03, delay: 0.07 },
  ]);
}

export function playRoomCreated() {
  playSequence([
    { frequency: 520, duration: 0.06, type: "sine", volume: 0.03 },
    { frequency: 780, duration: 0.08, type: "sine", volume: 0.032, delay: 0.07 },
  ]);
}

export function playWin() {
  playSequence([
    { frequency: 523, duration: 0.08, type: "sine", volume: 0.04 },
    { frequency: 659, duration: 0.08, type: "sine", volume: 0.04, delay: 0.08 },
    { frequency: 1046, duration: 0.13, type: "sine", volume: 0.042, delay: 0.16 },
  ]);
}

export function playLose() {
  playSequence([
    { frequency: 392, duration: 0.09, type: "triangle", volume: 0.028 },
    { frequency: 294, duration: 0.12, type: "triangle", volume: 0.026, delay: 0.1 },
  ]);
}

export function playBattleshipHit() {
  playSequence([
    { frequency: 130, duration: 0.08, type: "sawtooth", volume: 0.038, slideTo: 82 },
    { frequency: 76, duration: 0.14, type: "square", volume: 0.034, delay: 0.07 },
    { frequency: 420, duration: 0.05, type: "triangle", volume: 0.024, delay: 0.18, slideTo: 240 },
  ]);
}

export function playBattleshipMiss() {
  playSequence([
    { frequency: 260, duration: 0.06, type: "sine", volume: 0.026, slideTo: 380 },
    { frequency: 190, duration: 0.08, type: "triangle", volume: 0.023, delay: 0.08, slideTo: 150 },
  ]);
}

// 10,000 dice tumbling: a few short, slightly detuned knocks.
export function playDiceRoll() {
  playSequence([
    { frequency: 220, duration: 0.05, type: "square", volume: 0.022, slideTo: 175 },
    { frequency: 320, duration: 0.045, type: "square", volume: 0.02, delay: 0.05, slideTo: 250 },
    { frequency: 200, duration: 0.05, type: "triangle", volume: 0.021, delay: 0.1, slideTo: 150 },
  ]);
}

// Setting aside scoring dice: a light upward blip.
export function playScorePick() {
  playTone({ frequency: 660, duration: 0.05, type: "sine", volume: 0.026, slideTo: 880 });
}

// Banking the turn score: a satisfying two-note cash-in.
export function playBank() {
  playSequence([
    { frequency: 700, duration: 0.07, type: "sine", volume: 0.032, slideTo: 980 },
    { frequency: 1040, duration: 0.11, type: "sine", volume: 0.034, delay: 0.08 },
  ]);
}

// Farkle (busted roll): a downward bust tone.
export function playFarkle() {
  playSequence([
    { frequency: 300, duration: 0.1, type: "sawtooth", volume: 0.03, slideTo: 150 },
    { frequency: 170, duration: 0.16, type: "triangle", volume: 0.028, delay: 0.09, slideTo: 90 },
  ]);
}

// Card games (Hearts): a quick riffle of soft knocks as the hands fan out.
export function playCardDeal() {
  playSequence(Array.from({ length: 6 }, (_, i) => (
    { frequency: 340 - i * 18, duration: 0.035, type: "triangle", volume: 0.02, delay: i * 0.07, slideTo: 240 - i * 12 }
  )));
}

// A card landing on the table: one soft snap.
export function playCardPlay() {
  playSequence([
    { frequency: 290, duration: 0.04, type: "triangle", volume: 0.026, slideTo: 200 },
    { frequency: 170, duration: 0.05, type: "sine", volume: 0.022, delay: 0.03 },
  ]);
}

// Sweeping a finished trick off the table.
export function playTrickTake() {
  playSequence([
    { frequency: 420, duration: 0.09, type: "sine", volume: 0.024, slideTo: 240 },
    { frequency: 196, duration: 0.11, type: "sine", volume: 0.026, delay: 0.09, slideTo: 150 },
  ]);
}

// The first heart hits the table: a small minor turn.
export function playHeartsBroken() {
  playSequence([
    { frequency: 392, duration: 0.12, type: "sine", volume: 0.028 },
    { frequency: 311, duration: 0.17, type: "sine", volume: 0.028, delay: 0.1 },
  ]);
}

// The Queen of Spades lands: a low, unmistakable growl.
export function playQueenSpades() {
  playSequence([
    { frequency: 147, duration: 0.22, type: "sawtooth", volume: 0.026, slideTo: 110 },
    { frequency: 98, duration: 0.28, type: "triangle", volume: 0.026, delay: 0.08, slideTo: 73 },
  ]);
}

// Somebody shot the moon: a rising fanfare.
export function playMoonShot() {
  playSequence([
    { frequency: 392, duration: 0.14, type: "triangle", volume: 0.032 },
    { frequency: 494, duration: 0.14, type: "triangle", volume: 0.032, delay: 0.12 },
    { frequency: 587, duration: 0.14, type: "triangle", volume: 0.034, delay: 0.24 },
    { frequency: 784, duration: 0.22, type: "triangle", volume: 0.036, delay: 0.36 },
  ]);
}
