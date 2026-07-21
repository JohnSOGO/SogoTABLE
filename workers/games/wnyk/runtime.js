// Shared constants + runtime seams for the Well, Now You Know engine — the
// neutral leaf beneath rules.js / projection.js / ratings.js that keeps the
// module graph acyclic. The seams exist for tests: swap randomness, the
// clock, or the generated deck data without touching real card text or wall
// time. rules.js re-exports the public surface, so consumers (the future
// handlers row, tests) keep importing from rules.js alone.
import { WNYK_DECKS } from "./decks.js";

// Fresh opaque id, registry-style. At UI-port time this literal moves into
// GAME_IDS in the shared registry and this line becomes GAME_IDS.wnyk (the
// game is deliberately unregistered until then, so isWnykGame must not call
// cleanGameId — it throws on ids the registry doesn't know).
export const WNYK_GAME_ID = "c9d4e72a81f5";
export const WNYK_HAND_SIZE = 10;
export const WNYK_MIN_SEATS = 3;
export const WNYK_WRITEIN_MAX_LENGTH = 80;
export const WNYK_SKIP_DELAY_MS = 2 * 60 * 1000;
export const WNYK_SKIP_THRESHOLD = 2 / 3;
// Card-face provenance label for house-made cards (blanks, write-ins, library
// custom cards); deck cards carry their generated pack label from decks.js.
export const WNYK_HOUSE_PACK = "House Deck";
export const WNYK_PHASES = ["prompt", "submitting", "judging", "round_end"];
// Server-authoritative hold after the judge releases the prompt: submissions
// inside the grace are rejected so a racing client can't bypass the UI hold.
export const WNYK_SUBMIT_GRACE_MS = 5000;
// A judge may 👎-swap the black card at most this many times per round —
// uncapped chaining would let one judge bulk-downvote the prompt deck.
export const WNYK_BLACK_SWAPS_PER_ROUND = 2;
export const TARGET_SCORE_MIN = 3;
export const TARGET_SCORE_MAX = 15;
export const TARGET_SCORE_DEFAULT = 7;

let randomFn = Math.random;
export const wnykRandom = () => randomFn();
export function setWnykRandom(fn) {
  randomFn = typeof fn === "function" ? fn : Math.random;
}

let nowFn = () => Date.now();
export const wnykNow = () => nowFn();
export function setWnykNow(fn) {
  nowFn = typeof fn === "function" ? fn : () => Date.now();
}

// Deck seam (tests only): swap the generated card data for a tiny rigged deck
// so tests don't depend on real card text. Shape must match WNYK_DECKS.
let deckData = WNYK_DECKS;
export const wnykDeckData = () => deckData;
export function setWnykDecks(decks) {
  deckData = decks && typeof decks === "object" ? decks : WNYK_DECKS;
}
