// Chinese Checkers — every user-facing word lives here.
//
// Renaming the game (or calling marbles "pegs", holes "spots", …) is a one-file
// edit: the UI modules read names and phrases ONLY from this file. The opaque
// game id (6bc129b1bbed / alias "chinese_checkers") never changes. If you rename
// the game, also update `name` in manifest.js and games/registry.js (the
// architecture test pins those two equal).
export const GAME_NAME = "Chinese Checkers";
export const GAME_EMOJI = "⭐";

export const MARBLE = "marble";
export const MARBLES = "marbles";
export const HOLE = "hole";
export const HOP = "hop";
export const marbleWord = (n) => (n === 1 ? MARBLE : MARBLES);

export const TEAM_NAMES = ["Team Sun", "Team Moon", "Team Star"];
export const teamName = (team) => TEAM_NAMES[team] || `Team ${Number(team) + 1}`;

// Lobby copy + host options (keys are the PLAN.md `cc_options` keys).
export const LOBBY = {
  heading: "Players",
  blurb: "Race your marbles across the star to the opposite point. Pick how the table plays below.",
  seatHint: "2, 3, 4 or 6 players is standard — 5 leaves one point of the star empty.",
  teamsHint: "Teams need 4 or 6 players: partners sit on opposite points.",
  sections: { mode: "Mode", rules: "Rules", helps: "Helps" },
  rulesClassic: "classic",
  rulesChanged: (n) => `${n} changed`,
  // Play modes (PLAN.md "Play modes"); desc gets the chosen clock in seconds.
  modes: {
    rounds: { label: "Rounds", desc: () => "Everyone picks in secret, then the moves play out in a rotating priority order." },
    blitz: { label: "Blitz", desc: (s) => `Chaos! First come, first served — a new round every ${s || 10}s. Miss it and you lose your turn.` },
    live: { label: "Live", desc: () => "Everyone moves whenever they like; the round ends when all have moved or the clock runs out." },
    turns: { label: "Turns", desc: () => "Classic: one at a time, around the table." },
  },
  timerHint: {
    rounds: "Optional: lock in before it runs out or lose the round",
    blitz: "Length of every round",
    live: "Longest a round can last",
    turns: "Optional: move before it runs out or lose your turn",
  },
  marbles15Hint: "15 marbles is the 2-player set — it needs exactly 2 players.",
  options: {
    timer: { label: "Clock", hint: "" },
    chains: { label: "Hop chains", hint: "On: keep hopping as long as you can · Off: one hop per move (kids' rule)" },
    allow_pass: { label: "Passing", hint: "Allowed any time · Standard: only when you have no move" },
    assists: { label: "Move hints", hint: "Full: every reachable hole lights up, tap far to auto-route · Moves: next step or hop only · Off: no hints, hop by hop" },
    jumps: { label: "Jumps", hint: "Standard hops over a neighbour · Long hops over a marble any distance away, landing as far beyond" },
    marbles: { label: "Marbles each", hint: "10 is the classic race · 6 is quick · 15 is the 2-player set" },
    capture: { label: "Capture", hint: "Off · Send home: opponents you hop over go back to their start" },
    teams: { label: "Teams", hint: "opposite points play as partners and win together" },
    stay_in_goal: { label: "Stay in goal", hint: "a marble that reaches the goal can't end a move outside it" },
    no_parking: { label: "No parking", hint: "moves may not end in a point that is neither your start nor your goal" },
    anti_block: { label: "Anti-block", hint: "a full goal with more than half of the marbles yours counts as finished" },
    end: { label: "Game ends", hint: "First home wins · or play on until everyone is ranked" },
  },
  values: {
    standard: "Standard", long: "Long",
    off: "Off", send_home: "Send home",
    on: "On",
    first: "First home", all: "Rank all",
    allowed: "Allowed", only_stuck: "Standard",
    full: "Full", moves: "Moves only",
    secs: (n) => (n ? `${n}s` : "Off"),
  },
};

// Status strip, buttons, table.
export const UI = {
  round: (n) => `Round ${n}`,
  turn: (n) => `Turn ${n}`,
  movedCount: (done, total) => `${done}/${total} moved`,
  turnBadge: (name, mine) => (mine ? "Your turn!" : `${name}'s turn`),
  yourTurn: "Your turn!",
  waitTurn: (name) => `Waiting for ${name}…`,
  moved: (waiting) => (waiting.length ? `Moved — waiting for ${listNames(waiting)}…` : "Moved — the round is closing…"),
  movedNext: ["Moved — next round in ", "s"], // seconds go in between (live countdown)
  offPick: "Tap one of your marbles.",
  offPicked: (verb) => `Tap the holes to hop to, one by one, then ${verb}.`,
  offPath: (verb) => `Tap the next hole, or ${verb}.`,
  timedOut: "Out of time — you lost this turn.",
  clockTitle: "Time left",
  move: "Move",
  movedDone: "Moved ✓",
  priority: (k, n) => `Priority #${k}`,
  priorityTitle: (k, n) => `This round you resolve ${ordinal(k)} of ${n} — if two moves want the same hole, the lower number wins it`,
  lockedCount: (done, total) => `${done}/${total} locked`,
  pick: "Tap one of your glowing marbles.",
  picked: "Tap a ring: solid = step, pulsing = hop.",
  chain: (verb) => `Keep hopping, or ${verb}.`, // verb = the primary button (Lock in / Move)
  passThrough: "You can hop through here but not stop — keep going.",
  sending: "Sending…",
  locked: (waiting) => (waiting.length ? `Locked in — waiting for ${listNames(waiting)}…` : "Locked in — the round is resolving…"),
  lockedPass: (waiting) => (waiting.length ? `Passing — waiting for ${listNames(waiting)}…` : "Passing — the round is resolving…"),
  skipped: "You were skipped this round — you're back next round.",
  finished: (rank) => `Home! You finished ${ordinal(rank)}.`,
  noMoves: "No legal move this round — Pass.",
  spectating: "Watching the race.",
  replaying: "Replaying last round…",
  gameOver: "Race over!",
  takenNow: "That move is no longer open — pick again.",
  lock: "Lock in",
  change: "Change move",
  undo: "Undo",
  clear: "Clear",
  pass: "Pass",
  colPlayer: "Player",
  colGoal: "Goal",
  colDist: "Left",
  colStatus: "Status",
  distTitle: "Steps still to travel (0 = home)",
  statusThinking: "Thinking",
  statusLocked: "Locked",
  statusSkipped: "Skipped",
  statusFinished: (rank) => `Home ${ordinal(rank)}`,
  statusBot: "Bot",
  statusMoved: "Moved",
  statusTurn: "Turn",
  statusWaiting: "Waiting",
  skipVote: (votes, needed) => `⏭ ${votes}/${needed}`,
  skipTitle: (name) => `Vote to skip ${name} this round (everyone who has locked in must agree)`,
  you: "you",
  results: "Final standings",
  colRank: "#",
  colScore: "Score",
  winner: (names) => `${listNames(names)} ${names.length > 1 ? "win the race" : "wins the race"}!`,
  teamWinner: (team, names) => `${teamName(team)} wins — ${listNames(names)}!`,
  finishedYes: "Home",
  finishedNo: (d) => `${d} to go`,
  tickerPage: (i, n) => `${i}/${n}`,
};

// Ticker phrases built from server events (`name` already resolved).
export const TICKER = {
  round: (n, firstName) => `Round ${n} — ${firstName} has priority`,
  liveRound: (n) => `Round ${n} — go!`,
  timeout: (name) => `${name} ran out of time`,
  step: (name) => `${name} stepped`,
  hops: (name, n) => (n > 1 ? `${name} chained ${n} hops!` : `${name} hopped`),
  cut: (name, byName) => (byName ? `${name}'s move was cut short — ${byName} had priority` : `${name}'s move was cut short`),
  bounced: (name, byName) => (byName ? `${name} bounced — ${byName} had priority` : `${name}'s move bounced`),
  captured: (name, victims) => `${name} sent ${listNames(victims)} home!`,
  pass: (name) => `${name} passed`,
  skip: (name) => `${name} was skipped`,
  finish: (name, rank) => `${name} is home — ${ordinal(rank)}!`,
  end: (names) => (names.length ? `Race over — ${listNames(names)} ${names.length > 1 ? "win" : "wins"}!` : "Race over"),
};

export function ordinal(n) {
  const v = Number(n) || 0;
  const s = ["th", "st", "nd", "rd"];
  const m = v % 100;
  return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`;
}

export function listNames(names) {
  const list = (names || []).filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  if (list.length > 3) return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}
