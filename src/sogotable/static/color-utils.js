const DEFAULT_PLAYER_COLOR = "#1f7a5f";

export function normalizePlayerColor(value, defaultColor = DEFAULT_PLAYER_COLOR, base = DEFAULT_PLAYER_COLOR) {
  const candidate = (value || "").trim();
  if (isHexColor(candidate)) return candidate.toLowerCase();
  if (isHexColor(base)) return base.toLowerCase();
  if (isHexColor(defaultColor)) return defaultColor.toLowerCase();
  return DEFAULT_PLAYER_COLOR;
}

export function isHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function getContrastAwareTextColor(hexColor) {
  const safeColor = isHexColor(hexColor || "") ? hexColor : DEFAULT_PLAYER_COLOR;
  const [red, green, blue] = hexToRgb(safeColor);
  const bgLum = relativeLuminance(red, green, blue);
  const blackContrast = contrastRatio(bgLum, relativeLuminance(17, 17, 17));
  const whiteContrast = contrastRatio(bgLum, relativeLuminance(255, 255, 255));
  return blackContrast >= whiteContrast ? "#111111" : "#ffffff";
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(red, green, blue) {
  const [r, g, b] = [red, green, blue].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function contrastRatio(left, right) {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

export function colorWithAlpha(hex, alpha) {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function mixColorWithWhite(hex, amount) {
  const [red, green, blue] = hexToRgb(hex);
  const mix = (channel) => Math.round(channel * amount + 255 * (1 - amount));
  return rgbToHex(mix(red), mix(green), mix(blue));
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
