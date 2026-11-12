// Deploy-version awareness owner: the revision label (revision.json) and
// service worker registration. Auto-update (version watch, safe-reload gate,
// update overlay) will land here next. Load-safe: nothing runs at import time.
// Must not import app.js.

export async function refreshRevisionSummary() {
  const host = document.getElementById("revisionSummary");
  if (!host) return;
  try {
    const data = await fetchRevisionStatus();
    host.textContent = data.status.summary;
  } catch {
    host.textContent = "revision unavailable";
  }
}

export async function fetchRevisionStatus() {
  try {
    const response = await fetch("/revision.json", { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("application/json")) {
      const data = await response.json();
      if (data.ok && data.status && data.status.summary) return data;
    }
  } catch {
    // Static Pages can briefly lag the asset refresh.
  }
  throw new Error("revision unavailable");
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.warn("SogoTable service worker unavailable.", error);
    });
  });
}
