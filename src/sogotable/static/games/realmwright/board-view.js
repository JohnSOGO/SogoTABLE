// Realmwright — board camera + gestures (pan / pinch / wheel zoom / tap).
//
// Pure view plumbing: it moves a camera over the board SVG and reports taps in
// world units (100 units per tile; tile (x,y) spans [100x, 100x+100]). It
// knows nothing about rules. The camera object lives in the renderer's
// per-room state so snapshots (full re-renders) never reset the view.
export const ZOOM_MIN = 0.16;
export const ZOOM_MAX = 2.6;
const TAP_SLOP = 8;

export function newCamera() {
  return { x: 0, y: 0, z: 0.8, fitted: false };
}

export function applyCamera(viewport, cam) {
  const g = viewport && viewport.querySelector(".rw-cam");
  if (g) g.setAttribute("transform", `translate(${cam.x.toFixed(2)} ${cam.y.toFixed(2)}) scale(${cam.z.toFixed(4)})`);
}

export function zoomAt(cam, factor, sx, sy) {
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.z * factor));
  const k = z / cam.z;
  cam.x = sx - (sx - cam.x) * k;
  cam.y = sy - (sy - cam.y) * k;
  cam.z = z;
}

// bounds: { minX, minY, maxX, maxY } in tile coords (inclusive cells).
// minZoom keeps tiles legible on a phone: a big realm is centred, not shrunk
// to specks (pan to see the rest).
export function fitCamera(cam, bounds, width, height, { pad = 24, maxZoom = 1.05, minZoom = 0.36 } = {}) {
  if (!bounds || !width || !height) return false;
  const w = (bounds.maxX - bounds.minX + 1) * 100;
  const h = (bounds.maxY - bounds.minY + 1) * 100;
  const z = Math.max(ZOOM_MIN, minZoom, Math.min(maxZoom, (width - pad * 2) / w, (height - pad * 2) / h));
  cam.z = z;
  cam.x = (width - w * z) / 2 - bounds.minX * 100 * z;
  cam.y = (height - h * z) / 2 - bounds.minY * 100 * z;
  cam.fitted = true;
  return true;
}

// Smoothly move the camera to `to` ({x,y,z}) over `ms` (ease in-out) with
// requestAnimationFrame. Any running tween on the same camera is replaced;
// reduced motion jumps straight there. Returns a cancel function.
export function tweenCamera(viewport, cam, to, { ms = 300, reduced = false, onDone } = {}) {
  cancelTween(cam);
  const from = { x: cam.x, y: cam.y, z: cam.z };
  const finish = () => { cam.x = to.x; cam.y = to.y; cam.z = to.z; cam.tween = null; applyCamera(viewport, cam); if (onDone) onDone(); };
  if (reduced || typeof requestAnimationFrame === "undefined") { finish(); return () => {}; }
  const t0 = performance.now();
  const tween = { raf: 0, to: { x: to.x, y: to.y, z: to.z } };
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2; // ease in-out: the whole second reads as motion
    if (k >= 1) { finish(); return; }
    cam.x = from.x + (to.x - from.x) * e;
    cam.y = from.y + (to.y - from.y) * e;
    cam.z = from.z + (to.z - from.z) * e;
    applyCamera(viewport, cam);
    tween.raf = requestAnimationFrame(step);
  };
  tween.raf = requestAnimationFrame(step);
  cam.tween = tween;
  return () => cancelTween(cam);
}

export function cancelTween(cam) {
  if (cam.tween) { cancelAnimationFrame(cam.tween.raf); cam.tween = null; }
}

// Wire gestures once per viewport element. getCam() returns the live camera
// (the per-room state object); onTap(wx, wy) receives world coordinates;
// onManual() fires when the player pans or zooms by hand (a drag, a pinch or
// the wheel — not a tap). Pointers on .rw-overlay panels are left alone.
export function attachGestures(viewport, { getCam, onTap, onManual = () => {} }) {
  const onOverlay = (e) => Boolean(e.target && e.target.closest && e.target.closest(".rw-zoom, .rw-overlay"));
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  const local = (e) => {
    const rect = viewport.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  viewport.addEventListener("pointerdown", (e) => {
    if (onOverlay(e)) return;
    pointers.set(e.pointerId, local(e));
    try { viewport.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (pointers.size === 1) {
      const [sx, sy] = local(e);
      const cam = getCam();
      drag = { sx, sy, cx: cam.x, cy: cam.y, moved: false, t: Date.now() };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      if (drag) drag.moved = true;
      cancelTween(getCam());
      onManual();
    }
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    const cam = getCam();
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      cam.x += mid[0] - pinch.mid[0];
      cam.y += mid[1] - pinch.mid[1];
      zoomAt(cam, dist / pinch.dist, mid[0], mid[1]);
      pinch = { dist, mid };
      applyCamera(viewport, cam);
      return;
    }
    if (!drag) return;
    const [sx, sy] = local(e);
    if (!drag.moved && Math.hypot(sx - drag.sx, sy - drag.sy) < TAP_SLOP) return;
    if (!drag.moved) { cancelTween(cam); onManual(); drag.cx = cam.x; drag.cy = cam.y; }
    drag.moved = true;
    viewport.classList.add("rw-dragging");
    cam.x = drag.cx + (sx - drag.sx);
    cam.y = drag.cy + (sy - drag.sy);
    applyCamera(viewport, cam);
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const wasSingleTap = pointers.size === 1 && drag && !drag.moved && e.type === "pointerup" && Date.now() - drag.t < 700;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      viewport.classList.remove("rw-dragging");
      if (wasSingleTap) {
        const [sx, sy] = local(e);
        const cam = getCam();
        onTap((sx - cam.x) / cam.z, (sy - cam.y) / cam.z);
      }
      drag = null;
    } else if (pointers.size === 1) {
      // Continue as a drag from the remaining finger.
      const [p] = [...pointers.values()];
      const cam = getCam();
      drag = { sx: p[0], sy: p[1], cx: cam.x, cy: cam.y, moved: true, t: Date.now() };
    }
  };
  viewport.addEventListener("pointerup", end);
  viewport.addEventListener("pointercancel", end);

  viewport.addEventListener("wheel", (e) => {
    if (onOverlay(e)) return;
    e.preventDefault();
    const [sx, sy] = local(e);
    const cam = getCam();
    cancelTween(cam);
    onManual();
    zoomAt(cam, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), sx, sy);
    applyCamera(viewport, cam);
  }, { passive: false });
}
