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
