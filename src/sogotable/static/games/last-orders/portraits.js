// Last Orders — patron portraits (pure SVG string builders).
//
// One hand-built layered-shape bust per patron (drawn back to front on a
// 100×100 viewBox), the tinted silhouette for anyone unknown, and the
// CHARACTERS table that maps a character id to its backdrop + drawing.
// Re-exported by art.js; ASSETS.portraits[id] replaces a drawing with an image.
import { ASSETS, paletteFor } from "./assets.js";
import {
  C_, E_, G_, INK, L_, P_, R_, arcEyes, blush, both, darken, dotEyes, f1, hashColor, imageSvg, lighten, mir, mix,
  nextId, setInk, star4, starPoly, svgWrap,
} from "./art-kit.js";

// =====================================================================
// Portraits (100×100 bust, drawn back to front)
// =====================================================================
const MOUTH = "#7a2e24";

function gorrum() {
  const skin = "#d99a6c"; const sh = "#b87a50"; const vest = "#6e4a2c";
  return [
    P_("M-4 104C-2 80 14 70 50 69C86 70 102 80 104 104Z", "#dcc79c"), P_("M-4 104C-2 80 14 70 37 69L50 93L63 69C86 70 102 80 104 104Z", vest),
    [[18, 84], [22, 95], [82, 84], [78, 95]].map(([x, y]) => C_(x, y, 1.7, "#e8c060", 1)).join(""), P_("M35 54L35 72Q50 79 65 72L65 54Z", sh),
    both(E_(24.5, 42, 4.5, 6.5, skin) + L_("M24 39Q22 42 24.5 45", 1.1, sh)),
    P_("M25 40C25 18 38 11 50 11C62 11 75 18 75 40C75 57 66 66 50 66C34 66 25 57 25 40Z", skin),
    E_(40, 19, 7, 3, "#fff", 0, `opacity=".45" transform="rotate(-18 40 19)"`),
    P_("M29 47C31 61 41 66 50 66C59 66 69 61 71 47C66 57 59 60 50 60C41 60 34 57 29 47Z", sh, 0, `opacity=".4"`),
    L_("M31.5 35Q39.5 29.5 47 33.5", 3.8), L_("M53 33.5Q60.5 29.5 68.5 35", 3.8), dotEyes(40.5, 59.5, 39.5, 2.1),
    L_("M63 27.5L67.5 36", 1.3, "#9a5a3a"), L_("M64 30.5L67.5 30M64.8 33.3L68.2 32.8", 1, "#9a5a3a"),
    P_("M48 36Q53.5 40.5 52.5 45Q58.5 48.5 53.5 52.5Q48.5 55.5 44.5 51.5Q42.5 48 46.8 46Q47.3 41 48 36Z", mix(skin, sh, 0.55)),
    G_("rotate(-24 50 40)", R_(43.5, 38.2, 13, 4.4, 1.2, "#f3e6c8", 1.1) + C_(48, 40.4, 0.5, "#c9b48a", 0) + C_(52, 40.4, 0.5, "#c9b48a", 0)),
    P_("M38.5 56Q50 62.5 61.5 56Q50 59.5 38.5 56Z", MOUTH, 1.4), R_(46.2, 56.9, 3.4, 2.6, 0.5, "#fff", 0.8),
    // the tankard, raised in a fist
    L_("M68.5 71C59 70 59 86 68.5 86", 3.6, INK), L_("M68.5 71C59 70 59 86 68.5 86", 1.6, "#8a5a34"),
    R_(68, 63, 22, 30, 3, "#a5683a"), L_("M74.5 64V92M81 64V92", 1, "#7a4a26"),
    R_(67, 67, 24, 3.4, 1, "#b8bec2", 1.1), R_(67, 86, 24, 3.4, 1, "#b8bec2", 1.1),
    P_("M66 66C63.5 60 70 56.5 73.5 59C75 53.5 82.5 54 84 58.5C89 56 93.5 61.5 90.5 66C88 68 86 66.5 85 70C84 72.5 82 72 81.5 68.5C79 67.5 70 68.5 66 66Z", "#fffaf0", 1.4),
    P_("M58 76C56 72 60 70 63 71L67 72C70 73 70 77 67.5 78C70 79 70 83 67 84L62 85C58 85 56.5 81 58 76Z", skin, 1.4),
    L_("M60.5 75.5L66 76M60 80L66.5 80.5", 1, sh),
  ].join("");
}

function tilly() {
  const skin = "#f2c29b"; const hood = "#5b3a6e"; const hair = "#b4562a";
  return [
    P_("M8 104C10 82 26 72 50 72C74 72 90 82 92 104Z", hood),
    P_("M18 88C11 62 18 31 44 18C52 10 64 6 76 9C67 12 62 16 63 21C81 31 89 60 82 88C74 79 62 75 50 75C38 75 26 79 18 88Z", hood),
    L_("M70 10.5C66 13 64 17 64.5 21", 1, lighten(hood, 0.25)),
    P_("M28 57C28 37 38 27 50 27C62 27 72 37 72 57C72 70 62 77 50 77C38 77 28 70 28 57Z", "#34203f", 0), E_(50, 54, 16, 17, skin),
    [[37, 41, 5], [43, 37.5, 5.5], [50.5, 36.5, 5.5], [57.5, 38, 5], [63, 42, 4.2]].map(([x, y, r]) => C_(x, y, r, hair, 1.3)).join(""),
    L_("M45 36Q47 39 45.5 41M56 37Q57.5 40 56 42", 0.9, darken(hair, 0.3)),
    L_("M38.5 45.5Q42.5 41 47 44.5", 1.9), L_("M54 47.5Q58 46.2 62.5 48.5", 1.9), C_(43, 50, 2.3, INK, 0), C_(43.8, 49.1, 0.9, "#fff", 0),
    L_("M54 51.5Q58 48.3 62 51.5", 1.9),
    [[38, 56], [40.5, 57.5], [37.5, 58.8], [61, 56.5], [63.5, 57.8], [60.5, 59]].map(([x, y]) => C_(x, y, 0.6, "#b86e4a", 0)).join(""),
    blush(39, 61, 57, 3.5, "#f08a7a", 0.45), L_("M50 53Q52.5 56.5 49 57.5", 1.3),
    P_("M42 61Q52 67.5 60.5 58.5Q53.5 63 42 61Z", MOUTH, 1.4), P_("M52.5 62.2L54.3 64.6L56 61.6Z", "#fff", 0.6),
    P_("M46 80Q50 76 54 80Q50 84 46 80Z", "#e8c060", 1.1),
    // the coin, mid-flip above a thumb
    L_("M77 77C81 72 82 68 79 63", 0.9, INK, `stroke-dasharray="1.6 2.2" opacity=".6"`),
    P_("M71 86C70 81 73 78 77 78.5L81 79C84 80 84 84 81.5 85C83 86.5 82 89.5 79 89.5L74 89.5C72 89.5 71 88 71 86Z", skin, 1.3),
    L_("M76.5 78.5L78.5 73.5", 2.6, INK), L_("M76.5 78.5L78.5 73.5", 1.2, skin),
    G_("rotate(-20 80 58)", E_(80, 58, 5, 7.5, "#f4c34a", 1.4) + E_(80, 58, 2.8, 4.8, "none", 0.9)),
    L_("M86 50L88.5 47.5M88 56H91.5M72 50.5L70 48", 1.1, "#e8a83a"),
  ].join("");
}

function ansel() {
  const skin = "#f2c6a0"; const robe = "#5f8a3e"; const robeD = "#476d2e"; const hair = "#7a5230";
  const cone = (x, y, r = 1) => G_(`translate(${x} ${y}) scale(${r})`, P_("M0 -8C6 -5 6 4 0 8C-6 4 -6 -5 0 -8Z", "#bcd982", 1.2) + L_("M-4 -2.5L0 0.3L4 -2.5M-4.2 2.5L0 5.2L4.2 2.5M-2.6 -6L0 -4.6L2.6 -6", 0.9, "#6f8f3a"));
  return [
    P_("M4 104C6 78 26 68 50 68C74 68 94 78 96 104Z", robe), L_("M50 76C46 86 44 94 43 104", 2.2, "#d8c08a"), C_(46.5, 85, 2.2, "#d8c08a", 1),
    P_("M22 76C28 64 72 64 78 76C70 82 30 82 22 76Z", robeD), both(E_(27.5, 48, 4.2, 6, skin)), C_(50, 46, 23, skin),
    E_(43, 29, 6, 2.6, "#fff", 0, `opacity=".55" transform="rotate(-14 43 29)"`),
    both(P_("M27.6 52C25 40 28.5 34.5 33 33C31.5 39 31.5 45 32.5 51Z", hair, 1.2)),
    P_("M30 39C35 30.5 65 30.5 70 39C64 35.5 36 35.5 30 39Z", hair, 1.2), L_("M36.5 41Q41 39 45 41M55 41Q59 39 63.5 41", 1.5),
    arcEyes(41, 59, 47, 3.8), blush(35.5, 64.5, 53.5, 5, "#ef8a78", 0.55), C_(50, 51, 3.4, mix(skin, "#d08a66", 0.5), 1.3),
    P_("M40 56.5Q50 67 60 56.5Q50 60.5 40 56.5Z", MOUTH, 1.4), P_("M45.5 61.5Q50 63.8 54.5 61.5Q50 59.8 45.5 61.5Z", "#e66a6a", 0),
    L_("M40 66Q50 71.5 60 66", 1.2, "#c98a68"),
    // a fresh hop sprig
    L_("M66 98C70 90 74 84 80 78", 1.8, "#5d7a2a"),
    P_("M78 82C84 78 90 80 92 84C86 88 80 87 78 82Z", "#5f9a34", 1.2), L_("M79 82.5Q85 82.8 91 84", 0.8, "#3f6a22"),
    cone(80, 70), cone(71, 76, 0.85), cone(86.5, 63.5, 0.7),
    P_("M60 100C59 94 62 90 67 90.5L72 91.5C75 92.5 75 96 72 97C74 98 73.5 101 70.5 101L64 101C62 101 60.5 101 60 100Z", skin, 1.3),
  ].join("");
}

function zephyrine() {
  const skin = "#f7e0d4"; const hair = "#b4e1f4"; const hairD = "#86c2e2"; const shawl = "#2d336e"; const gold = "#f6d36b";
  const eye = (x) => E_(x, 45, 3.4, 2.5, "#fff", 1.2) + C_(x + 0.3, 45.3, 1.9, "#7b5cc9", 0) + C_(x + 0.3, 45.3, 0.9, INK, 0) + C_(x + 1, 44.5, 0.6, "#fff", 0);
  return [
    P_("M19 97C9 70 13 28 50 15C87 28 91 70 81 97C72 90 68 74 66 56L34 56C32 74 28 90 19 97Z", hairD),
    L_("M24 84C20 70 20 52 26 38M76 84C80 70 80 52 74 38", 1, lighten(hairD, 0.35)), P_("M6 104C10 80 28 70 50 72C72 70 90 80 94 104Z", shawl),
    [[18, 92], [28, 82], [38, 96], [62, 90], [72, 80], [84, 94], [50, 100]].map(([x, y], i) => (i % 2 ? C_(x, y, 1.1, gold, 0) : star4(x, y, 2.6, gold))).join(""),
    P_("M44 58L44 74Q50 77 56 74L56 58Z", "#e8c7b8"), both(P_("M36 45L11 28Q17 44 35 54Z", skin, 1.4) + L_("M33 47L17 33.5", 0.9, "#e0b3a4")),
    P_("M36 42C36 29 42 24 50 24C58 24 64 29 64 42C64 55 57 64 50 64C43 64 36 55 36 42Z", skin),
    P_("M33.5 47C29 26 44 15 57 18C69 21 71 34 66 45C63 35 57 29 48 31C42 34 37.5 40 33.5 47Z", hair),
    P_("M64 35C71 48 71 63 66 76C64 64 62 51 59.5 41Z", hair, 1.3),
    L_("M47 22.5C42 25 38 31 36.5 38M58 21C63 24 66 29 66.5 34", 0.9, "#fff", `opacity=".7"`),
    L_("M38.5 40Q43 37.5 47 39.5M53 39.5Q57 37.5 61.5 40", 1.2),
    eye(43), eye(57), L_("M39.5 43.6L38 42M40.8 42.8L39.8 41M60.5 43.6L62 42M59.2 42.8L60.2 41", 0.9), blush(40, 60, 52, 3.2, "#d9a0d6", 0.55),
    L_("M50 47.5L49 52.5L50.8 53", 1), L_("M46 56.5Q50 59 54 56.5", 1.5),
    P_("M46 80C46 76 50 74 53 75C50 76 49 79 50.5 82C49 83 46 82 46 80Z", gold, 1),
    star4(21, 20, 4.5, gold), star4(81, 16, 3.5, gold), star4(86, 46, 2.6, "#fff7c7"), star4(14, 52, 2.4, "#fff7c7"), C_(76, 28, 1, gold, 0),
  ].join("");
}

function marrow() {
  const skin = "#c98d62"; const beard = "#c3c3bc"; const beardD = "#8f8f88"; const coat = "#2c3b5c"; const trim = "#e2b35a";
  return [
    P_("M2 104C4 80 20 70 50 70C80 70 96 80 98 104Z", coat),
    [[40, 92], [60, 92], [40, 100], [60, 100]].map(([x, y]) => C_(x, y, 1.6, trim, 1)).join(""),
    both(P_("M5 86C9 78 18 74 27 74L29 79C21 79 13 82 9 89Z", trim, 1.3) + L_("M9 89L8 93M12.5 84.8L12 89M16.5 82L16.5 86M21 80.3L21.4 84", 1.1, "#b8862a")),
    both(E_(27.5, 47, 4, 6, skin)), P_("M29 45C29 27 38 21 50 21C62 21 71 27 71 45C71 59 62 67 50 67C38 67 29 59 29 45Z", skin),
    L_("M33 44.5L30 43M33.5 47L30.5 47.5M67 44.5L70 43M66.5 47L69.5 47.5", 0.9, "#9a6440"),
    P_("M27.5 46C23 60 27 79 38 87C44 93 56 93 62 87C73 79 77 60 72.5 46C68 54 62 57.5 50 57.5C38 57.5 32 54 27.5 46Z", beard),
    L_("M35 66Q38 70 36 74M44 72Q47 76 45 80M56 72Q53 76 55 80M65 66Q62 70 64 74M50 80Q52 84 50 88", 1.1, beardD),
    blush(37.5, 62.5, 52, 4, "#d9604a", 0.4), E_(50, 50, 5, 4.2, mix(skin, "#9a5a3a", 0.35), 1.4),
    P_("M50 55C44 51 36 53 33.5 59C39.5 56.5 46 58.5 50 57.5C54 58.5 60.5 56.5 66.5 59C64 53 56 51 50 55Z", "#dcdcd5", 1.3),
    L_("M37.5 44.5Q41 42.5 44.5 44.5M55.5 44.5Q59 42.5 62.5 44.5", 1.8),
    P_("M33.5 40.5Q40 35 47.5 39Q41 38.5 34.5 42.5Z", beard, 1.2), P_("M66.5 40.5Q60 35 52.5 39Q59 38.5 65.5 42.5Z", beard, 1.2),
    // pipe and a lazy curl of smoke
    L_("M59 59.5L72 64.5", 3, INK), L_("M59 59.5L72 64.5", 1.4, "#6b4226"),
    P_("M70.5 58.5L80 58.5L79 68Q75.5 71.5 72 68Z", "#7a4a26", 1.4), E_(75.2, 58.6, 4.7, 1.3, "#3a2416", 0.9),
    L_("M76 55C72 49 80 45 76 39C72.5 34 79 30 77 24", 1.6, "#d8d4cc", `opacity=".85"`),
    // tricorn
    P_("M11 37C17 29 29 22 36 22C38 11 62 11 64 22C71 22 83 29 89 37C77 32.5 64 32.5 50 39C36 32.5 23 32.5 11 37Z", "#2a2520"),
    L_("M11.5 36.5C24 32 36 32 50 38.5C64 32 76 32 88.5 36.5", 1.8, trim), C_(50, 29, 3.2, "#b8322d", 1.1), C_(50, 29, 1.2, trim, 0),
  ].join("");
}

function nessa() {
  const skin = "#b67652"; const hair = "#2fa597"; const hairD = "#1d7c71"; const dress = "#ef8a6c"; const shell = "#f7c9c2";
  const note = (x, y, s = 1) => G_(`translate(${x} ${y}) scale(${s})`, E_(0, 0, 2.8, 2.1, hairD, 0.9, `transform="rotate(-20)"`) + L_("M2.4 -0.6V-10L7 -8", 1.4, hairD));
  return [
    P_("M15 92C6 77 15 66 11 54C7 40 17 22 34 18C42 12 58 12 66 18C83 22 93 40 89 54C85 66 94 77 85 92C76 87 70 75 66 60L34 60C30 75 24 87 15 92Z", hairD),
    P_("M8 104C12 82 28 74 50 74C72 74 88 82 92 104Z", dress), P_("M30 80C36 86 44 84 50 88C56 84 64 86 70 80", "none", 1.2),
    P_("M44 58L44 76Q50 79 56 76L56 58Z", darken(skin, 0.12)),
    [32, 37, 43.5, 50, 56.5, 63, 68].map((x, i) => C_(x, 77 + [0, 2.6, 4.2, 4.8, 4.2, 2.6, 0][i], 1.6, "#fbf5ea", 0.8)).join(""),
    P_("M35 44C35 30 42 26 50 26C58 26 65 30 65 44C65 56 58 64 50 64C42 64 35 56 35 44Z", skin),
    P_("M33.5 48C29 33 38 21 50 21C62 21 71 33 66.5 48C65 40 61 33 52 32C47 38 41 41 33.5 48Z", hair),
    both(P_("M35 39C26 49 33 60 26 73C35 71 39 58 36.5 46Z", hair, 1.3)), L_("M42 25C38 28 36 33 35.5 38M58 24.5C63 27 66 32 66 37", 1, "#8fe0d4"),
    G_("translate(31 27) rotate(-25)", P_("M0 5L-6.5 -2C-5 -7 5 -7 6.5 -2Z", shell, 1.2) + L_("M0 5L-3.5 -4.5M0 5V-5.5M0 5L3.5 -4.5", 0.8, "#d38f86")),
    P_(starPoly(69, 31, 5, 2.2, 5), "#f4a45a", 1.1), L_("M38.5 41Q42.5 38.5 46.5 40.5M53.5 40.5Q57.5 38.5 61.5 41", 1.4),
    arcEyes(42.5, 57.5, 45, 3.6, false), L_("M39.2 46.4L38 47.6M60.8 46.4L62 47.6", 0.9), blush(39, 61, 52, 3.6, "#e87a6a", 0.5),
    L_("M50 47L48.8 51.5L50.8 52", 1.1), E_(50, 57, 3, 3.6, "#6a2420", 1.3), E_(50, 58.6, 1.8, 1.3, "#e66a6a", 0), C_(35.5, 50, 1.4, "#fbf5ea", 0.8),
    note(80, 22, 1.05), note(87, 40, 0.8), note(16, 64, 0.75),
    // conch held at the shoulder
    P_("M62 92C59 80 70 70 84 72C94 74 96 84 90 91C83 97 68 98 62 92Z", "#f3dcbc"),
    P_("M64 90C70 86 76 86 82 90C76 93 70 93 64 90Z", "#f0a4a0", 1), L_("M71 80C76 76 84 76 87 81C89 85 85 88 81 86", 1, "#b98a5e"),
    P_("M84 72L90 66L88 74Z", "#f3dcbc", 1.1),
  ].join("");
}

function hrolga() {
  const skin = "#eeb48f"; const beard = "#c9502a"; const beardD = "#953518"; const fur = "#efe6d4"; const tunic = "#3d6a8f";
  const braid = (x) => [0, 1, 2, 3, 4].map((i) => E_(f1(x - i * 0.7), 70 + i * 5.6, 4.6 - i * 0.25, 3.5, beard, 1.2)).join("")
    + R_(x - 5.6, 79.5, 9, 3.2, 1.2, "#a9b0b4", 1) + R_(x - 7, 91, 9, 3.2, 1.2, "#e2b35a", 1)
    + P_(`M${x - 6} 94C${x - 9} 99 ${x - 7} 102 ${x - 3} 102C${x - 1} 99 ${x - 1} 96 ${x - 2} 94Z`, beard, 1.1);
  return [
    P_("M0 104C2 80 18 70 50 70C82 70 98 80 100 104Z", tunic), L_("M36 74L40 104M64 74L60 104", 2.4, "#8a5a34"),
    both(P_("M2 92C2 80 12 72 24 72C30 72 33 76 33 80C28 82 26 86 24 90C16 88 8 90 2 92Z", fur, 1.4)), both(E_(25.5, 47, 4.2, 6, skin)),
    P_("M26 46C26 30 36 24 50 24C64 24 74 30 74 46C74 60 64 68 50 68C36 68 26 60 26 46Z", skin),
    P_("M26 46C26 61 35 70 50 70C65 70 74 61 74 46C71 54 68 62 61 62.5C56 59 44 59 39 62.5C32 62 29 54 26 46Z", beard),
    L_("M31 54Q33 60 36 63M69 54Q67 60 64 63", 1, beardD), braid(40), mir(braid(40)),
    P_("M41.5 58.5Q50 65.5 58.5 58.5Q50 61.5 41.5 58.5Z", MOUTH, 1.3), P_("M44 59.3H56L55 61H45Z", "#fff", 0),
    blush(37, 63, 51.5, 4, "#e9705a", 0.55), [[35, 50], [37.5, 51.5], [62.5, 51.5], [65, 50]].map(([x, y]) => C_(x, y, 0.6, "#b0603a", 0)).join(""),
    C_(50, 51.5, 4.2, mix(skin, "#c9775a", 0.45), 1.3), dotEyes(41.5, 58.5, 45.5, 2.3),
    P_("M35.5 41.5Q41 37 47 40Q41.5 40 36 43Z", beard, 1.2), P_("M64.5 41.5Q59 37 53 40Q58.5 40 64 43Z", beard, 1.2),
    // fur hat
    P_("M29 30C29 11 71 11 71 30Z", "#7a4a2a"), L_("M40 15C38 20 38 25 39 29M60 15C62 20 62 25 61 29", 1, "#5a341c"),
    P_("M22 34C21 26 29 23.5 33.5 25.5C37.5 21 46 21.5 50 24C54 21.5 62.5 21 66.5 25.5C71 23.5 79 26 78 34C78.5 40.5 71 41 67 38.5C62 42 54 40.5 50 38.5C46 40.5 38 42 33 38.5C29 41 21.5 40.5 22 34Z", fur),
    L_("M30 31.5Q32 33 31 35.5M41 30Q43 32 42 35M50 29.5Q52 32 51 35M59 30Q61 32 60 35M69 31.5Q71 33 70 35.5", 0.9, "#c4b494"),
  ].join("");
}

function sable() {
  const fur = "#d4733a"; const cream = "#fbf1e2"; const tip = "#3a2a24"; const cloak = "#eef3f6"; const cloakD = "#bccbd6";
  const ear = P_("M31.5 38L23.5 7L48.5 25.5Z", fur) + P_("M32.5 32.5L27 14L43 26.5Z", "#f2b7a0", 0) + P_("M26.2 17.5L23.5 7L32 13Z", tip, 1);
  const eye = P_("M36 44.5Q42 38.5 47.5 43.5Q42 47.5 36 44.5Z", "#f2a92e", 1.3) + E_(42.2, 43.8, 1, 2.3, INK, 0) + C_(43.3, 42.6, 0.6, "#fff", 0);
  return [
    P_("M4 104C8 80 26 70 50 70C74 70 92 80 96 104Z", cloak), L_("M26 86C24 94 23 100 23 104M74 86C76 94 77 100 77 104", 1, cloakD),
    P_("M18 80C20 72 30 68 36 70C42 66 58 66 64 70C70 68 80 72 82 80C76 86 68 84 64 82C58 86 42 86 36 82C32 84 24 86 18 80Z", "#d9e2e8"),
    C_(50, 84, 3.2, "#5aa2d6", 1.2), C_(49.2, 83.2, 0.9, "#fff", 0), both(ear), both(P_("M27 46L15 50L24 53L17 59L30 57Z", fur, 1.3)),
    P_("M24 46C24 30 36 22 50 22C64 22 76 30 76 46C76 54 66 62 50 72C34 62 24 54 24 46Z", fur),
    P_("M26.5 51C36 49 44 54 50 72C56 54 64 49 73.5 51C71 59 61 65.5 50 72C39 65.5 29 59 26.5 51Z", cream, 1.3), P_("M46 23Q50 35 54 23Z", cream, 0),
    eye, mir(eye), L_("M36 39.5Q41 37 46 39M54 39Q59 37 64 39.5", 1.4, darken(fur, 0.35)),
    P_("M45.8 64Q50 60.8 54.2 64Q50 69.5 45.8 64Z", tip, 1.1), C_(48.6, 63.2, 0.7, "#fff", 0, `opacity=".7"`),
    L_("M50 67V69.5M47 69.5Q50 72 53 69.5", 1.1),
    [[13, 24, 3], [88, 30, 2.5], [86, 62, 2.2], [11, 70, 2]].map(([x, y, r]) => L_(`M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}M${x - r * 0.7} ${y - r * 0.7}L${x + r * 0.7} ${y + r * 0.7}M${x - r * 0.7} ${y + r * 0.7}L${x + r * 0.7} ${y - r * 0.7}`, 0.9, "#ffffff", `opacity=".9"`)).join(""),
  ].join("");
}

function verrin() {
  const skin = "#ece2e8"; const hair = "#1f1b2a"; const cape = "#23202d"; const lining = "#a8233a";
  return [
    both(P_("M13 94L7 22L44 63L36 94Z", cape) + P_("M17 88L13 32L40 63L34 88Z", lining, 0)), P_("M2 104C6 82 22 74 50 74C78 74 94 82 98 104Z", cape),
    P_("M40 72L50 92L60 72Z", "#fbf6ee", 1.3), L_("M44 76Q50 80 56 76M45.5 81Q50 85 54.5 81", 1, "#cfc6bc"),
    C_(50, 79.5, 2.5, "#c2183a", 1.1), C_(49.3, 78.8, 0.7, "#fff", 0), P_("M44 59L44 74L56 74L56 59Z", "#d8cad3"),
    both(P_("M35.5 44L27 34L34.5 53Z", skin, 1.3)), P_("M35 42C35 28 42 22 50 22C58 22 65 28 65 42C65 56 58 66 50 68C42 66 35 56 35 42Z", skin),
    P_("M33 43C30 22 40 14 50 14C60 14 70 22 67 43C64.5 33 60.5 28.5 56 28.5L50 37L44 28.5C39.5 28.5 35.5 33 33 43Z", hair),
    L_("M41 19C38 22 36 27 35.5 32M58 18C61 20 63 23 64 27", 1.1, "#6a6488"), L_("M38 40L46.5 37.8M62 40L53.5 37.8", 1.9),
    both(P_("M39 44.3Q42.6 42.2 46.2 44.3Q42.6 46.3 39 44.3Z", "#fff", 1.1) + C_(42.6, 44.3, 1.4, "#8a1c2c", 0) + L_("M38.4 43.7Q42.6 41.4 46.8 43.7", 1.9)),
    L_("M50 45L48.2 52.2L51 53", 1.2), L_("M43.5 58Q51 61.5 57.5 57", 1.6), P_("M53 59L54.1 61.8L55.2 58.4Z", "#fff", 0.8), C_(58, 51.5, 0.7, INK, 0),
    // a glass of "tomato juice", garnished to prove it
    P_("M70 62L86 62C86 72 82 76.5 78 76.5C74 76.5 70 72 70 62Z", "rgba(226,240,246,.55)", 1.3),
    P_("M70.8 66L85.2 66C84.6 72 81.6 75.5 78 75.5C74.4 75.5 71.4 72 70.8 66Z", "#c8282f", 0), L_("M72.5 64.5L73.5 70", 1, "#ffffff", `opacity=".7"`),
    L_("M78 76.5V88", 1.8), E_(78, 89, 6, 1.6, "rgba(226,240,246,.7)", 1.2),
    C_(85.5, 61.5, 3.4, "#e0392b", 1.2), P_("M85.5 58.2L84 56.6M85.5 58.2L87.3 56.8M85.5 58.2V56", "none", 1, `stroke="#3f8a2e"`),
  ].join("");
}

function bim() {
  const frog = "#6cc04a"; const frogD = "#4c9a33"; const purple = "#7b45b0"; const yellow = "#f2c23a";
  const bell = (x, y) => C_(x, y, 3.4, "#f6d36b", 1.2) + L_(`M${x - 1.6} ${y + 0.8}H${x + 1.6}`, 0.9) + C_(x - 1, y - 1.1, 0.8, "#fff", 0);
  const zig = (y0, y1, x0, x1, n, fill) => {
    const pts = []; for (let i = 0; i <= n; i += 1) pts.push(`${f1(x0 + ((x1 - x0) * i) / n)} ${i % 2 ? y1 : y0}`);
    return P_(`M${x0} ${y0 - 8}L${pts.join("L")}L${x1} ${y0 - 8}Z`, fill, 1.3);
  };
  return [
    P_("M6 104C10 84 28 76 50 76C72 76 90 84 94 104Z", purple),
    P_("M50 80L60 92L50 104L40 92Z", yellow, 1.2), P_("M22 88L30 98L22 106L14 98ZM78 88L86 98L78 106L70 98Z", yellow, 1.2),
    zig(76, 85, 18, 82, 12, yellow), zig(74, 80, 26, 74, 10, purple),
    P_("M41 40C31 30 19 30 10 40C17 27 31 21 45 30Z", purple), P_("M42 35C40 20 46 10 54 4C52 14 56 24 59 35Z", yellow), P_("M56 30C69 21 83 27 90 40C81 30 69 30 59 40Z", purple),
    bell(10, 40), bell(54, 4), bell(90, 40), P_("M33 42C38 31 62 31 67 42Z", yellow, 1.3),
    P_("M22 55C22 41 34 37 50 37C66 37 78 41 78 55C78 67 66 73 50 73C34 73 22 67 22 55Z", frog),
    E_(39, 61, 4, 2.4, frogD, 0, `opacity=".5"`), E_(66, 49, 2.6, 1.8, frogD, 0, `opacity=".5"`), E_(30, 50, 2, 1.4, frogD, 0, `opacity=".5"`),
    both(C_(35.5, 41, 9.5, frog) + C_(35.5, 41, 6.4, "#fff", 1.1) + E_(36.4, 41.8, 3.2, 2.2, INK, 0) + C_(37.6, 40.6, 0.9, "#fff", 0) + L_("M27 37.5Q35.5 31 44 37.5", 1.3, frogD)),
    C_(47, 52.5, 0.9, INK, 0), C_(53, 52.5, 0.9, INK, 0), L_("M29 58.5Q50 73 71 58.5", 1.9), L_("M27.8 56.6L29.6 59.2M72.2 56.6L70.4 59.2", 1.5),
    P_("M45 64.6Q50 70.5 55 64.6Q50 66.2 45 64.6Z", "#f08aa0", 1), blush(28, 72, 63, 4.2, "#ff8fa8", 0.55),
  ].join("");
}

function sprocket() {
  const skin = "#a3bb6c"; const skinD = "#7f9a4c"; const brass = "#c8963a"; const lens = "#8fdcef";
  const goggle = (x) => C_(x, 34, 6.8, brass, 1.4) + C_(x, 34, 4.6, lens, 1.1) + P_(`M${x - 2.5} ${32.6}Q${x - 1} ${30.4} ${x + 1.4} ${30.6}`, "none", 1.1, `stroke="#fff"`);
  return [
    G_("translate(81 52) rotate(28)", P_("M-7 0C-7 -8 -4 -11 -2 -11L-2 -5L2 -5L2 -11C4 -11 7 -8 7 0C7 4 4 6 2.6 6L2.6 34C2.6 36.5 -2.6 36.5 -2.6 34L-2.6 6C-4 6 -7 4 -7 0Z", "#a4adb3", 1.5) + L_("M-1 10V30", 0.9, "#ffffff", `opacity=".7"`)),
    P_("M4 104C8 82 26 72 50 72C74 72 92 82 96 104Z", "#d8c9a0"),
    P_("M33 82L67 82L69 104L31 104Z", "#7a5a3a"), L_("M35 82L30 72M65 82L70 72", 2.2, "#7a5a3a"), C_(37, 85, 1.5, "#e2b35a", 1), C_(63, 85, 1.5, "#e2b35a", 1),
    R_(42, 88, 16, 10, 2, "#6a4c30", 1.2), L_("M45 88V81M45 81H47", 1.6, "#c8323a"), L_("M54 88L56 82", 1.4, "#9aa4aa"),
    both(P_("M32 44C21 40 9 34 2 34C8 42 20 52 32 55Z", skin) + L_("M29 46C21 43 14 40 9 38", 1, skinD)),
    P_("M30 46C30 30 38 24 50 24C62 24 70 30 70 46C70 60 62 70 50 70C38 70 30 60 30 46Z", skin),
    P_("M39 28L36 15L44.5 23L48 10L52.5 22.5L59 13L59.5 27Z", "#2a2420", 1.3),
    P_("M30 33.5C40 29.5 60 29.5 70 33.5L70 37.5C60 34 40 34 30 37.5Z", "#4a3a2c", 1.1),
    goggle(41.5), goggle(58.5), R_(47.5, 32.6, 5, 2.6, 1, brass, 1),
    both(C_(41.5, 47, 4.6, "#fffbe0", 1.3) + C_(42.6, 47.6, 2.1, INK, 0) + C_(43.4, 46.7, 0.7, "#fff", 0)),
    L_("M36.5 41.5Q41 40 45.5 42M54.5 42Q59 40 63.5 41.5", 1.5),
    P_("M38 60.5Q50 69 62 60.5Q50 64.5 38 60.5Z", "#5a2a20", 1.4), P_("M43.3 61.8L44.6 64.4L46 62.3Z", "#fff", 0.7), P_("M54 62.4L55.3 64.8L56.6 62Z", "#fff", 0.7),
    P_("M49.5 46.5C51.5 52 55.5 56 60.5 58.3C55.5 59.5 51 58.5 47.6 56.2Z", skinD, 1.3),
    E_(35, 55, 3.2, 1.6, "#3a3a3a", 0, `opacity=".3"`), E_(64, 54, 2, 1.1, "#3a3a3a", 0, `opacity=".25"`),
  ].join("");
}

function brassbell(id) {
  const tin = "#c3cbd0"; const tinD = "#8e989f"; const brass = "#cf9f45";
  const port = (x) => C_(x, 40, 8.8, brass, 1.5) + C_(x, 40, 6, `url(#${id}e)`, 1.1) + E_(x - 2, 37.6, 2, 1.2, "#fff", 0, `opacity=".85"`)
    + [0, 90, 180, 270].map((a) => C_(f1(x + 7.4 * Math.cos((a * Math.PI) / 180)), f1(40 + 7.4 * Math.sin((a * Math.PI) / 180)), 0.6, "#8a6420", 0)).join("");
  return [
    `<defs><radialGradient id="${id}e" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".55" stop-color="#ffe27a"/><stop offset="1" stop-color="#e59a2a"/></radialGradient></defs>`,
    P_("M10 104C12 84 26 78 50 78C74 78 88 84 90 104Z", tin), [22, 34, 66, 78].map((x) => C_(x, 92, 1.1, tinD, 0.8)).join(""),
    R_(40, 88, 20, 14, 2, "#a9b2b8", 1.2), C_(46, 95, 3, "#f6f0d8", 1), L_("M46 95L47.6 93", 0.9), C_(55, 95, 1.6, "#e0392b", 0.9),
    P_("M14 83C20 78 28 78 33 82L31 104L18 104Z", "#f4f0e4", 1.4), L_("M17.5 90H31.5M17.5 94H31.2", 1.2, "#c8323a"),
    R_(42, 62, 16, 16, 2, tinD, 1.3), L_("M42 66.5H58M42 71H58M42 75.5H58", 1, "#6e777d"),
    P_("M50 78L39 72L39 84Z", "#c8323a", 1.3), P_("M50 78L61 72L61 84Z", "#c8323a", 1.3), R_(47.5, 75.5, 5, 5, 1.2, "#a82a30", 1.1),
    both(R_(20.5, 35, 7, 13, 2.5, brass, 1.3) + L_("M22 39H26.5M22 43.5H26.5", 0.8, "#8a6420")),
    P_("M50 15V8", "none", 1.6), P_("M44.6 9C44.6 1.6 55.4 1.6 55.4 9L56.6 10.6L43.4 10.6Z", brass, 1.3), C_(50, 11.8, 1.3, "#8a6420", 0.8),
    P_("M37 22C37 14 63 14 63 22Z", tinD), R_(26, 20, 48, 46, 15, tin),
    P_("M30 30C30 25 33 23 37 23L37 60C33 60 30 57 30 52Z", "#ffffff", 0, `opacity=".35"`),
    [[31, 25], [69, 25], [31, 61], [69, 61]].map(([x, y]) => C_(x, y, 1.1, tinD, 0.8)).join(""), port(39), port(61),
    R_(39, 53, 22, 7, 3.5, "#4a5258", 1.3), [44, 48, 52, 56].map((x, i) => C_(x, 56.5, 1.1, i % 3 ? "#9fe6a0" : "#ffe27a", 0)).join(""),
    blush(31, 69, 53, 2.6, "#ff9a8a", 0.55),
  ].join("");
}

function monsoon() {
  const skin = "#5f9fbf"; const skinD = "#3f7a99"; const hair = "#cdeff5"; const hairD = "#7fc6d6"; const plate = "#9aa9b4"; const tabard = "#1f5a78";
  const drop = (x, y, s) => P_(`M${x} ${y - 3 * s}C${x + 2.4 * s} ${y} ${x + 2.4 * s} ${y + 2.6 * s} ${x} ${y + 2.6 * s}C${x - 2.4 * s} ${y + 2.6 * s} ${x - 2.4 * s} ${y} ${x} ${y - 3 * s}Z`, "#a8e6f0", 0.9);
  return [
    P_("M6 104C10 82 28 73 50 73C72 73 90 82 94 104Z", plate),
    [18, 30, 42, 54, 66, 78].map((x) => P_(`M${x} 84Q${x + 6} 92 ${x + 12} 84`, "none", 1, `stroke="${darken(plate, 0.3)}"`)).join(""),
    P_("M38 78L62 78L60 104L40 104Z", tabard), drop(50, 90, 2.2), L_("M47 93L51 88L49 88L53 83", 1.1, "#ffe27a"),
    P_("M14 90C8 70 18 50 16 36C22 18 40 12 50 12C60 12 78 18 84 36C82 50 92 70 86 90C80 80 74 66 70 52L30 52C26 66 20 80 14 90Z", hairD),
    P_("M43 58L43 76Q50 79 57 76L57 58Z", skinD),
    P_("M34 44C34 30 41 25 50 25C59 25 66 30 66 44C66 56 59 64 50 64C41 64 34 56 34 44Z", skin),
    P_("M32 47C28 30 38 19 50 19C62 19 72 30 68 47C64 38 60 33 50 31C44 36 38 40 32 47Z", hair),
    both(P_("M33 40C24 52 30 62 22 74C28 70 34 64 33.5 54C36 60 36 66 33 72C38 66 38 56 35.5 46Z", hair, 1.2)),
    L_("M40 24C44 22 48 24 50 27C52 24 56 22 60 24", 1.1, "#ffffff"), L_("M30 36Q34 30 38 32M62 32Q66 30 70 36", 1, hairD),
    both(L_("M38 50L36 54M40 51L39 55", 0.8, "#cdeff5")),
    L_("M38.5 40.5Q42.5 38.5 46.5 40.5M53.5 40.5Q57.5 38.5 61.5 40.5", 1.6),
    dotEyes(42.5, 57.5, 45, 2.3), L_("M50 47L48.6 52L50.6 52.4", 1.1), P_("M44.5 57.5Q50 61 55.5 57.5", "none", 1.4),
    drop(20, 24, 1), drop(12, 56, 0.7),
    // warhammer over the shoulder
    G_("translate(85 50) rotate(18)", R_(-1.8, 0, 3.6, 50, 1.5, "#6b4a2e", 1.3) + R_(-9, -8, 18, 10, 2, plate, 1.5) + L_("M-6 -3H6", 1, "#ffffff", `opacity=".7"`) + P_("M-3 -12L1 -18L0 -13L4 -13L-1 -6L0 -11Z", "#ffe27a", 0.9)),
  ].join("");
}

function notepick() {
  const skin = "#8fb35a"; const skinD = "#6c8f3c"; const coat = "#7a3f8f"; const coatD = "#55296a"; const wood = "#c98a46";
  const note = (x, y, s = 1) => G_(`translate(${x} ${y}) scale(${s})`, E_(0, 0, 2.8, 2.1, coatD, 0.9, `transform="rotate(-20)"`) + L_("M2.4 -0.6V-10L7 -8", 1.4, coatD));
  return [
    P_("M8 104C12 82 28 74 50 74C72 74 88 82 92 104Z", coat), P_("M42 76L50 92L58 76Z", "#f2e6c8", 1.2), L_("M30 84Q34 96 32 104M70 84Q66 96 68 104", 1, coatD),
    // lute held across the chest
    G_("translate(56 92) rotate(-32)", E_(0, 0, 13, 10.5, wood, 1.5) + C_(0, 0, 3.4, "#4a2c18", 1) + R_(10, -2.4, 30, 4.8, 1.2, "#8a5a2e", 1.3) + R_(38, -4, 7, 8, 1.5, "#6b4424", 1.2) + L_("M-8 -1H40M-8 1H40", 0.5, "#fff6d8")),
    both(P_("M33 44C22 38 8 26 2 24C6 34 18 48 32 54Z", skin) + L_("M30 46C22 40 14 34 8 30", 1, skinD)),
    P_("M31 46C31 31 39 25 50 25C61 25 69 31 69 46C69 60 61 69 50 69C39 69 31 60 31 46Z", skin),
    // feathered cap
    P_("M30 34C32 22 42 16 52 17C64 18 70 26 71 34C60 30 42 30 30 34Z", "#2f6b4f"), P_("M28 34.5C40 30 60 30 72 34.5L72 37.5C60 34 40 34 28 37.5Z", "#1f4a36", 1.1),
    P_("M62 22C70 10 82 6 90 8C84 12 76 18 66 26Z", "#f2c94c", 1.2), L_("M64 24C72 16 80 11 88 9", 0.9, "#c99a2a"),
    both(C_(42, 46, 4.4, "#fffbe0", 1.3) + C_(43, 46.6, 2, INK, 0) + C_(43.8, 45.8, 0.7, "#fff", 0)),
    L_("M37 40.5Q42 38.5 46 41M54 41Q58 38.5 63 40.5", 1.5),
    P_("M49.5 46.5C51 51 54 54 57.5 56C53.5 57.2 50 56.6 47.6 54.6Z", skinD, 1.3),
    P_("M39 59Q50 70 61 59Q50 64 39 59Z", "#5a2a20", 1.4), P_("M44 60.6L45.3 63.2L46.7 61.1Z", "#fff", 0.7), P_("M53.6 61.2L54.9 63.6L56.2 60.8Z", "#fff", 0.7),
    blush(37, 63, 55, 3.2, "#d46a6a", 0.4),
    note(14, 64, 0.9), note(86, 44, 0.8), note(20, 20, 0.7),
  ].join("");
}

function genericPatron(seed) {
  const c = hashColor(seed, 0.35, 0.5);
  return () => [
    P_("M6 104C10 80 28 70 50 70C72 70 90 80 94 104Z", darken(c, 0.15)), C_(50, 44, 21, lighten(c, 0.15)),
    P_("M44.5 38C44.5 33 48 31 51 31C55 31 57 34 57 37C57 41 51 42 51 46M51 51V51.5", "none", 3.2, `stroke="${lighten(c, 0.65)}"`),
  ].join("");
}

const CHARACTERS = {
  "base:gorrum": { bg: "#e3a55a", draw: gorrum }, "base:tilly": { bg: "#c6a5d8", draw: tilly },
  "base:ansel": { bg: "#c9d98c", draw: ansel }, "base:zephyrine": { bg: "#9aa8e8", draw: zephyrine },
  "harbor:marrow": { bg: "#8fb9d6", draw: marrow }, "harbor:nessa": { bg: "#88d6c8", draw: nessa },
  "frost:hrolga": { bg: "#f0b07c", draw: hrolga }, "frost:sable": { bg: "#a9c7e0", draw: sable },
  "masquerade:verrin": { bg: "#c98c9e", draw: verrin }, "masquerade:bim": { bg: "#f2d276", draw: bim },
  "clockwork:sprocket": { bg: "#d9b77e", draw: sprocket }, "clockwork:brassbell": { bg: "#9fcbc6", draw: brassbell },
  "storm:monsoon": { bg: "#8cc6dc", draw: monsoon }, "storm:notepick": { bg: "#c9a6d8", draw: notepick },
};
/** Ids that have hand-drawn portraits (anything else gets a tinted silhouette). */
export const PORTRAIT_IDS = Object.keys(CHARACTERS);
/** The backdrop accent for a patron — handy for seat rings and name chips. */
export function characterAccent(characterId) { return (CHARACTERS[characterId] || {}).bg || hashColor(characterId, 0.4, 0.62); }

/**
 * A bust portrait. `size` sets width/height in px (omit/null to size with CSS).
 * `theme` ("light" | "dark") or an explicit `palette` picks the backdrop tones.
 */
export function portraitSvg(characterId, { size = 96, theme, palette, idPrefix = "lop", label } = {}) {
  const P = palette || paletteFor(theme);
  const name = label || String(characterId || "patron");
  const override = ASSETS.portraits && ASSETS.portraits[characterId];
  if (override) return imageSvg(override, { size, label: name, rx: 18 });
  setInk(P.ink);
  const id = nextId(idPrefix);
  const ch = CHARACTERS[characterId] || { bg: hashColor(characterId, 0.4, 0.62), draw: genericPatron(characterId) };
  const inner = P.backdropDrop ? darken(ch.bg, P.backdropDrop * 0.55) : lighten(ch.bg, P.backdropLift);
  const outer = P.backdropDrop ? darken(ch.bg, P.backdropDrop + 0.18) : lighten(ch.bg, P.backdropLift * 0.25);
  const body = [
    `<defs><radialGradient id="${id}b" cx="50%" cy="38%" r="72%"><stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient>`,
    `<clipPath id="${id}c"><rect width="100" height="100" rx="18"/></clipPath></defs>`,
    `<g clip-path="url(#${id}c)"><rect width="100" height="100" fill="url(#${id}b)"/>`,
    `<circle cx="50" cy="42" r="34" fill="${P.glow}" opacity="${P.backdropDrop ? 0.22 : 0.4}"/>`,
    ch.draw(id), "</g>",
    `<rect x=".9" y=".9" width="98.2" height="98.2" rx="17.2" fill="none" stroke="${darken(ch.bg, 0.4)}" stroke-width="1.8" opacity=".55"/>`,
  ].join("");
  return svgWrap(body, { size, label: name });
}
