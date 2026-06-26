// Platform rate-limiting, extracted from the Worker entry. Wraps the Cloudflare
// rate-limit bindings and shapes 429 responses. Depends only on the HTTP helpers.
import { json, corsHeadersFor } from "./http.js";

const MUTATION_RATE_LIMIT_RETRY_SECONDS = 60;
const SUPERUSER_RATE_LIMIT_RETRY_SECONDS = 60;

async function rateLimitRequest(request, env, url) {
  if (request.method === "POST" && (url.pathname === "/api/superuser/verify" || url.pathname === "/api/player/reclaim" || url.pathname === "/api/bug-reports/clear")) {
    const limited = await rateLimitBinding(env.SUPERUSER_RATE_LIMITER, `superuser:${clientRateLimitKey(request)}`);
    if (limited) return rateLimitResponse("Too many superuser attempts. Try again shortly.", SUPERUSER_RATE_LIMIT_RETRY_SECONDS, corsHeadersFor(request));
  }
  if (!mutationRateLimitedMethod(request.method)) return null;
  const limited = await rateLimitBinding(env.API_MUTATION_RATE_LIMITER, `mutation:${clientRateLimitKey(request)}`);
  if (!limited) return null;
  return rateLimitResponse("Too many requests. Try again shortly.", MUTATION_RATE_LIMIT_RETRY_SECONDS, corsHeadersFor(request));
}

function mutationRateLimitedMethod(method) {
  return ["POST", "DELETE"].includes(method);
}

async function rateLimitBinding(binding, key) {
  if (!binding || typeof binding.limit !== "function") return false;
  const outcome = await binding.limit({ key });
  return outcome && outcome.success === false;
}

function clientRateLimitKey(request) {
  const headers = request.headers;
  const value = headers.get("cf-connecting-ip") || headers.get("x-forwarded-for") || headers.get("x-real-ip") || "unknown";
  return String(value).split(",")[0].trim() || "unknown";
}

function rateLimitResponse(message, retryAfterSeconds, corsHeaders) {
  return json({ ok: false, error: message }, 429, {
    ...corsHeaders,
    "Retry-After": String(retryAfterSeconds),
  });
}

export { rateLimitRequest };
