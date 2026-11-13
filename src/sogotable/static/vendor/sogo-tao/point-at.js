// SogoPointAt v1.0 (2026-11-13) - the admin component selector ("Point at it", ◎). Canon: sogo-tao specs/POINT-AT.md.
// Master: github.com/JohnSOGO/sogo-tao specs/shared/point-at.js. Apps keep a copy; update the copy, never fork it.
//
// What it does: once the app turns it on for MojoSOGO's account, a faint ◎ circle sits bottom left. Tap it (or Alt+P),
// then tap anything: that element gets outlined and a short description of it (app, screen, where, element, selector,
// screen size) is copied to the clipboard, to paste into a Claude chat. Tap ◎ again or press Escape to stop. While
// picking, taps never reach the page, so nothing gets clicked by accident.
//
// The app owns the gate. Nothing shows and no listeners exist until the app calls, from its own admin check:
//   SogoPointAt.setEnabled(isAdmin, { app: "SogoTABLE", context: () => "Screen: lobby" });
// `context` is optional: a function returning one line of the app's own state (screen, open game, open photo).
// Adapted from SogoPHOTO public/pick.js (MS-009), which keeps its own copy for now.
(() => {
  if (window.SogoPointAt) return;
  const P = "sogo-pa", HOVER = P + "-hover", PICKED = P + "-picked", ON = P + "-on";
  const TOAST_MS = 1200, TOAST_AFTER_HOLD_MS = 1500;
  const TARGETS = "button, a, input, select, textarea, label, img, video, canvas, svg, summary, li, td, th, [role], [aria-label], [data-pick], [id]";
  const clip = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
  const esc = s => (window.CSS?.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, c => "\\" + c));
  const opts = { app: document.title || location.host, context: null };
  let fab = null, style = null, toast = null, toastTimer = 0, picking = false, hovered = null, stoppedAt = 0, pressed = null, observer = null;

  const CSS_TEXT = `
.${P}-fab{position:fixed;left:calc(8px + env(safe-area-inset-left));bottom:calc(8px + env(safe-area-inset-bottom));z-index:2147483000;width:32px;height:32px;min-width:0;min-height:0;margin:0;padding:0;border-radius:99px;background:#1b1726;border:1px solid #4b4560;color:#c9c3d9;opacity:.55;font:18px/1 Arial,sans-serif;cursor:pointer;box-shadow:none}
.${P}-fab:hover{opacity:1}
html.${ON} .${P}-fab{opacity:1;color:#0b0f14;background:#f59e0b;border-color:#fbbf24;box-shadow:0 0 0 4px #f59e0b55}
html.${ON},html.${ON} *{cursor:crosshair!important}
.${HOVER}{outline:2px solid #f59e0b!important;outline-offset:2px}
.${PICKED}{outline:3px solid #22c55e!important;outline-offset:2px}
.${P}-toast{position:fixed;left:50%;transform:translate(-50%);z-index:2147483001;width:min(520px,calc(100vw - 24px));box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #7c6cff;background:#1b1726;color:#f3effa;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text;box-shadow:0 10px 30px #00000080}
.${P}-toast strong{display:block;margin-bottom:4px;font-family:inherit}`;

  // Describing the tapped element.
  const target = el => el.closest(TARGETS) ?? el;
  function selector(el) {
    const out = [];
    for (let n = el; n && n.tagName !== "HTML"; n = n.parentElement) {
      if (n.id && !/^\d/.test(n.id)) { out.unshift("#" + esc(n.id)); break; }
      let s = n.tagName.toLowerCase() + [...n.classList].filter(c => !c.startsWith(P)).slice(0, 2).map(c => "." + esc(c)).join("");
      const sibs = n.parentElement ? [...n.parentElement.children].filter(x => x.tagName === n.tagName) : [];
      if (sibs.length > 1) s += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      out.unshift(s);
      if (n.tagName === "BODY") break;
    }
    return out.join(" > ");
  }
  function kind(el) {
    const t = el.tagName.toLowerCase();
    if (t === "input") return ["checkbox", "radio"].includes(el.type) ? "checkbox" : ["button", "submit"].includes(el.type) ? "button" : "field";
    return { button: "button", summary: "menu", a: "link", textarea: "field", select: "select", img: "picture", video: "video", canvas: "canvas", svg: "drawing", li: "row", td: "cell", th: "cell" }[t]
      ?? el.getAttribute("role") ?? "text";
  }
  const name = el => el.getAttribute("aria-label") || clip(el.textContent, 60) || el.getAttribute("title") || el.getAttribute("placeholder") || el.getAttribute("alt") || "";
  function describe(raw) {
    const el = target(raw), groups = [];
    for (let p = el.parentElement; p && p.tagName !== "BODY"; p = p.parentElement) {
      const h = p.matches("section, dialog, [role=dialog], .card, .modal") ? p.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope h2") : null;
      const label = p.getAttribute("aria-label") || (h ? clip(h.textContent, 30) : "");
      if (label && !groups.includes(label)) groups.unshift(label);
    }
    let ctx = ""; try { ctx = opts.context ? clip(opts.context(), 160) : ""; } catch {}
    const n = clip(name(el), 50), pick = el.closest("[data-pick]")?.dataset.pick;
    return [`${opts.app} pick${ctx ? ": " + ctx : ""}`,
            groups.length ? `Where: ${groups.join(" > ")}` : "",
            `Element: ${n ? `${kind(el)} "${n}"` : kind(el)}`,
            pick ? `Id: ${pick}` : "",
            `Selector: ${selector(el)}`,
            `Screen: ${innerWidth}x${innerHeight}${innerWidth < 700 ? " (phone)" : ""}`].filter(Boolean).join("\n");
  }

  // The note goes inside the open modal dialog when there is one (a modal hides everything else).
  const host = () => [...document.querySelectorAll("dialog[open]")].pop() ?? document.body;
  const inToast = e => e.target instanceof Element && e.target.closest(`.${P}-toast`);
  function showToast(text, copied, y) {
    hideToast();
    toast = document.createElement("div");
    toast.className = P + "-toast"; toast.setAttribute("role", "status");
    const s = document.createElement("strong");
    s.textContent = copied == null ? "Copying…" : copied ? "✓ Copied. Paste it into Claude." : "Copy blocked: select this text and copy it.";
    toast.append(s, text);
    // Show it on the half of the screen away from what was tapped. Press and hold it to keep it.
    Object.assign(toast.style, (y ?? innerHeight) > innerHeight / 2 ? { top: "calc(env(safe-area-inset-top) + 12px)" } : { bottom: "calc(env(safe-area-inset-bottom) + 12px)" });
    toast.addEventListener("pointerdown", () => clearTimeout(toastTimer));
    toast.addEventListener("pointerup", () => { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, TOAST_AFTER_HOLD_MS); });
    host().append(toast);
    if (copied != null) toastTimer = setTimeout(hideToast, copied ? TOAST_MS : TOAST_MS * 3);
  }
  function hideToast() { toast?.remove(); toast = null; clearTimeout(toastTimer); }
  const hover = el => { if (hovered !== el) { hovered?.classList.remove(HOVER); hovered = el; hovered?.classList.add(HOVER); } };
  const clearPicked = () => document.querySelectorAll("." + PICKED).forEach(x => x.classList.remove(PICKED));
  const swallow = e => { if (inToast(e)) return; if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); };

  // Press: outline and show the note at once. The copy waits for the release (iPhone allows it only from touchend).
  function onPress(e) {
    if (inToast(e)) return;
    swallow(e);
    if (!(e.target instanceof Element) || e.target.closest(`.${P}-fab`)) { pressed = null; return; }
    const text = describe(e.target);
    clearPicked(); target(e.target).classList.add(PICKED);
    pressed = { text };
    showToast(text, null, e.touches?.[0]?.clientY ?? e.clientY);
  }
  async function onRelease(e) {
    if (inToast(e)) return;
    if (e.type === "pointerup" && e.pointerType === "touch") return swallow(e);
    swallow(e);
    if (!(e.target instanceof Element)) return;
    if (e.target.closest(`.${P}-fab`)) return setPicking(false);
    const text = pressed?.text ?? describe(e.target); pressed = null;
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch {}
    showToast(text, copied, e.changedTouches?.[0]?.clientY ?? e.clientY);
  }
  const onOver = e => { if (e.target instanceof Element && !e.target.closest(`.${P}-fab, .${P}-toast`)) hover(target(e.target)); };
  const EVENTS = [["pointerdown", e => e.pointerType === "touch" ? swallow(e) : onPress(e)], ["mousedown", swallow], ["touchstart", onPress],
                  ["pointerup", onRelease], ["mouseup", swallow], ["touchend", onRelease], ["click", swallow], ["dblclick", swallow],
                  ["contextmenu", swallow], ["submit", swallow], ["dragstart", swallow], ["mouseover", onOver]];
  const OPTS = { capture: true, passive: false };
  function setPicking(on) {
    if (on === picking) return;
    picking = on;
    document.documentElement.classList.toggle(ON, on);
    for (const [t, f] of EVENTS) on ? addEventListener(t, f, OPTS) : removeEventListener(t, f, OPTS);
    if (!on) { hover(null); stoppedAt = Date.now(); hideToast(); clearPicked(); }
  }
  const onKey = e => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyP") { e.preventDefault(); setPicking(!picking); }
    else if (e.key === "Escape" && picking) { e.preventDefault(); e.stopImmediatePropagation(); setPicking(false); }
  };
  const onOutside = e => { if (toast && !picking && !inToast(e)) hideToast(); };

  function mount() {
    style = document.createElement("style"); style.textContent = CSS_TEXT; document.head.append(style);
    fab = document.createElement("button");
    fab.className = P + "-fab"; fab.type = "button"; fab.textContent = "◎";
    fab.title = "Point at it: tap, then tap anything to copy where it is for Claude (Alt+P)";
    fab.setAttribute("aria-label", "Point at it");
    fab.addEventListener("click", () => { if (Date.now() - stoppedAt > 600) setPicking(!picking); });
    host().append(fab);
    addEventListener("keydown", onKey, true);
    addEventListener("pointerdown", onOutside, true);
    // Follow an open modal dialog so the circle stays tappable.
    observer = new MutationObserver(() => { const h = host(); if (fab.parentElement !== h) h.append(fab); });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  }
  function unmount() {
    setPicking(false); hideToast();
    observer?.disconnect(); fab?.remove(); style?.remove(); fab = style = observer = null;
    removeEventListener("keydown", onKey, true); removeEventListener("pointerdown", onOutside, true);
  }

  window.SogoPointAt = {
    version: "1.0",
    // The only switch. Call it from the app's admin check, every time that check may change (sign in, sign out).
    setEnabled(on, o = {}) {
      Object.assign(opts, Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)));
      if (on && !fab) { if (document.body) mount(); else addEventListener("DOMContentLoaded", () => fab || mount(), { once: true }); }
      else if (!on && fab) unmount();
    },
    get enabled() { return Boolean(fab); },
  };
})();
