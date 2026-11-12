// Asset Review: the reviewable-asset catalog. Pure: no DOM, no playback, no
// fetch. index.js imports the asset modules and passes them in.
//
// An entry is one thing the admin judges: a sound cue (its shipped file, any
// alternate takes, and the synth fallback) or one picture slot. Keys are stable
// strings ("sound:global:farkle", "picture:last-orders:cards.base:gorrum:headbutt")
// because the Worker stores reviews under them.

// UI ticks are synth-only on purpose (docs/SOUNDS.md); listed so they can be judged too.
export const UI_TICKS = ["click", "confirm", "cancel", "invalidMove", "turnChanged"];

const IMAGE_URL = /\.(webp|png|jpe?g|gif|svg|avif)(\?|#|$)/i;

export function pathOf(url) {
  if (!url) return "";
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return String(url);
  }
}

function soundEntry({ key, game, gameName, cue, url, take, source, play }) {
  const sources = [];
  if (url) sources.push({ id: "shipped", label: "Shipped file", url });
  for (const t of take ? take.takes : []) {
    sources.push({ id: t.id, label: `Take ${t.seed}${take.shipped === t.seed ? " (shipped)" : ""}`, url: t.url, seed: t.seed });
  }
  sources.push({ id: "synth", label: url ? "Synth fallback" : "Synth (no file)", synth: true });
  return {
    key,
    kind: "sound",
    game,
    gameName,
    label: cue,
    title: cue,
    path: pathOf(url),
    hasFile: Boolean(url),
    source: take ? `Stable Audio Open, ${take.seconds} s, seed ${take.shipped}: "${take.prompt}"` : source || (url ? "" : "Synth only"),
    prompt: take ? take.prompt : "",
    sources,
    play,
  };
}

// Walk an assets object for picture URLs, skipping palettes and sounds.
// Yields [slotPath, url] like ["cards.base:gorrum:headbutt", "https://.../x.webp"].
export function pictureSlots(assets, prefix = "") {
  const out = [];
  if (!assets || typeof assets !== "object") return out;
  for (const [name, value] of Object.entries(assets)) {
    if (!prefix && (name === "palette" || name === "sounds")) continue;
    const slot = prefix ? `${prefix}.${name}` : name;
    if (typeof value === "string" && IMAGE_URL.test(value)) out.push([slot, value]);
    else if (value && typeof value === "object") out.push(...pictureSlots(value, slot));
  }
  return out;
}

// "cards.base:gorrum:headbutt" -> "Headbutt · cards, base:gorrum"
export function pictureTitle(slot) {
  const [group, ...rest] = String(slot).split(".");
  const id = rest.join(".");
  if (!id) return group.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
  const parts = id.split(":");
  const name = parts.pop().replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
  return `${name} · ${group}${parts.length ? `, ${parts.join(":")}` : ""}`;
}

// soundFiles: SOUND_FILES from sound-files.js. games: [{ id, name, assets }].
export function buildCatalog({ soundFiles = {}, games = [], takes = {}, sources = {}, pictureSource = "" }) {
  const entries = [];
  for (const [cue, url] of Object.entries(soundFiles)) {
    const key = `sound:global:${cue}`;
    entries.push(soundEntry({ key, game: "global", gameName: "All games", cue, url, take: takes[key], source: sources[key], play: { scope: "global", cue } }));
  }
  for (const cue of UI_TICKS) {
    const key = `sound:ui:${cue}`;
    entries.push(soundEntry({ key, game: "ui", gameName: "UI ticks", cue, url: null, source: "Synth only (UI tick, by design)", play: { scope: "ui", cue } }));
  }
  for (const game of games) {
    const assets = game.assets || {};
    for (const [cue, url] of Object.entries(assets.sounds || {})) {
      const key = `sound:${game.id}:${cue}`;
      entries.push(soundEntry({ key, game: game.id, gameName: game.name, cue, url, take: takes[key], source: sources[key], play: { scope: "game", game: game.id, cue } }));
    }
    for (const [slot, url] of pictureSlots(assets)) {
      entries.push({
        key: `picture:${game.id}:${slot}`,
        kind: "picture",
        game: game.id,
        gameName: game.name,
        label: slot,
        title: pictureTitle(slot),
        path: pathOf(url),
        hasFile: true,
        source: pictureSource,
        prompt: "",
        url,
        sources: [{ id: "shipped", label: "Shipped picture", url }],
      });
    }
  }
  return entries;
}

export const STATUS_FILTERS = ["all", "unreviewed", "approved", "rejected", "regenerate"];

// Filter entries by kind, game, status and free text, given the review map.
export function filterEntries(entries, reviews, { kind = "all", game = "all", status = "all", text = "" } = {}) {
  const needle = String(text || "").trim().toLowerCase();
  return entries.filter((entry) => {
    if (kind !== "all" && entry.kind !== kind) return false;
    if (game !== "all" && entry.game !== game) return false;
    const review = reviews[entry.key];
    const state = review ? review.status : "pending";
    if (status === "unreviewed" && state !== "pending") return false;
    if ((status === "approved" || status === "rejected") && state !== status) return false;
    if (status === "regenerate" && !(review && review.regenerate)) return false;
    if (needle && !`${entry.label} ${entry.gameName} ${entry.path} ${entry.source}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function progressOf(entries, reviews) {
  const counts = { total: entries.length, approved: 0, rejected: 0, pending: 0, regenerate: 0 };
  for (const entry of entries) {
    const review = reviews[entry.key];
    counts[review ? review.status : "pending"] += 1;
    if (review && review.regenerate) counts.regenerate += 1;
  }
  counts.reviewed = counts.approved + counts.rejected;
  return counts;
}
