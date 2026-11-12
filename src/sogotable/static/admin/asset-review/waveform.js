// Asset Review: decode a sound file, measure it, and draw its waveform.
//
// Measurements follow docs/SOUNDS.md: peak (target about -1.5 dBFS), RMS level
// (a rough loudness; clips under 0.4 s are too short for LUFS gating), clipped
// samples, leading silence (a "hard start" check), duration and file size
// (target under ~40 KB). Results are cached per URL.

const BUCKETS = 400;
const cache = new Map();
let context = null;

function audioContext() {
  if (!context) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error("This browser has no Web Audio.");
    context = new Ctor();
  }
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function measure(buffer, bytes) {
  const channel = buffer.getChannelData(0);
  const n = channel.length;
  let peak = 0;
  let sumSquares = 0;
  let clipped = 0;
  let lead = -1;
  const mins = new Float32Array(BUCKETS);
  const maxs = new Float32Array(BUCKETS);
  const per = Math.max(1, Math.floor(n / BUCKETS));
  for (let i = 0; i < n; i += 1) {
    const v = channel[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped += 1;
    if (lead < 0 && a > 0.0032) lead = i; // -50 dBFS, the trim threshold
    sumSquares += v * v;
    const b = Math.min(BUCKETS - 1, Math.floor(i / per));
    if (v < mins[b]) mins[b] = v;
    if (v > maxs[b]) maxs[b] = v;
  }
  return {
    buffer,
    bytes,
    duration: buffer.duration,
    peakDb: toDb(peak),
    rmsDb: toDb(Math.sqrt(sumSquares / Math.max(1, n))),
    clipped,
    leadMs: lead < 0 ? 0 : (lead / buffer.sampleRate) * 1000,
    mins,
    maxs,
  };
}

export function analyse(url) {
  if (!cache.has(url)) {
    const job = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      const data = await response.arrayBuffer();
      const buffer = await new Promise((resolve, reject) => {
        const p = audioContext().decodeAudioData(data.slice(0), resolve, reject);
        if (p && p.then) p.then(resolve, reject);
      });
      return measure(buffer, data.byteLength);
    })();
    job.catch(() => cache.delete(url));
    cache.set(url, job);
  }
  return cache.get(url);
}

// Play a decoded buffer at `gain` (0..1). With matchDb, gain is adjusted so the
// RMS level lands on matchDb, which makes A/B comparisons fair.
export function playBuffer(analysis, { gain = 0.5, matchDb = null, onEnd } = {}) {
  const ctx = audioContext();
  const source = ctx.createBufferSource();
  const amp = ctx.createGain();
  let level = gain;
  if (matchDb != null && Number.isFinite(analysis.rmsDb)) level *= 10 ** ((matchDb - analysis.rmsDb) / 20);
  amp.gain.value = Math.min(4, level);
  source.buffer = analysis.buffer;
  source.connect(amp);
  amp.connect(ctx.destination);
  const startedAt = ctx.currentTime;
  source.onended = () => onEnd && onEnd();
  source.start();
  return {
    stop: () => { try { source.stop(); } catch { /* already stopped */ } },
    progress: () => Math.min(1, (ctx.currentTime - startedAt) / analysis.duration),
  };
}

export function drawWaveform(canvas, analysis, progress = 0) {
  if (!canvas || !analysis) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 300;
  const height = canvas.clientHeight || 64;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const g = canvas.getContext("2d");
  g.scale(dpr, dpr);
  const style = getComputedStyle(canvas);
  const ink = style.getPropertyValue("--ar-wave").trim() || "#1e63d6";
  const played = style.getPropertyValue("--ar-wave-played").trim() || "#d71920";
  const clip = style.getPropertyValue("--ar-clip").trim() || "#b42318";
  const mid = height / 2;
  const step = width / BUCKETS;
  for (let i = 0; i < BUCKETS; i += 1) {
    const lo = analysis.mins[i];
    const hi = analysis.maxs[i];
    g.fillStyle = Math.max(-lo, hi) >= 0.999 ? clip : i / BUCKETS <= progress ? played : ink;
    g.fillRect(i * step, mid - hi * mid, Math.max(1, step - 0.3), Math.max(1, (hi - lo) * mid));
  }
  g.fillStyle = style.getPropertyValue("--ar-line").trim() || "#ccc";
  g.fillRect(0, mid, width, 1);
}

export function formatDb(db) {
  return Number.isFinite(db) ? `${db.toFixed(1)} dBFS` : "silent";
}
