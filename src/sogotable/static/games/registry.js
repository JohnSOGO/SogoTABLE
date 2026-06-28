// Single source of truth for game metadata, shared by BOTH runtimes:
//   - the browser app imports it directly (served as a static module)
//   - the Worker imports it via a relative path and esbuild bundles it
// Keep this pure data + pure helpers — no DOM, no Worker, no environment
// globals — so it is safe to load on either side.
//
// Adding or renaming a game happens here, once. The Worker's GAME_DEFINITIONS
// and the browser's fallbackGames both derive from GAME_REGISTRY, and the named
// id constants on both sides come from GAME_IDS, so the two can no longer drift.

// Opaque, stable game ids (used as the canonical game_id everywhere).
export const GAME_IDS = {
  classic: "a3f19c6e42b8",
  tactical: "d7e4a91f0c23",
  boxes: "4b7e2d9a6c10",
  battleship: "9c2f7a81d4e6",
  quoridor: "8f5d2c7a1b90",
  tenThousand: "6d10f4a2c8b3",
  yahtzee: "2c8a5f1e9d74",
  mazewright: "5e3b9a7c1f04",
};

// Display categories for the game-select screen, in the order they appear.
// Each game's `category` field points at one of these ids.
export const GAME_CATEGORIES = [
  { id: "paper", label: "Pen and Paper Games" },
  { id: "dice", label: "Dice Games" },
  { id: "board", label: "Board Games" },
];

export const GAME_REGISTRY = [
  {
    id: GAME_IDS.classic,
    name: "Super Tic Tac Toe",
    summary: "A nested tic tac toe duel where every move sends the next player to a target board.",
    players: "2 players",
    category: "paper",
    status: "Ready",
    availability: "ready",
    aliases: ["super_tic_tac_toe"],
  },
  {
    id: GAME_IDS.tactical,
    name: "Super Tic Tactical Toe",
    summary: "Ultimate tic tac toe with tactical coin and treasure pickups for bonus points.",
    players: "2 players",
    category: "paper",
    status: "Ready",
    availability: "ready",
    aliases: ["super_tactical_tac_toe"],
  },
  {
    id: GAME_IDS.boxes,
    name: "Dots and Boxes",
    summary: "Claim edges between dots, complete boxes, and keep the turn when you score.",
    players: "2 players",
    category: "paper",
    status: "Ready",
    availability: "ready",
    aliases: ["boxes", "dots_and_boxes", "dots_and_dashes"],
  },
  {
    id: GAME_IDS.battleship,
    name: "Battleship",
    summary: "Place your fleet, switch between defence and offence, and sink the enemy ships.",
    players: "2 players",
    category: "board",
    status: "Ready",
    availability: "ready",
    aliases: ["battleship", "battle_ship"],
  },
  {
    id: GAME_IDS.quoridor,
    name: "Quoridor",
    summary: "Race your pawn across the board while placing walls that slow your opponent without blocking every path.",
    players: "2 players",
    category: "board",
    status: "Ready",
    availability: "ready",
    aliases: ["quoridor"],
  },
  {
    id: GAME_IDS.tenThousand,
    name: "10,000",
    summary: "Roll six dice, keep the scoring dice, press your luck, and bank your way to 10,000.",
    players: "1+ players",
    player_count: null,
    host_start: true,
    category: "dice",
    status: "Ready",
    availability: "ready",
    aliases: ["ten_thousand", "10000", "dice_10000"],
  },
  {
    id: GAME_IDS.yahtzee,
    name: "Yahtzee",
    summary: "Roll five dice, fill your scorecard, and chase the high score — everyone plays their own game in parallel.",
    players: "1+ players",
    player_count: null,
    host_start: true,
    category: "dice",
    status: "Ready",
    availability: "ready",
    aliases: ["yahtzee", "yacht"],
  },
  {
    id: GAME_IDS.mazewright,
    name: "Mazewright",
    summary: "Build a fog-of-war dungeon, then everyone races each other's blind — fewest moves and most loot win the prizes.",
    players: "1+ players",
    player_count: null,
    host_start: true,
    category: "board",
    status: "Ready",
    availability: "ready",
    aliases: ["mazewright", "maze_wright", "dungeon_master"],
  },
];
