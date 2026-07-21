// Module metadata for Well, Now You Know (descriptive; registration is via registry.js).
export const wnykManifest = {
  id: "wnyk", // registry alias — resolves to the opaque GAME_IDS.wnyk
  name: "Well, Now You Know",
  description:
    "Fill-in-the-blank party game (a Cards Against Humanity port, CC BY-NC-SA 4.0): the judge " +
    "reads the black card aloud, releases it, and everyone answers from a hidden hand of ten. " +
    "Submissions reveal one at a time in the read-aloud, the judge sorts All → Favorite → Final, " +
    "and the round's reveal shows the whole sentence — and who wrote it. Round wins race to the " +
    "target; hearts feed the Most Liked second podium. Blank cards let players write their own " +
    "answers, which join the family's deck forever with their name on them; 👎 dumps a bad card " +
    "and curates the deck across games. Hidden info — multi-phone only. N-player, 3-seat minimum " +
    "(bots fill the gaps).",
  minPlayers: 3,
  maxPlayers: 20, // N-player (the RTTA convention): no engine ceiling
  timingMode: "turnBased", // simultaneous submissions inside a judge-driven round (hidden-info, viewer-sanitized projection)
  capabilities: ["hosted", "bot", "hiddenInfo"],
};
