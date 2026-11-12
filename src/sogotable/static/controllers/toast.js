// Non-blocking toast notices — the in-app replacement for window.alert(). A
// leaf module with no ctx: any controller (or the shell) imports showToast and
// calls it with a message. Toasts stack at the bottom of the screen, announce
// through an aria-live region, and dismiss on tap or after a few seconds.
// DOM is touched only at call time so the module imports cleanly in Node.

const DEFAULT_DURATION_MS = 4200;
const MAX_VISIBLE = 3;

function toastHost() {
  let host = document.getElementById("toastHost");
  if (host) return host;
  host = document.createElement("div");
  host.id = "toastHost";
  host.className = "toast-host";
  host.setAttribute("role", "status");
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  return host;
}

// kind: "error" (default for thrown errors), "info", or "success".
// options.action = { label, onClick } adds a button (e.g. "Go" to jump to a
// game); the toast then becomes a row with that button and a dismiss button,
// because a button cannot sit inside the plain tap-to-dismiss toast button.
export function showToast(message, options = {}) {
  if (typeof document === "undefined") return;
  const text = String(message || "").trim();
  if (!text) return;
  const kind = options.kind || "error";
  const host = toastHost();
  while (host.children.length >= MAX_VISIBLE) host.firstElementChild.remove();
  const action = options.action && options.action.label ? options.action : null;
  const toast = document.createElement(action ? "div" : "button");
  toast.className = `toast toast-${kind}${action ? " toast-with-action" : ""}`;
  const dismiss = () => {
    toast.classList.add("toast-leaving");
    setTimeout(() => toast.remove(), 180);
  };
  if (action) {
    const label = document.createElement("span");
    label.textContent = text;
    const go = document.createElement("button");
    go.type = "button";
    go.className = "toast-action";
    go.textContent = action.label;
    go.addEventListener("click", () => { dismiss(); action.onClick(); });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-dismiss";
    close.textContent = "×";
    close.setAttribute("aria-label", "Dismiss");
    close.addEventListener("click", dismiss);
    toast.append(label, go, close);
  } else {
    toast.type = "button";
    toast.textContent = text;
    toast.setAttribute("aria-label", `${text} (tap to dismiss)`);
    toast.addEventListener("click", dismiss);
  }
  host.appendChild(toast);
  setTimeout(dismiss, options.durationMs || DEFAULT_DURATION_MS);
}

export function showInfoToast(message) {
  showToast(message, { kind: "info" });
}
