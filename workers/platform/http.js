// Platform HTTP + CORS helpers, extracted from the Worker entry so request/
// response plumbing has one owner. Pure: no game logic, no persistence. The
// Worker imports json/readJson/corsHeadersFor; allowedOrigins + baseCorsHeaders
// stay module-private.

const allowedOrigins = new Set([
  "https://sogotable.sogodojo.com",
  "https://sogotable.pages.dev",
]);

const baseCorsHeaders = {
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  // Lets the cross-origin client read the deploy id (versionHeadersFor below).
  "Access-Control-Expose-Headers": "X-SogoTable-Worker-Version",
};

// The Worker's deploy id (Cloudflare version_metadata binding). Clients use a
// change in it as a hint to check for a new front end (client/app-update.js).
// Absent locally/in tests → no header, so nothing downstream reacts.
function versionHeadersFor(env) {
  const id = env && env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id;
  return id ? { "X-SogoTable-Worker-Version": String(id) } : {};
}

async function readJson(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function json(payload, status = 200, headers = baseCorsHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function corsHeadersFor(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return { ...baseCorsHeaders, "Access-Control-Allow-Origin": "*" };
  if (
    allowedOrigins.has(origin) ||
    /^https:\/\/[a-z0-9-]+\.sogotable\.pages\.dev$/.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  ) {
    return { ...baseCorsHeaders, "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  return null;
}


export { json, readJson, corsHeadersFor, versionHeadersFor };
