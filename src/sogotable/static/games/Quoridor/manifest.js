export const quoridorManifest = {
  id: "quoridor",
  name: "Quoridor",
  description: "Race your pawn across the board while placing walls that slow your opponent without blocking every path.",
  minPlayers: 2,
  maxPlayers: 2,
  timingMode: "turnBased",
  boardSize: 9,
  wallsPerPlayer: 10,
  capabilities: ["hosted", "hotSeat", "bot", "deterministic"],
};
