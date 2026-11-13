// Asset Review: markup only. Takes prepared state from index.js and returns
// HTML strings; event wiring and playback stay in index.js.
import { escapeHtml as esc } from "../../html-utils.js";
import { formatDb } from "./waveform.js";

const STATUS_LABEL = { pending: "Not reviewed", approved: "Approved", rejected: "Rejected" };

export const SHORTCUTS = [
  ["j / ↓", "Next asset"],
  ["k / ↑", "Previous asset"],
  [".", "Next unreviewed"],
  ["Space", "Play the selected source"],
  ["1 – 6", "Play source 1 to 6"],
  ["g", "Play it the way the game does"],
  ["a / b", "Mark the selected source as A / B"],
  ["x", "Play A, then B"],
  ["p", "Pick the selected source as the one to use"],
  ["y", "Approve and open the next unreviewed"],
  ["n", "Reject"],
  ["u", "Back to not reviewed"],
  ["r", "Toggle “regenerate with my note”"],
  ["e or /", "Write a note"],
  ["Esc", "Leave the note box"],
  ["?", "Show or hide shortcuts"],
];

function option(value, label, current) {
  return `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`;
}

export function renderToolbar({ progress, filters, games, volume, matchLoudness, soundOn, saving, error }) {
  const pct = progress.total ? Math.round((progress.reviewed / progress.total) * 100) : 0;
  const kinds = [["all", "All"], ["sound", "Sounds"], ["picture", "Pictures"]];
  return `
  <div class="ar-card ar-toolbar">
    <div class="ar-progress" title="${progress.reviewed} of ${progress.total} reviewed">
      <div class="ar-progress-bar"><span style="width:${pct}%"></span></div>
      <div class="ar-counts">
        <span><b>${progress.reviewed}</b>/${progress.total} reviewed</span>
        <span class="ar-chip ar-approved">✓ ${progress.approved}</span>
        <span class="ar-chip ar-rejected">✗ ${progress.rejected}</span>
        <span class="ar-chip ar-regen">↻ ${progress.regenerate}</span>
        <span class="ar-save-state">${error ? `<span class="ar-error">${esc(error)}</span>` : saving ? "Saving…" : "All saved"}</span>
      </div>
    </div>
    <div class="ar-filters">
      <div class="ar-seg" role="group" aria-label="Kind">
        ${kinds.map(([v, l]) => `<button type="button" data-ar-kind="${v}" aria-pressed="${filters.kind === v}">${l}</button>`).join("")}
      </div>
      <select data-ar-filter="game" aria-label="Game">
        ${option("all", "All games", filters.game)}
        ${games.map((g) => option(g.id, g.name, filters.game)).join("")}
      </select>
      <select data-ar-filter="status" aria-label="Status">
        ${option("all", "Any status", filters.status)}
        ${option("unreviewed", "Not reviewed", filters.status)}
        ${option("approved", "Approved", filters.status)}
        ${option("rejected", "Rejected", filters.status)}
        ${option("regenerate", "Regenerate", filters.status)}
      </select>
      <input type="search" data-ar-filter="text" placeholder="Search" value="${esc(filters.text)}" aria-label="Search assets" />
    </div>
    <div class="ar-actions">
      <button type="button" class="ar-btn" data-ar-action="next-unreviewed">Next unreviewed</button>
      <label class="ar-volume">Volume <input type="range" min="0" max="100" value="${Math.round(volume * 100)}" data-ar-volume aria-label="Review volume" /></label>
      <label class="ar-check"><input type="checkbox" data-ar-match${matchLoudness ? " checked" : ""} /> Match loudness</label>
      <button type="button" class="ar-btn ar-secondary" data-ar-action="export-md">Markdown</button>
      <button type="button" class="ar-btn ar-secondary" data-ar-action="export-json">JSON</button>
      <button type="button" class="ar-btn ar-secondary" data-ar-action="copy-md">Copy</button>
      <button type="button" class="ar-btn ar-secondary" data-ar-action="shortcuts" aria-label="Keyboard shortcuts">?</button>
    </div>
    ${soundOn ? "" : `<div class="ar-banner">Game sound is off on this device, so “In game” and synth previews are silent. <button type="button" class="ar-btn" data-ar-action="sound-on">Turn sound on</button></div>`}
  </div>`;
}

export function renderShortcuts() {
  return `<div class="ar-card ar-shortcuts"><h3>Keyboard shortcuts</h3><dl>${SHORTCUTS.map(([k, d]) => `<dt><kbd>${esc(k)}</kbd></dt><dd>${esc(d)}</dd>`).join("")}</dl></div>`;
}

function statusChip(review) {
  const status = review ? review.status : "pending";
  return `<span class="ar-chip ar-${status}">${STATUS_LABEL[status]}</span>${review && review.regenerate ? `<span class="ar-chip ar-regen">↻ Regenerate</span>` : ""}`;
}

function rowHead(entry, review, selected) {
  const thumb = entry.kind === "picture"
    ? `<img class="ar-thumb" src="${esc(entry.url)}" alt="" loading="lazy" />`
    : `<span class="ar-thumb ar-sound-icon" aria-hidden="true">${entry.hasFile ? "🔊" : "🎹"}</span>`;
  const note = review && review.note ? `<span class="ar-note-snippet">${esc(review.note.slice(0, 80))}</span>` : "";
  return `<button type="button" class="ar-row-head" data-ar-select="${esc(entry.key)}" aria-expanded="${selected}">
    ${thumb}
    <span class="ar-row-text"><b>${esc(entry.title || entry.label)}</b><span class="ar-muted">${esc(entry.gameName)}${entry.sources.length > 2 ? ` · ${entry.sources.length - 1} versions` : ""}</span>${note}</span>
    <span class="ar-row-status">${statusChip(review)}</span>
  </button>`;
}

function statsHtml(analysis) {
  if (!analysis) return `<p class="ar-muted ar-stats">Measuring…</p>`;
  if (analysis.error) return `<p class="ar-error ar-stats">${esc(analysis.error)}</p>`;
  const kb = analysis.bytes / 1024;
  const warn = [];
  if (kb > 40) warn.push("over 40 KB");
  if (analysis.clipped > 0) warn.push(`${analysis.clipped} clipped samples`);
  if (analysis.leadMs > 30) warn.push(`${Math.round(analysis.leadMs)} ms silence at the start`);
  if (analysis.duration > 3.2) warn.push("long tail");
  return `<p class="ar-stats"><span>${analysis.duration.toFixed(2)} s</span><span>peak ${formatDb(analysis.peakDb)}</span><span>RMS ${formatDb(analysis.rmsDb)}</span><span>${kb.toFixed(1)} KB</span>${warn.map((w) => `<span class="ar-warn">⚠ ${esc(w)}</span>`).join("")}</p>`;
}

function verdictHtml(entry, review) {
  const status = review ? review.status : "pending";
  return `<div class="ar-verdict">
      <button type="button" class="ar-btn ar-ok" data-ar-status="approved" aria-pressed="${status === "approved"}">✓ Approve <kbd>y</kbd></button>
      <button type="button" class="ar-btn ar-bad" data-ar-status="rejected" aria-pressed="${status === "rejected"}">✗ Reject <kbd>n</kbd></button>
      <button type="button" class="ar-btn ar-secondary" data-ar-status="pending" aria-pressed="${status === "pending"}">Not reviewed <kbd>u</kbd></button>
      <label class="ar-check ar-regen-toggle"><input type="checkbox" data-ar-regen${review && review.regenerate ? " checked" : ""} /> Regenerate with my note <kbd>r</kbd></label>
    </div>
    <textarea class="ar-note" data-ar-note rows="3" maxlength="2000" placeholder="Feedback: what's wrong, what it should sound or look like…">${esc(review ? review.note : "")}</textarea>
    <p class="ar-muted ar-meta">${entry.source ? `Source: ${esc(entry.source)}<br/>` : ""}${entry.path ? `<code>${esc(entry.path)}</code>` : ""}${review && review.updated_at ? `<br/>Last saved ${esc(new Date(review.updated_at).toLocaleString())}${review.reviewer ? ` by ${esc(review.reviewer)}` : ""}` : ""}</p>`;
}

function soundDetail(entry, review, ui) {
  const chosen = (review && review.chosen_take) || "";
  const sources = entry.sources.map((s, i) => {
    const tags = [ui.a === s.id ? "A" : "", ui.b === s.id ? "B" : ""].filter(Boolean).map((t) => `<span class="ar-ab">${t}</span>`).join("");
    return `<button type="button" class="ar-source${ui.source === s.id ? " ar-selected" : ""}${ui.playing === s.id ? " ar-playing" : ""}" data-ar-source="${esc(s.id)}">
      <span class="ar-source-n">${i + 1}</span> ▶ ${esc(s.label)} ${tags}${chosen === s.id ? `<span class="ar-chip ar-approved">Picked</span>` : ""}
    </button>`;
  }).join("");
  const current = entry.sources.find((s) => s.id === ui.source) || entry.sources[0];
  return `<div class="ar-detail">
    <div class="ar-sources">${sources}</div>
    ${current.synth ? `<p class="ar-muted">The synth cue is built live, so it has no waveform. Use ▶ to hear it.</p>` : `<canvas class="ar-wave" data-ar-wave></canvas>${statsHtml(ui.analysis)}`}
    <div class="ar-row-btns">
      <button type="button" class="ar-btn" data-ar-action="play">▶ Play <kbd>Space</kbd></button>
      <button type="button" class="ar-btn ar-secondary" data-ar-action="in-game" title="Plays through the game's own code at game volume">▶ In game <kbd>g</kbd></button>
      <button type="button" class="ar-btn ar-secondary" data-ar-action="set-a">Set A <kbd>a</kbd></button>
      <button type="button" class="ar-btn ar-secondary" data-ar-action="set-b">Set B <kbd>b</kbd></button>
      <button type="button" class="ar-btn ar-secondary" data-ar-action="ab"${ui.a && ui.b ? "" : " disabled"}>▶ A then B <kbd>x</kbd></button>
      <button type="button" class="ar-btn ar-secondary" data-ar-action="pick">Use this one <kbd>p</kbd></button>
    </div>
    ${verdictHtml(entry, review)}
  </div>`;
}

function pictureDetail(entry, review, ui) {
  const dims = ui.picture ? `${ui.picture.width}×${ui.picture.height} px${ui.picture.bytes ? ` · ${(ui.picture.bytes / 1024).toFixed(1)} KB` : ""}` : "";
  return `<div class="ar-detail">
    <div class="ar-pictures ar-bg-${ui.backdrop}">
      <figure><img class="ar-picture-full" src="${esc(entry.url)}" alt="${esc(entry.label)}" data-ar-picture /><figcaption>Full size</figcaption></figure>
      <figure><div class="ar-in-game"><img src="${esc(entry.url)}" alt="" /></div><figcaption>In-game card size</figcaption></figure>
    </div>
    <p class="ar-muted">${esc(dims)}</p>
    <div class="ar-row-btns">
      <div class="ar-seg" role="group" aria-label="Backdrop">
        ${["light", "dark", "felt"].map((b) => `<button type="button" data-ar-backdrop="${b}" aria-pressed="${ui.backdrop === b}">${b[0].toUpperCase()}${b.slice(1)}</button>`).join("")}
      </div>
      <a class="ar-btn ar-secondary" href="${esc(entry.url)}" target="_blank" rel="noopener">Open file</a>
    </div>
    ${verdictHtml(entry, review)}
  </div>`;
}

export function renderList(entries, reviews, selectedKey, ui) {
  if (!entries.length) return `<p class="ar-muted ar-empty">Nothing matches these filters.</p>`;
  return entries.map((entry) => {
    const review = reviews[entry.key];
    const selected = entry.key === selectedKey;
    const detail = selected ? (entry.kind === "picture" ? pictureDetail(entry, review, ui) : soundDetail(entry, review, ui)) : "";
    return `<article class="ar-card ar-row${selected ? " ar-open" : ""}" data-ar-key="${esc(entry.key)}">${rowHead(entry, review, selected)}${detail}</article>`;
  }).join("");
}
