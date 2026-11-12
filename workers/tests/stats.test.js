// Room outcome stats: score direction (penalty-point games rank lowest first),
// the per-game leaderboard cap, scored games that used to fall through to the
// win/lose fallback, and win-only games that must not write leaderboard rows.
import test from "node:test";
import assert from "node:assert/strict";
import {
  recordCompletedRoomStats, publicStatsForGame, publicPlayerStats, MAX_HIGH_SCORES_PER_GAME,
} from "../stats.js";
import { GAME_IDS } from "../../src/sogotable/static/games/registry.js";

const seat = (id, mark, extra = {}) => ({ id, name: id, icon: "🙂", color: "#2563eb", mark, ...extra });
const freshData = (players) => ({ players: players.map((id) => ({ id, name: id, icon: "🙂", color: "#2563eb" })), stats: null });

function noThanksRoom(code, cardsByMark) {
  const marks = Object.keys(cardsByMark);
  const players = {};
  marks.forEach((mark) => { players[mark] = { mark, cards: cardsByMark[mark], chips: 0 }; });
  const winner = marks.reduce((best, mark) => (cardsByMark[mark][0] < cardsByMark[best][0] ? mark : best), marks[0]);
  return {
    code,
    game_id: GAME_IDS.noThanks,
    started: true,
    players: marks.map((mark, index) => seat(`p${index + 1}`, mark)),
    game: { game_id: GAME_IDS.noThanks, status: "complete", seat_order: marks, players, winner },
  };
}

test("stats: penalty-point games list the LOWEST score first, and a perfect 0 counts", () => {
  const data = freshData(["p1", "p2"]);
  recordCompletedRoomStats(data, noThanksRoom("AAAA", { P1: [30], P2: [3] }));
  recordCompletedRoomStats(data, noThanksRoom("BBBB", { P1: [], P2: [12] }));
  const board = publicStatsForGame(data, GAME_IDS.noThanks);
  assert.equal(board.score_order, "low");
  assert.deepEqual(board.high_scores.map((entry) => entry.score), [0, 3, 12, 30]);
});

test("stats: personal best follows the game's score direction", () => {
  const data = freshData(["p1", "p2"]);
  recordCompletedRoomStats(data, noThanksRoom("AAAA", { P1: [30], P2: [3] }));
  recordCompletedRoomStats(data, noThanksRoom("BBBB", { P1: [9], P2: [20] }));
  const p1 = publicPlayerStats(data, "p1").find((row) => row.game_id === GAME_IDS.noThanks);
  assert.equal(p1.personal_high_score, 9);
  assert.equal(p1.score_order, "low");
});

test("stats: each game's leaderboard is capped", () => {
  const data = freshData(["p1", "p2"]);
  for (let index = 0; index < MAX_HIGH_SCORES_PER_GAME; index += 1) {
    recordCompletedRoomStats(data, noThanksRoom(`R${index}`, { P1: [index + 3], P2: [index + 4] }));
  }
  assert.equal(data.stats.high_scores[GAME_IDS.noThanks].length, MAX_HIGH_SCORES_PER_GAME);
  assert.equal(data.stats.high_scores[GAME_IDS.noThanks][0].score, 3);
});

test("stats: Potion Lab records real scores instead of the X/O fallback", () => {
  const data = freshData(["p1", "p2"]);
  const room = {
    code: "PLAB",
    game_id: GAME_IDS.potionLab,
    started: true,
    players: [seat("p1", "P1"), seat("p2", "P2")],
    game: {
      game_id: GAME_IDS.potionLab,
      status: "complete",
      seat_order: ["P1", "P2"],
      players: { P1: { mark: "P1", score: 41 }, P2: { mark: "P2", score: 27 } },
      winner: "P1",
    },
  };
  recordCompletedRoomStats(data, room);
  const scores = (data.stats.high_scores[GAME_IDS.potionLab] || []).map((entry) => entry.score);
  assert.deepEqual(scores, [41, 27]);
});

test("stats: win-only games record the win but no leaderboard row", () => {
  const data = freshData(["p1", "p2"]);
  const room = {
    code: "STTT",
    game_id: GAME_IDS.classic,
    started: true,
    players: [seat("p1", "X"), seat("p2", "O")],
    game: { status: "x_won", winner: "X" },
  };
  recordCompletedRoomStats(data, room);
  assert.equal((data.stats.high_scores[GAME_IDS.classic] || []).length, 0);
  assert.equal(data.stats.personal[GAME_IDS.classic].p1.games_won, 1);
});
