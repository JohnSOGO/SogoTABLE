# Quoridor AI Player Rules — Four Difficulty Levels

Version: 2026-06-19  
Target project: SogoTable  
Game: Quoridor / Corridor-style 9×9 wall race game

---

## 1. Baseline Game Assumptions

This AI spec assumes standard 2-player Quoridor unless a later variant explicitly changes it.

### Board

- Board is a **9×9 grid** of pawn cells.
- Each player starts on the center cell of their home edge.
- Each player tries to reach **any cell on the opposite edge**.
- Each player starts with **10 walls**.
- A turn consists of exactly one action:
  - Move pawn, or
  - Place one wall.

### Wall Rules

- A wall blocks movement between adjacent cells.
- A wall is two cell-edges long.
- Walls may not overlap existing walls.
- Walls may not cross existing walls.
- A wall placement is legal only if **every player still has at least one path to their goal edge**.

### Pawn Movement Rules

- A pawn normally moves one orthogonal step: up, down, left, or right.
- A pawn cannot move through a wall.
- If the opponent pawn is directly adjacent and the square behind it is open, the pawn may jump over it.
- If the direct jump is blocked by a wall or board edge, diagonal side-jump moves around the opponent are allowed where legal.

### AI Design Goal

The AI should feel progressively smarter without needing a giant chess-engine monster on day one.

The four levels are:

1. **Level 1 — Rookie**: mostly races forward, makes simple/random walls.
2. **Level 2 — Scout**: uses shortest paths and basic blocking.
3. **Level 3 — Tactician**: evaluates move quality, wall value, tempo, and threat states.
4. **Level 4 — Master**: shallow minimax/search with strong wall filtering and tactical traps.

---

## 2. Core Concepts Used by All Difficulty Levels

These helpers should exist in the game engine, not inside one AI file as spaghetti.

### State Inputs

The AI decision function should receive:

```js
state = {
  boardSize: 9,
  currentPlayerId,
  players: {
    [playerId]: {
      pawn: { row, col },
      goalEdge,
      wallsRemaining
    }
  },
  walls: [
    { row, col, orientation } // orientation: "H" or "V"
  ],
  turnNumber,
  legalMoves,
  legalWalls
}
```

### Move Output

The AI should return one action:

```js
{
  type: "MOVE",
  to: { row, col },
  reason: "advance_shortest_path"
}
```

or:

```js
{
  type: "WALL",
  wall: { row, col, orientation: "H" },
  reason: "increase_opponent_path"
}
```

### Required Helper Functions

Implement these once and reuse them across all levels.

```js
getLegalPawnMoves(state, playerId)
getLegalWallPlacements(state, playerId)
applyMove(state, action)
shortestPathLength(state, playerId)
shortestPathCells(state, playerId)
isWallLegal(state, wall)
pathExists(state, playerId)
cloneState(state)
randomChoice(list)
```

### Pathfinding

Use BFS for shortest path.

Why BFS?

- The board is small.
- Every pawn step has equal cost.
- BFS is simple, deterministic, and fast.
- It also doubles as the legality check for wall placement.

### Basic Evaluation Terms

For most AI levels, define:

```text
myDistance        = shortest path length for AI
opponentDistance  = shortest path length for opponent
wallCountDiff     = AI walls remaining - opponent walls remaining
raceScore         = opponentDistance - myDistance
```

Higher score is better for the AI.

A simple evaluation function:

```text
score =
  10 * (opponentDistance - myDistance)
  + 1.5 * wallCountDiff
```

Add more terms at higher difficulty.

---

## 3. Universal AI Safety Rules

These rules apply to every difficulty level.

### Rule A — Never Return Illegal Actions

The AI must only choose from engine-verified legal pawn moves and legal wall placements.

Do not let the AI "think" it can place an illegal wall and then patch it afterward. That creates ghost bugs. Generate legal options first.

### Rule B — Always Preserve Paths

Before considering a wall, confirm that both players still have a path to the goal.

```js
if (!pathExists(nextState, aiPlayerId)) rejectWall();
if (!pathExists(nextState, opponentId)) rejectWall();
```

### Rule C — Win Immediately

If the AI can move onto its goal edge this turn, it must do so.

```text
If any legal pawn move wins the game:
  choose winning move
```

No wall is better than winning. Obviously. But games need this rule because bots love finding creative ways to be stupid.

### Rule D — Block Immediate Opponent Win

If the opponent can win on their next move, the AI should block if a legal wall can prevent it. If no wall can prevent it, race toward the goal.

### Rule E — Do Not Waste Final Walls

When the AI has only 1 wall left, wall placement must provide clear value:

```text
wallValue = opponentNewDistance - opponentOldDistance
```

Only spend the last wall if:

```text
wallValue >= 2
```

Exception: block immediate opponent win.

---

## 4. Difficulty Level 1 — Rookie

### Personality

Rookie is beatable. It understands movement but barely understands walls.

It should feel like a kid who learned the rules five minutes ago and is now dangerous mostly by accident.

### Behavior Summary

- Mostly moves toward the goal.
- Sometimes places a random legal wall.
- Does not deeply evaluate wall quality.
- Makes occasional suboptimal choices on purpose.

### Decision Priority

1. Take winning move if available.
2. 75% chance: move along shortest path.
3. 25% chance: place a random legal wall, if walls remain.
4. If no useful wall exists, move randomly among legal forward-ish moves.

### Rookie Movement Rule

Find AI shortest path. Move to the next cell on that path.

If multiple shortest moves exist:

- 70% choose best shortest-path move.
- 30% choose random legal move.

### Rookie Wall Rule

Pick a random legal wall from a filtered list.

Filter out walls that:

- Increase AI distance by more than 1.
- Do not touch or sit near the opponent shortest path.

If no wall passes filter, move instead.

### Rookie Pseudocode

```js
function chooseRookieMove(state, aiId) {
  const winMove = findImmediateWinningMove(state, aiId);
  if (winMove) return winMove;

  const legalMoves = getLegalPawnMoves(state, aiId);
  const legalWalls = getLegalWallPlacements(state, aiId);

  if (hasWalls(state, aiId) && legalWalls.length > 0 && Math.random() < 0.25) {
    const candidateWalls = legalWalls.filter(wall => isNearOpponentShortestPath(state, wall));
    if (candidateWalls.length > 0) {
      return {
        type: "WALL",
        wall: randomChoice(candidateWalls),
        reason: "rookie_random_block"
      };
    }
  }

  if (Math.random() < 0.70) {
    return nextMoveOnShortestPath(state, aiId);
  }

  return {
    type: "MOVE",
    to: randomChoice(legalMoves),
    reason: "rookie_random_move"
  };
}
```

---

## 5. Difficulty Level 2 — Scout

### Personality

Scout is the first real AI. It races intelligently and blocks obvious routes.

It does not search deeply, but it understands the main Quoridor question:

> Is my move better, or is slowing the opponent better?

### Behavior Summary

- Always computes both shortest paths.
- Compares moving versus walling.
- Places walls that increase opponent path length.
- Avoids walls that hurt itself too much.
- Blocks immediate threats.

### Decision Priority

1. Take winning move.
2. Block opponent immediate win if possible.
3. If AI is ahead, mostly move.
4. If AI is behind or tied, consider wall.
5. Choose the action with the best simple score.

### Wall Evaluation

For each legal wall:

```text
opponentGain = opponentDistanceAfter - opponentDistanceBefore
selfPain     = myDistanceAfter - myDistanceBefore
wallScore    = 3 * opponentGain - 2 * selfPain
```

Only consider walls where:

```text
opponentGain >= 1
selfPain <= 1
wallScore > 0
```

### Move Evaluation

For each legal pawn move:

```text
moveScore =
  4 * (myDistanceBefore - myDistanceAfter)
  + 1 * (opponentDistanceAfter - myDistanceAfter)
```

Usually this rewards moving closer to goal.

### Scout Strategy Rules

#### When Ahead

If:

```text
myDistance + 1 < opponentDistance
```

Prefer moving unless a wall increases opponent path by 3 or more.

#### When Behind

If:

```text
myDistance > opponentDistance
```

Prefer walling if the best wall has positive value.

#### When Tied

If distances are equal, wall if it creates at least a 2-step opponent penalty and does not increase AI distance.

### Scout Pseudocode

```js
function chooseScoutMove(state, aiId) {
  const opponentId = getOpponentId(state, aiId);

  const winMove = findImmediateWinningMove(state, aiId);
  if (winMove) return winMove;

  const emergencyWall = findWallThatStopsImmediateOpponentWin(state, aiId, opponentId);
  if (emergencyWall) return emergencyWall;

  const bestMove = scoreBestPawnMove(state, aiId);
  const bestWall = scoreBestSimpleWall(state, aiId, opponentId);

  if (!bestWall) return bestMove.action;

  const myDist = shortestPathLength(state, aiId);
  const oppDist = shortestPathLength(state, opponentId);

  if (myDist + 1 < oppDist && bestWall.opponentGain < 3) {
    return bestMove.action;
  }

  if (bestWall.score > bestMove.score) {
    return bestWall.action;
  }

  return bestMove.action;
}
```

---

## 6. Difficulty Level 3 — Tactician

### Personality

Tactician should be legitimately challenging for casual players.

It understands tempo, wall economy, path shape, and forcing moves.

### Behavior Summary

- Uses stronger evaluation.
- Looks for high-impact walls near shortest path choke points.
- Avoids wasting walls when already winning the race.
- Recognizes when the opponent has too many wall resources.
- Can choose a temporary detour if it avoids a trap.

### Evaluation Function

Use a weighted board evaluation:

```text
score =
  12.0 * (opponentDistance - myDistance)
  + 2.0 * (myWallsRemaining - opponentWallsRemaining)
  + 4.0 * mobilityDiff
  + 3.0 * goalLaneControl
  - 5.0 * selfTrapRisk
  + 6.0 * opponentTrapPressure
```

Where:

```text
mobilityDiff = myLegalPawnMoves - opponentLegalPawnMoves
```

```text
goalLaneControl = number of shortest or near-shortest paths available to AI
                  minus number available to opponent
```

```text
selfTrapRisk = penalty if AI has only one narrow route and opponent still has walls
```

```text
opponentTrapPressure = bonus if opponent shortest path has a choke point that can be extended
```

### Wall Candidate Filtering

Do not evaluate every legal wall blindly unless performance is trivial. Generate candidate walls.

Candidate walls should include:

1. Walls touching opponent shortest path.
2. Walls crossing opponent shortest path direction changes.
3. Walls that increase opponent shortest path by at least 1.
4. Walls that create or extend a corridor.
5. Emergency walls that prevent opponent from winning soon.

Reject walls that:

- Increase AI path by 2 or more unless emergency.
- Fail to increase opponent path.
- Spend final wall for less than 2 opponent steps.
- Create a simpler route for opponent after recomputation.

### Tempo Rules

#### Race Winning Rule

If AI is ahead by 2+ steps:

```text
Prefer moving unless wall creates massive delay.
```

Massive delay:

```text
opponentGain >= 3 and selfPain == 0
```

#### Race Losing Rule

If AI is behind:

```text
Prefer walling if best wall changes race score by 2 or more.
```

Race score change:

```text
(oldOpponentDistance - oldMyDistance)
compared to
(newOpponentDistance - newMyDistance)
```

#### Wall Economy Rule

If AI has fewer walls than opponent:

- Be stingier with walls.
- Require stronger wall value.

If AI has more walls than opponent:

- Spend walls more aggressively to preserve tempo.

### Tactical Threat Rules

#### Threat: Opponent Can Win in 1

Block if possible.

#### Threat: Opponent Can Win in 2

If AI cannot also win in 2 or less, strongly consider a wall.

#### Threat: AI Can Force Win

If AI reaches goal in 2 and opponent cannot block both routes, move.

### Tactician Pseudocode

```js
function chooseTacticianMove(state, aiId) {
  const opponentId = getOpponentId(state, aiId);

  const winMove = findImmediateWinningMove(state, aiId);
  if (winMove) return winMove;

  const emergencyWall = findWallThatStopsImmediateOpponentWin(state, aiId, opponentId);
  if (emergencyWall) return emergencyWall;

  const moveCandidates = getLegalPawnMoves(state, aiId).map(move => ({
    action: { type: "MOVE", to: move, reason: "tactician_move_eval" },
    score: evaluateState(applyMove(state, { type: "MOVE", to: move }), aiId)
  }));

  const wallCandidates = generateTacticalWallCandidates(state, aiId, opponentId).map(wall => ({
    action: { type: "WALL", wall, reason: "tactician_wall_eval" },
    score: evaluateState(applyMove(state, { type: "WALL", wall }), aiId)
  }));

  const allCandidates = [...moveCandidates, ...wallCandidates];
  allCandidates.sort((a, b) => b.score - a.score);

  return addSmallRandomness(allCandidates, 0.08).action;
}
```

### Controlled Randomness

Tactician should not always play the exact same move.

Use tiny randomness:

```text
92% choose best action
8% choose among top 3 actions
```

This makes the bot feel less robotic without turning it into a slot machine.

---

## 7. Difficulty Level 4 — Master

### Personality

Master is meant to be hard. It should punish lazy play.

It does not need perfect play, but it should feel like it sees traps before the human does.

### Behavior Summary

- Uses minimax or negamax search.
- Searches pawn moves and filtered wall candidates.
- Uses alpha-beta pruning.
- Uses transposition caching.
- Extends search in tactical/endgame situations.
- Uses deterministic best play or tiny randomness only among nearly equal moves.

### Recommended Search

Use depth-limited negamax:

```text
Depth 1: AI move only
Depth 2: AI move + opponent response
Depth 3: AI move + opponent + AI
Depth 4: stronger but potentially heavier
```

Recommended default:

```text
Normal game: depth 2 or 3
Endgame / low wall count: depth 4
```

Because Quoridor has many wall placements, filtering is mandatory. Raw full-width search will get ugly fast.

### Candidate Generation

For each search node, generate:

#### Pawn Moves

- All legal pawn moves.

#### Wall Moves

Only include walls that meet at least one condition:

- Increase opponent shortest path.
- Block a shortest path cell-edge.
- Prevent opponent win in 1 or 2.
- Create a choke point near opponent goal route.
- Defend AI route from a known opponent wall threat.

Hard cap wall candidates:

```text
Maximum wall candidates per node: 12
```

Then sort by wall value before search.

### Master Evaluation Function

```text
score =
  20.0 * terminalScore
  + 14.0 * (opponentDistance - myDistance)
  + 2.5  * (myWallsRemaining - opponentWallsRemaining)
  + 3.0  * mobilityDiff
  + 4.0  * routeFlexibilityDiff
  + 6.0  * opponentChokePressure
  - 7.0  * selfChokeRisk
  + 2.0  * centerLineProgress
```

Terminal score:

```text
AI has won:       +100000
Opponent has won: -100000
Otherwise:        0
```

### Route Flexibility

Count how many paths are within 1 or 2 steps of the shortest path.

```text
routeFlexibility = nearShortestPathCount
```

A player with only one viable route is vulnerable. A player with multiple near-shortest routes is harder to wall off.

### Search Rules

#### Alpha-Beta

Use alpha-beta pruning.

#### Transposition Cache

Cache evaluated board states.

Hash should include:

- AI pawn location.
- Opponent pawn location.
- Wall positions and orientations.
- Walls remaining.
- Player to move.

```js
cacheKey = hashState(state, currentPlayerId, depthRemaining)
```

#### Move Ordering

Order candidates:

1. Immediate wins.
2. Emergency blocks.
3. Pawn moves that reduce distance.
4. Walls with highest opponent distance gain.
5. Other legal moves.

Move ordering matters. Alpha-beta without move ordering is like putting racing tires on a shopping cart.

### Master Pseudocode

```js
function chooseMasterMove(state, aiId) {
  const depth = chooseSearchDepth(state, aiId);
  const candidates = generateOrderedCandidates(state, aiId);

  let best = null;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const action of candidates) {
    const nextState = applyMove(state, action);
    const score = -negamax(nextState, getOpponentId(state, aiId), aiId, depth - 1, -beta, -alpha);

    if (!best || score > best.score) {
      best = { action, score };
      alpha = Math.max(alpha, score);
    }
  }

  return chooseAmongNearTies(best, candidates, 0.02);
}

function negamax(state, playerToMove, aiId, depth, alpha, beta) {
  if (isTerminal(state) || depth === 0) {
    return evaluateStateForPlayer(state, aiId);
  }

  const key = hashState(state, playerToMove, depth);
  if (transpositionCache.has(key)) return transpositionCache.get(key);

  let bestScore = -Infinity;
  const candidates = generateOrderedCandidates(state, playerToMove);

  for (const action of candidates) {
    const nextState = applyMove(state, action);
    const score = -negamax(nextState, getOpponentId(state, playerToMove), aiId, depth - 1, -beta, -alpha);

    bestScore = Math.max(bestScore, score);
    alpha = Math.max(alpha, score);

    if (alpha >= beta) break;
  }

  transpositionCache.set(key, bestScore);
  return bestScore;
}
```

### Search Depth Selection

```js
function chooseSearchDepth(state, aiId) {
  const totalWallsRemaining = sumWallsRemaining(state);
  const myDist = shortestPathLength(state, aiId);
  const oppDist = shortestPathLength(state, getOpponentId(state, aiId));

  if (myDist <= 3 || oppDist <= 3) return 4;
  if (totalWallsRemaining <= 4) return 4;
  return 3;
}
```

---

## 8. Difficulty Comparison Table

| Level | Name | Pathfinding | Wall Logic | Search | Randomness | Intended Feel |
|---:|---|---|---|---|---|---|
| 1 | Rookie | Basic shortest path | Random-ish legal walls | None | High | Beginner / kid-friendly |
| 2 | Scout | Shortest path for both players | Simple wall scoring | None | Low-medium | Competent casual bot |
| 3 | Tactician | Shortest + route flexibility | Tactical wall candidates | 1-ply evaluation | Low | Strong casual player |
| 4 | Master | Full evaluation | Filtered high-value walls | Minimax / negamax | Very low | Hard mode |

---

## 9. Recommended Implementation Structure

Keep AI logic modular.

```text
/src/games/quoridor/
  rules.js
  pathfinding.js
  moveGenerator.js
  wallValidation.js
  ai/
    quoridorAi.js
    rookie.js
    scout.js
    tactician.js
    master.js
    evaluation.js
    candidateWalls.js
```

### Public AI Entry Point

```js
export function chooseQuoridorAiAction(state, aiPlayerId, difficulty) {
  switch (difficulty) {
    case "rookie":
      return chooseRookieMove(state, aiPlayerId);
    case "scout":
      return chooseScoutMove(state, aiPlayerId);
    case "tactician":
      return chooseTacticianMove(state, aiPlayerId);
    case "master":
      return chooseMasterMove(state, aiPlayerId);
    default:
      return chooseScoutMove(state, aiPlayerId);
  }
}
```

---

## 10. SogoTable Integration Notes

### Deterministic AI Option

For replay/debugging, support seeded randomness.

```js
chooseQuoridorAiAction(state, aiPlayerId, difficulty, rng)
```

This matters for:

- Replays.
- Debugging.
- Multiplayer sync.
- Explaining bot decisions.

### AI Thinking Delay

Do not actually make the engine wait.

Instead, the UI can show a fake thinking delay:

```text
Rookie:     300–700 ms
Scout:      400–900 ms
Tactician:  600–1200 ms
Master:     800–1600 ms
```

But the game state should resolve from a clean event:

```text
AI_REQUESTED
AI_ACTION_SELECTED
ACTION_APPLIED
ROUND_OR_TURN_ADVANCED
```

### Explainability

Each AI action should include a `reason` string.

Examples:

```text
winning_move
block_opponent_win
advance_shortest_path
increase_opponent_path
preserve_wall_advantage
master_search_best_score
```

This helps debugging and can become player-facing later.

---

## 11. Testing Checklist

### Rules Tests

- AI never places an overlapping wall.
- AI never places a crossing wall.
- AI never places a wall that blocks all paths.
- AI never moves through a wall.
- AI handles pawn jumps correctly.
- AI handles diagonal side-jumps correctly.
- AI wins immediately when possible.
- AI blocks immediate opponent win when possible.

### Difficulty Tests

#### Rookie

- Sometimes makes imperfect moves.
- Usually moves toward goal.
- Does not crash if no walls remain.

#### Scout

- Chooses path-shortening moves.
- Places walls that increase opponent path.
- Avoids walls that hurt itself badly.

#### Tactician

- Saves walls when ahead.
- Uses walls when behind.
- Recognizes two-move threats.
- Prefers choke-point walls.

#### Master

- Produces legal moves under search.
- Search completes within time budget.
- Cache does not return stale evaluations.
- Endgame search is stronger than Scout/Tactician.

---

## 12. Performance Targets

For a browser/mobile game:

```text
Rookie:     < 5 ms
Scout:      < 20 ms
Tactician:  < 75 ms
Master:     < 300 ms preferred, < 750 ms max
```

If Master exceeds budget:

1. Reduce wall candidates.
2. Reduce search depth.
3. Improve move ordering.
4. Add or improve transposition cache.
5. Stop searching when a forced win is found.

---

## 13. Practical First Build Recommendation

Build in this order:

1. Legal move generation.
2. BFS shortest path.
3. Legal wall validation.
4. Rookie AI.
5. Scout AI.
6. Tactician evaluation.
7. Master search.

Do not start with Master. That is how simple games become haunted mansions.

The correct first milestone is:

> A bot that always makes a legal move and usually moves toward its goal.

Then make it meaner.

---

## 14. Source Notes

This spec assumes standard Quoridor-style rules: a 9×9 board, 10 walls per player in the two-player game, turn choice between moving a pawn or placing a wall, and the rule that wall placement must always leave each player at least one path to the goal edge.

Useful references:

- Gigamic / Quoridor rulebook mirror: https://cdn.1j1ju.com/medias/fe/36/08-quoridor-rulebook.pdf
- Hachette Boardgames Quoridor overview: https://www.hachetteboardgames.com/products/quoridor
- Quoridor AI example using Monte Carlo tree search: https://gorisanson.github.io/quoridor-ai/
- Solving Quoridor article: https://grantslatton.com/solving-quoridor

