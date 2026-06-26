// Tiny shared helpers used by the Worker and by per-game rules modules. Pure,
// imports nothing from the Worker (so no circular dependency).

// Coerce to an integer within [min, max], or `fallback` if not an integer.
export function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
