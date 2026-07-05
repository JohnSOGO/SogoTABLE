// Room outcome stats — completed-room recording, Elo ratings, high scores, and
// personal stats. Extracted verbatim from the Worker entry (preparatory refactor
// ahead of the Mazewright gate-fix batch) so the golden-tables concern has one
// owner. Mutates only `data.stats`; the Worker decides WHEN to record (route
// side-effect dispatch), this module decides WHAT a completed room is worth.
// Must not import workers/sogotable-api.js (see docs/module-ownership.md).
import {
  GAME_DEFINITIONS, cleanGameId, gameIdsForLookup,
} from "./game-catalog.js";
import { publicPlayers, roomStatus } from "./projections.js";
import { BOT_DEFINITIONS, isBotSeat } from "./games/bots.js";
import { isTenThousandGame } from "./games/ten-thousand/rules.js";
import { isYahtzeeGame, yahtzeeScoreByMark } from "./games/yahtzee/rules.js";
import { isMazewrightGame, mazewrightScoreByMark } from "./games/mazewright/rules.js";
import { isRttaGame, rttaScoreByMark } from "./games/rtta/rules.js";
import { isZombieDiceGame, zombieDiceScoreByMark } from "./games/zombie-dice/rules.js";
import { isLiarsDiceGame, liarsDiceScoreByMark } from "./games/liars-dice/rules.js";
import { isNoThanksGame, noThanksScoreByMark } from "./games/no-thanks/rules.js";
import { isHeartsGame, heartsScoreByMark } from "./games/hearts/rules.js";
import { isBoxesGame } from "./games/boxes/rules.js";
import { isTacticalGame } from "./games/super-tic-tac-toe/rules.js";

const DEFAULT_ELO_RATING = 1000;
const ELO_K_FACTOR = 32;

export function recordCompletedRoomStats(data, room) {
  if (!room || room.stats_recorded || roomStatus(room) !== "completed") return;
  ensureStats(data);
  const result = roomResultForStats(room);
  updateHighScores(data, room, result);
  updatePersonalStats(data, room, result);
  updateEloRatings(data, room, result);
  room.stats_recorded = true;
}

function roomResultForStats(room) {
  const scoreByMark = scoreByMarkForRoom(room);
  const winnerMark = room.game.winner || null;
  const winner = winnerMark ? room.players.find((seat) => seat.mark === winnerMark) || null : null;
  return {
    winner_mark: winnerMark,
    winner_id: winner ? winner.id : null,
    score_by_mark: scoreByMark,
  };
}

function scoreByMarkForRoom(room) {
  if (isTenThousandGame(room.game)) {
    const scores = {};
    (room.game.seat_order || []).forEach((mark) => {
      const seat = room.game.players && room.game.players[mark];
      scores[mark] = Number(seat && seat.score || 0);
    });
    return scores;
  }
  if (isYahtzeeGame(room.game)) {
    return yahtzeeScoreByMark(room.game);
  }
  if (isMazewrightGame(room.game)) {
    return mazewrightScoreByMark(room.game);
  }
  if (isRttaGame(room.game)) return rttaScoreByMark(room.game);
  if (isZombieDiceGame(room.game)) return zombieDiceScoreByMark(room.game);
  if (isLiarsDiceGame(room.game)) return liarsDiceScoreByMark(room.game); // dice still held at game end
  if (isNoThanksGame(room.game)) return noThanksScoreByMark(room.game); // penalty points: LOWER is better here
  if (isHeartsGame(room.game)) return heartsScoreByMark(room.game); // penalty points: LOWER is better here too
  if (isBoxesGame(room.game)) {
    return {
      X: Number(room.game.scores && room.game.scores.X || 0),
      O: Number(room.game.scores && room.game.scores.O || 0),
    };
  }
  if (isTacticalGame(room.game)) {
    return {
      X: Number(room.game.scores && room.game.scores.X || 0),
      O: Number(room.game.scores && room.game.scores.O || 0),
    };
  }
  return {
    X: room.game.winner === "X" ? 1 : 0,
    O: room.game.winner === "O" ? 1 : 0,
  };
}

function ensureStats(data) {
  if (!data.stats) data.stats = { high_scores: {}, ratings: {}, personal: {} };
  if (!data.stats.high_scores) data.stats.high_scores = {};
  if (!data.stats.ratings) data.stats.ratings = {};
  if (!data.stats.personal) data.stats.personal = {};
}

function updateHighScores(data, room, result) {
  const gameId = cleanGameId(room.game_id);
  if (!data.stats.high_scores[gameId]) data.stats.high_scores[gameId] = [];
  const entries = data.stats.high_scores[gameId];
  room.players.forEach((seat) => {
    if (isBotSeat(seat)) return;
    const score = Number(result.score_by_mark[seat.mark] || 0);
    if (score <= 0) return;
    entries.push({
      player_id: seat.id,
      player_name: seat.name,
      player_icon: seat.icon,
      score,
      room_code: room.code,
      mark: seat.mark,
      recorded_at: new Date().toISOString(),
    });
  });
  data.stats.high_scores[gameId] = entries
    .sort((left, right) => right.score - left.score || String(left.recorded_at).localeCompare(String(right.recorded_at)));
}

function updateEloRatings(data, room, result) {
  if (room.players.length !== 2) return;
  const gameId = cleanGameId(room.game_id);
  if (!data.stats.ratings[gameId]) data.stats.ratings[gameId] = {};
  const ratings = data.stats.ratings[gameId];
  const [left, right] = room.players;
  const leftRating = ratingEntry(ratings, left);
  const rightRating = ratingEntry(ratings, right);
  const leftScore = eloScoreFor(left, result);
  const rightScore = 1 - leftScore;
  const leftExpected = expectedEloScore(leftRating.rating, rightRating.rating);
  const rightExpected = expectedEloScore(rightRating.rating, leftRating.rating);
  leftRating.rating = Math.round(leftRating.rating + ELO_K_FACTOR * (leftScore - leftExpected));
  rightRating.rating = Math.round(rightRating.rating + ELO_K_FACTOR * (rightScore - rightExpected));
  applyEloRecord(leftRating, leftScore);
  applyEloRecord(rightRating, rightScore);
}

function updatePersonalStats(data, room, result) {
  const gameId = cleanGameId(room.game_id);
  if (!data.stats.personal[gameId]) data.stats.personal[gameId] = {};
  const personal = data.stats.personal[gameId];
  room.players.forEach((seat) => {
    if (isBotSeat(seat)) return;
    if (!personal[seat.id]) {
      personal[seat.id] = {
        player_id: seat.id,
        player_name: seat.name,
        player_icon: seat.icon,
        games_played: 0,
        games_won: 0,
        personal_high_score: 0,
      };
    }
    const entry = personal[seat.id];
    entry.player_name = seat.name;
    entry.player_icon = seat.icon;
    entry.games_played += 1;
    if (result.winner_id && result.winner_id === seat.id) entry.games_won += 1;
    entry.personal_high_score = Math.max(entry.personal_high_score || 0, Number(result.score_by_mark[seat.mark] || 0));
  });
}

function ratingEntry(ratings, player) {
  if (!ratings[player.id]) {
    const botDefinition = isBotSeat(player) ? BOT_DEFINITIONS.find((bot) => bot.id === player.bot_id || bot.id === player.id) : null;
    ratings[player.id] = {
      player_id: player.id,
      player_name: player.name,
      player_icon: player.icon,
      rating: botDefinition ? Number(botDefinition.rating || DEFAULT_ELO_RATING) : DEFAULT_ELO_RATING,
      bot: isBotSeat(player),
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
  }
  ratings[player.id].player_name = player.name;
  ratings[player.id].player_icon = player.icon;
  ratings[player.id].bot = isBotSeat(player);
  return ratings[player.id];
}

function eloScoreFor(player, result) {
  if (!result.winner_id) return 0.5;
  return player.id === result.winner_id ? 1 : 0;
}

function expectedEloScore(rating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

function applyEloRecord(entry, score) {
  entry.games += 1;
  if (score === 1) entry.wins += 1;
  else if (score === 0) entry.losses += 1;
  else entry.draws += 1;
}

export function refreshPlayerStats(data, player) {
  ensureStats(data);
  Object.values(data.stats.high_scores).forEach((entries) => {
    entries.forEach((entry) => {
      if (entry.player_id === player.id) {
        entry.player_name = player.name;
        entry.player_icon = player.icon;
      }
    });
  });
  Object.values(data.stats.ratings).forEach((ratings) => {
    const entry = ratings[player.id];
    if (!entry) return;
    entry.player_name = player.name;
    entry.player_icon = player.icon;
  });
  Object.values(data.stats.personal).forEach((entries) => {
    const entry = entries[player.id];
    if (!entry) return;
    entry.player_name = player.name;
    entry.player_icon = player.icon;
  });
}

export function publicStatsForGame(data, gameId) {
  ensureStats(data);
  const lookupIds = gameIdsForLookup(gameId);
  const selectablePlayerIds = new Set(publicPlayers(data).map((player) => player.id));
  const ratingsByPlayer = new Map();
  lookupIds.forEach((id) => {
    Object.values(data.stats.ratings[id] || {}).forEach((entry) => {
      if (!ratingsByPlayer.has(entry.player_id) || Number(entry.games || 0) > Number(ratingsByPlayer.get(entry.player_id).games || 0)) {
        ratingsByPlayer.set(entry.player_id, entry);
      }
    });
  });
  const ratings = [...ratingsByPlayer.values()]
    .filter((entry) => !entry.bot && selectablePlayerIds.has(entry.player_id))
    .sort((left, right) => right.rating - left.rating || String(left.player_name).localeCompare(String(right.player_name)));
  const highScores = lookupIds
    .flatMap((id) => data.stats.high_scores[id] || [])
    .filter((entry) => selectablePlayerIds.has(entry.player_id))
    .sort((left, right) => right.score - left.score || String(left.recorded_at).localeCompare(String(right.recorded_at)));
  return {
    high_scores: highScores,
    ratings,
  };
}

export function publicPlayerStats(data, playerId) {
  ensureStats(data);
  return GAME_DEFINITIONS.map((game) => {
    const lookupIds = gameIdsForLookup(game.id);
    const personalEntries = lookupIds.map((id) => data.stats.personal[id] && data.stats.personal[id][playerId] || null).filter(Boolean);
    const ratingEntries = lookupIds.map((id) => data.stats.ratings[id] && data.stats.ratings[id][playerId] || null).filter(Boolean);
    const topScore = lookupIds.flatMap((id) => data.stats.high_scores[id] || [])
      .filter((entry) => entry.player_id === playerId)
      .reduce((best, entry) => Math.max(best, Number(entry.score || 0)), 0);
    const personal = personalEntries.reduce((total, entry) => ({
      games_played: total.games_played + Number(entry.games_played || 0),
      games_won: total.games_won + Number(entry.games_won || 0),
      personal_high_score: Math.max(total.personal_high_score, Number(entry.personal_high_score || 0)),
    }), { games_played: 0, games_won: 0, personal_high_score: 0 });
    const rating = ratingEntries[0] || {};
    return {
      game_id: game.id,
      game_name: game.name,
      games_played: personalEntries.length ? personal.games_played : Number(rating.games || 0),
      games_won: personalEntries.length ? personal.games_won : Number(rating.wins || 0),
      personal_high_score: Number(personal.personal_high_score ?? topScore ?? 0),
      elo: Number(rating.rating || DEFAULT_ELO_RATING),
    };
  });
}

export function clearPlayerStats(data, playerId) {
  ensureStats(data);
  Object.keys(data.stats.high_scores).forEach((gameId) => {
    data.stats.high_scores[gameId] = (data.stats.high_scores[gameId] || []).filter((entry) => entry.player_id !== playerId);
  });
  Object.values(data.stats.ratings).forEach((ratings) => {
    delete ratings[playerId];
  });
  Object.values(data.stats.personal).forEach((entries) => {
    delete entries[playerId];
  });
}
