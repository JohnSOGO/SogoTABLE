// Module metadata for Hearts (descriptive; registration is via registry.js).
export const heartsManifest = {
  id: "hearts", // registry alias — resolves to the opaque GAME_IDS.hearts
  name: "♥ Hearts",
  description:
    "The classic 4-player trick-taking chase. Pass three cards, follow suit, and dodge every " +
    "heart (1 point each) and the Queen of Spades (13) — or take them ALL and shoot the moon. " +
    "Lowest score wins when someone crosses the target. Host options at table creation: Jack " +
    "of Diamonds (−10), no blood on the first trick, old/new moon scoring, and the target " +
    "score. Always exactly four seats — bots fill the table. Hands are secret — multi-phone " +
    "only: your cards stay on your own screen.",
  minPlayers: 4,
  maxPlayers: 4, // ALWAYS four (MojoSOGO 2026-07-04) — the one deliberate exception to the N-player convention
  timingMode: "turnBased", // strict clockwise tricks (hidden-info, Liar's-Dice-style projection)
  capabilities: ["hosted", "bot", "hiddenInfo"],
};
