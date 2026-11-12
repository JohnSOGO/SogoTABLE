// Hidden Isles over the real room API: lobby with bots, host start with
// options, crew setup, per-viewer chart masking, stale turns rejected loudly,
// bot crews paced by BOT_TICK, full playout, and a rematch that keeps crews.
import assert from "node:assert/strict";
import test from "node:test";
import { makeEnv, player, post, get } from "./helpers.js";
import { setHiddenIslesClock } from "../games/hidden-isles/rules.js";
import { clueProblem } from "../games/hidden-isles/clues.js";

test("Hidden Isles plays end-to-end over the room API", async () => {
  let now = 5_000_000;
  setHiddenIslesClock(() => now);
  try {
    const env = makeEnv();
    const host = player("hi-host", "Host");
    const guest = player("hi-guest", "Guest");
    await post(env, "/api/room/create", { game_id: "hidden_isles", player: host, code: "ISLE" });
    await post(env, "/api/room/join", { code: "ISLE", player: guest });
    const bots = await get(env, "/api/bots?game_id=hidden_isles");
    // Three seats can't start.
    await post(env, "/api/room/join-bot", { code: "ISLE", host_id: host.id, bot_id: bots.bots[2].id });
    const early = await post(env, "/api/room/start", { code: "ISLE", host_id: host.id });
    assert.equal(early.ok, false);
    assert.match(early.error, /at least 4 seats/);
    await post(env, "/api/room/join-bot", { code: "ISLE", host_id: host.id, bot_id: bots.bots[3].id });
    const started = await post(env, "/api/room/start", {
      code: "ISLE", host_id: host.id, hidden_isles_options: { pack: "easy", clue_ideas: true, team_marks: true },
    });
    assert.equal(started.ok, true, started.error);
    assert.equal(started.room.game.phase, "setup");
    assert.equal(started.room.game.options.pack, "easy");

    const markOf = (p) => started.room.players.find((s) => s.id === p.id).mark;
    const view = async (p) => (await get(env, `/api/room?code=ISLE&player_id=${p.id}`)).room.game;
    const move = (p, action) => post(env, "/api/room/move", { code: "ISLE", player_id: p.id, action });

    // Host = crew A Navigator, guest = crew B Navigator, bots crew both.
    const dealt = await move(guest, { type: "DEAL" });
    assert.equal(dealt.ok, true, dealt.error);
    let game = await view(host);
    assert.equal(game.you.role, "guide");
    assert.ok(game.board.every((t) => t.key), "Navigators see the chart");
    const spectator = (await get(env, "/api/room?code=ISLE")).room.game;
    assert.ok(spectator.board.every((t) => t.key === null), "spectators see no keys");

    // Stale turn stamp is rejected loudly.
    const guideFor = (team) => (markOf(host) === game.players.find((p) => p.team === team && p.role === "guide").mark ? host : guest);
    const stale = await move(guideFor(game.turn_team), { type: "CLUE", turn: game.turn + 3, word: "zyx", count: 1 });
    assert.equal(stale.ok, false);
    assert.match(stale.error, /Refresh to catch up/);

    let guard = 0;
    while (game.status !== "complete" && guard++ < 200) {
      if (game.phase === "clue") {
        const g = await view(guideFor(game.turn_team));
        const hidden = g.board.filter((t) => !t.revealed).map((t) => t.word);
        const idea = (g.clue_ideas || [])[0];
        const word = idea ? idea.word : ["zyx", "plonk", "vroom"].find((w) => !clueProblem(w, hidden));
        const res = await move(guideFor(game.turn_team), { type: "CLUE", turn: g.turn, word, count: idea ? idea.count : 1 });
        assert.equal(res.ok, true, res.error);
      } else {
        now += 10_000; // past the bot crew's think time
        const res = await move(host, { type: "BOT_TICK", turn: game.turn });
        assert.equal(res.ok, true, res.error);
      }
      game = await view(host);
    }
    assert.equal(game.status, "complete");
    assert.ok(["A", "B"].includes(game.winner_team));
    assert.ok(game.board.every((t) => t.key), "chart revealed at the end");

    const room = (await get(env, "/api/room?code=ISLE")).room;
    assert.equal(room.status, "completed");

    // Rematch: crews kept, Navigator passes to the next crew member (the bots).
    await post(env, "/api/room/reset", { code: "ISLE", requester_id: host.id });
    const reset = await post(env, "/api/room/reset", { code: "ISLE", requester_id: guest.id });
    assert.equal(reset.ok, true, reset.error);
    const next = reset.room.game;
    assert.equal(next.phase, "setup");
    assert.equal(next.options.pack, "easy");
    const before = Object.fromEntries(game.players.map((p) => [p.mark, p]));
    next.players.forEach((p) => assert.equal(p.team, before[p.mark].team));
    assert.equal(next.players.find((p) => p.mark === markOf(host)).role, "guesser");
  } finally {
    setHiddenIslesClock(null);
  }
});
