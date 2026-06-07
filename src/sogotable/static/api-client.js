const HOSTED_API_ORIGIN = "https://sogotable.sogodojo.com";

export async function api(url, payload) {
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!data.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(apiUrl(url), options);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!text) throw new Error("Game server returned an empty response.");
  if (!contentType.includes("application/json")) throw new Error("Game server returned a non-JSON response.");
  return JSON.parse(text);
}

function apiUrl(url) {
  if (typeof url === "string" && url.startsWith("/api/")) return `${HOSTED_API_ORIGIN}${url}`;
  return url;
}
