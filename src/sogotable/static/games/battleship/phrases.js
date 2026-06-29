// Battleship reveal flavour text. The attack line plays as a shot launches; the
// result line plays when the radar scan resolves into a hit / miss / sink. These
// are cosmetic only — they never gate game logic — so they live in the battleship
// module rather than the platform shell. app.js calls the two pickers from its
// reveal builder (showBattleshipAttackReveal).

const ATTACK_PHRASES = [
  "Incoming!",
  "Fire!",
  "Taking the shot.",
  "Attack launched.",
  "Target acquired.",
  "Weapons hot.",
  "Locked and loaded.",
  "Let it fly.",
];
const HIT_PHRASES = [
  "Direct hit!",
  "Boom. Contact.",
  "Target damaged.",
  "That one landed.",
  "Good hit.",
  "Impact confirmed.",
  "That hurt.",
];
const MISS_PHRASES = [
  "Splash... nothing.",
  "Empty water.",
  "No contact.",
  "Shot went wide.",
  "Just waves.",
  "Clean miss.",
  "Ghost target.",
];
const SUNK_PHRASES = [
  "Target sunk!",
  "One less problem.",
  "Enemy down.",
  "They're going under.",
  "Scratch one.",
  "Sent to the deep.",
  "Confirmed kill.",
];

function pick(phrases) {
  return phrases[Math.floor(Math.random() * phrases.length)] || "";
}

export function randomBattleshipAttackPhrase() {
  return pick(ATTACK_PHRASES);
}

export function randomBattleshipResultPhrase(hit, sunk) {
  if (sunk) return pick(SUNK_PHRASES);
  return pick(hit ? HIT_PHRASES : MISS_PHRASES);
}
