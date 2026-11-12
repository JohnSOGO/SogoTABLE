// Asset-review store: the admin's verdicts on generated assets (sound files,
// alternate takes, synth fallbacks, pictures), kept so a later Claude session
// can read them (scripts/export-asset-reviews.mjs). A zero-fan-in leaf like
// bug-reports.js: pure functions over the passed-in state. They mutate
// data.asset_reviews in place and never persist; the Worker entry saves.
//
// Records are keyed by asset key and upserted, so repeating a write is
// idempotent. Every route is gated by the Sogo passcode. All state lives in one
// row that loads on every request, so notes and the record count are capped.
import { assertSogoPasscode } from "./platform/auth.js";

export const ASSET_REVIEW_STATUSES = Object.freeze(["pending", "approved", "rejected"]);
const ASSET_REVIEW_LIMIT = 1000;
const NOTE_LIMIT = 2000;

const text = (value, limit) => String(value == null ? "" : value).trim().slice(0, limit);

function store(data) {
  if (!data.asset_reviews || typeof data.asset_reviews !== "object" || Array.isArray(data.asset_reviews)) {
    data.asset_reviews = {};
  }
  return data.asset_reviews;
}

export function listAssetReviews(data, payload, superuserPasscode) {
  assertSogoPasscode(payload.passcode, superuserPasscode);
  return { ok: true, reviews: Object.values(store(data)) };
}

// Upsert one review. Unknown status values are rejected, not coerced, so a
// client bug shows up as an error instead of a silently wrong verdict.
export function upsertAssetReview(data, payload, superuserPasscode) {
  assertSogoPasscode(payload.passcode, superuserPasscode);
  const key = text(payload.key, 200);
  if (!key) throw new Error("Asset key is required.");
  const status = text(payload.status || "pending", 20);
  if (!ASSET_REVIEW_STATUSES.includes(status)) {
    throw new Error(`Unknown review status "${status}" (expected ${ASSET_REVIEW_STATUSES.join(", ")}).`);
  }
  const reviews = store(data);
  if (!reviews[key] && Object.keys(reviews).length >= ASSET_REVIEW_LIMIT) {
    throw new Error(`Asset review store is full (${ASSET_REVIEW_LIMIT}). Export and clear it first.`);
  }
  const record = {
    key,
    kind: text(payload.kind, 20),
    game: text(payload.game, 60),
    label: text(payload.label, 160),
    path: text(payload.path, 300),
    source: text(payload.source, 400),
    status,
    note: text(payload.note, NOTE_LIMIT),
    chosen_take: text(payload.chosen_take, 60),
    regenerate: Boolean(payload.regenerate),
    reviewer: text(payload.reviewer, 120),
    updated_at: Date.now(),
  };
  reviews[key] = record;
  return { ok: true, review: record };
}

export function clearAssetReviews(data, payload, superuserPasscode) {
  assertSogoPasscode(payload.passcode, superuserPasscode);
  const cleared = Object.keys(store(data)).length;
  data.asset_reviews = {};
  return { ok: true, cleared };
}
