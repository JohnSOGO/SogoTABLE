// Dev inspector — SHIFT+CLICK any element to copy a locator (and flash it in a
// bottom toast) so you can tell Claude exactly which field you mean. Desktop only;
// passive otherwise (it only fires on shift+click, a chord the app never uses).
// To remove: delete this file and its <script> tag in index.html.
(function () {
  function locatorFor(el) {
    const parts = [];
    let node = el, depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      let seg = node.tagName.toLowerCase();
      if (node.id) seg += "#" + node.id;
      else if (node.classList && node.classList.length) seg += "." + Array.from(node.classList).slice(0, 3).join(".");
      const label = node.getAttribute && (node.getAttribute("data-field") || node.getAttribute("aria-label"));
      if (label) seg += `[${label}]`;
      parts.unshift(seg);
      if (node.id) break;            // an id is unique enough to stop the path
      node = node.parentElement; depth++;
    }
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
    return parts.join(" > ") + (text ? `  «${text}»` : "");
  }

  function toast(msg) {
    let t = document.getElementById("devInspectToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "devInspectToast";
      t.style.cssText =
        "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;" +
        "max-width:92vw;background:#1b1726;color:#f3effa;border:1px solid #7c6cff;border-radius:10px;" +
        "padding:9px 13px;font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;" +
        "box-shadow:0 6px 22px rgba(0,0,0,.5);white-space:pre-wrap;word-break:break-word;pointer-events:none;";
      document.body.appendChild(t);
    }
    t.textContent = "📋 " + msg;
    t.style.transition = ""; t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.transition = "opacity .4s"; t.style.opacity = "0"; }, 4500);
  }

  window.addEventListener("click", (e) => {
    if (!e.shiftKey) return;
    e.preventDefault(); e.stopPropagation();   // don't also trigger the element's real action
    const loc = locatorFor(e.target);
    try { navigator.clipboard.writeText(loc); } catch (_) {}
    try { console.log("[inspect]", loc); } catch (_) {}   // fallback if clipboard is blocked
    toast(loc + "\n(copied — paste it to Claude)");
  }, true);
})();
