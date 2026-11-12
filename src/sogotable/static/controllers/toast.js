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
export function showToast(message, options = {}) {
  if (typeof document === "undefined") return;
  const text = String(message || "").trim();
  if (!text) return;
  const kind = options.kind || "error";
  const host = toastHost();
  while (host.children.length >= MAX_VISIBLE) host.firstElementChild.remove();
  const toast = document.createElement("button");
  toast.type = "button";
  toast.className = `toast toast-${kind}`;
  toast.textContent = text;
  toast.setAttribute("aria-label", `${text} (tap to dismiss)`);
  const dismiss = () => {
    toast.classList.add("toast-leaving");
    setTimeout(() => toast.remove(), 180);
  };
  toast.addEventListener("click", dismiss);
  host.appendChild(toast);
  setTimeout(dismiss, options.durationMs || DEFAULT_DURATION_MS);
}

export function showInfoToast(message) {
  showToast(message, { kind: "info" });
}
