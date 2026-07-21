// Well, Now You Know — in-game UI adapter. The render/wiring code below the
// PORT GLUE section is LIFTED VERBATIM from the developed prototype
// (AI/cah/preview.html, LIFT SEAM 3) — the polished look and feel IS the
// deliverable (docs/adding-a-game.md hard rule; do not regenerate). Renders
// the prepared server projection and captures intent; it computes NO rule
// outcomes — hands, submissions, authorship, and the black card all arrive
// already masked per viewer by the worker sanitizer. All wiring is
// addEventListener — no inline onclick, no imports from app.js. Three glue
// edits inside the seam, each a sanctioned seam rewire: the exported entry
// name moved to the adapter, the ❤️ heart→next chain awaits the async
// makeMove, and the module UI-state key gained the room/epoch stamp.
import { renderHostStartLobby } from "../lobby.js";
import {
  wnykBlackCardHtml, wnykWhiteCardHtml, wnykFillChipHtml, wnykSentenceInner, wnykSentenceHtml,
  wnykHeroSentenceHtml, wnykSubmissionHtml, wnykSeatsHtml, wnykStandingsHtml, wnykHelpHtml,
} from "./cards.js";
import { WNYK_CSS } from "./styles.js";

var wnykStylesInjected = false;
function injectWnykStyles() {
  if (wnykStylesInjected) return;
  wnykStylesInjected = true;
  var style = document.createElement("style");
  style.textContent = WNYK_CSS;
  document.head.appendChild(style);
}

/* ===========================================================================
   PORT GLUE — the adapter between the shell's ctx bag and the seam's view
   contract (the two sanctioned rewire seams: data source + intent capture).
   Everything the prototype's harness computed locally is derived here from
   the server projection instead. Display-only mirrors (skip gates, the
   5-second commit grace) — the worker re-validates everything.
   ========================================================================== */

// Display mirror of the engine's WNYK_SUBMIT_GRACE_MS (server-enforced).
var WNYK_GRACE_MS = 5000;
var wnykLastCtx = null;   // for timer-driven repaints (countdown, skip gates)
var wnykGraceTimer = null;
var wnykGateTimer = null;
var wnykGateKey = "";
var wnykSwapIdx = null;   // one-paint dump-swap animation flags
var wnykBlackSwap = false;

// Client mirror of the engine's skip eligibility (display only): after the
// 2-minute gate, the waiting HUMAN players may vote to skip the stalled seat
// (2/3 majority) — a stalled submitter, or the judge in any judge-driven
// phase. The server owns the real eligibility and threshold.
function wnykSkipGates(game, viewerMark) {
  if (!game || game.status !== "playing" || !game.phase_started_at) return null;
  if (Date.now() - game.phase_started_at < (game.skip_delay_ms || 120000)) return null;
  var gates = {};
  var any = false;
  var humans = function (excludeMark) {
    return game.players.filter(function (s) { return !s.is_bot && s.mark !== excludeMark; })
      .map(function (s) { return s.mark; });
  };
  game.players.forEach(function (seat) {
    var eligible = null;
    if (!seat.is_bot) {
      if (game.phase === "submitting") {
        if (!seat.is_judge && !seat.submitted && !seat.skipped) eligible = humans(seat.mark);
      } else if (game.phase === "prompt" || game.phase === "judging") {
        if (seat.is_judge) eligible = humans(seat.mark);
      }
    }
    if (!eligible || eligible.indexOf(viewerMark) < 0) return;
    gates[seat.mark] = {
      votes: (game.skip_votes && game.skip_votes[seat.mark] || []).length,
      needed: Math.max(1, Math.ceil(eligible.length * (2 / 3))),
    };
    any = true;
  });
  return any ? gates : null;
}

function wnykRepaint() {
  if (wnykLastCtx) renderWnykGame(wnykLastCtx);
}

// Wrap the async shell makeMove: same call shape the seam expects, plus the
// one-paint swap-animation flags a successful 👎 dump earns (the harness got
// these from its sim; here they derive from the action + the pre-move hand).
function wnykWrapMakeMove(ctx, localMark) {
  return function (action) {
    var swapTarget = null;
    if (action && action.type === "rate" && ctx.game) {
      var me = ctx.game.players.find(function (seat) { return seat.mark === localMark; });
      var blackKey = wnykBlackRateKey(ctx.game);
      if (blackKey && action.card === blackKey) swapTarget = { black: true };
      else if (me && me.hand_rate_keys) {
        var idx = me.hand_rate_keys.indexOf(action.card);
        if (idx >= 0) swapTarget = { idx: idx };
      }
    }
    var result = ctx.makeMove(action);
    if (swapTarget) {
      Promise.resolve(result).then(function (err) {
        if (err) return;
        if (swapTarget.black) wnykBlackSwap = true;
        else wnykSwapIdx = swapTarget.idx;
      });
    }
    return result;
  };
}

export function renderWnykGame(ctx) {
  wnykLastCtx = ctx;
  var localSeat = (ctx.room && ctx.room.players || []).find(function (seat) { return seat.id === ctx.localPlayerId; });
  var localMark = localSeat ? localSeat.mark : null;
  var view = Object.assign({}, ctx, {
    localMark: localMark,
    makeMove: wnykWrapMakeMove(ctx, localMark),
    repaint: wnykRepaint,
    // The platform's rematch path is the header reset control — "Back to
    // Lobby" presses it (games never import the shell; this is user intent).
    playAgain: function () {
      var reset = document.getElementById("resetGame");
      if (reset) reset.click();
    },
  });
  wnykUi.roomEpoch = (ctx.room ? ctx.room.code : "") + "#" + (ctx.room ? ctx.room.game_epoch : "");
  if (ctx.started && ctx.game) {
    view.skipGates = wnykSkipGates(ctx.game, localMark);
    // 5-second commit grace: countdown repaint once a second while it runs
    // (display only — the worker rejects early submissions on its own clock).
    clearTimeout(wnykGraceTimer);
    if (ctx.game.phase === "submitting" && ctx.game.released_at) {
      view.graceMsLeft = Math.max(0, WNYK_GRACE_MS - (Date.now() - ctx.game.released_at));
      if (view.graceMsLeft > 0) wnykGraceTimer = setTimeout(wnykRepaint, Math.min(1000, view.graceMsLeft));
    }
    if (wnykSwapIdx !== null) { view.swappedIdx = wnykSwapIdx; wnykSwapIdx = null; }
    if (wnykBlackSwap) { view.blackSwapped = true; wnykBlackSwap = false; }
    // Skip-gate watcher: repaints when the 2-minute gate opens/changes.
    if (!wnykGateTimer) {
      wnykGateTimer = setInterval(function () {
        var ctxNow = wnykLastCtx;
        if (!ctxNow || !ctxNow.started || !ctxNow.game || ctxNow.game.status !== "playing") return;
        var seat = (ctxNow.room && ctxNow.room.players || []).find(function (s) { return s.id === ctxNow.localPlayerId; });
        var gates = wnykSkipGates(ctxNow.game, seat ? seat.mark : null);
        var key = gates ? JSON.stringify(gates) : "";
        if (key !== wnykGateKey) { wnykGateKey = key; wnykRepaint(); }
      }, 2000);
    }
  }
  renderWnyk(view);
}

/* ===========================================================================
   LIFTED SEAM (verbatim below — see header)
   ========================================================================== */

var wnykUi = { key: "", selection: [], composerOpen: false, composerText: "" };

function wnykResetUiIfStale(game) {
  var key = wnykUi.roomEpoch + ":" + game.round + ":" + game.phase;
  if (wnykUi.key === key) return;
  wnykUi.key = key;
  wnykUi.selection = [];
  wnykUi.composerOpen = false;
  wnykUi.composerText = "";
}

function renderWnyk(ctx) {
  injectWnykStyles();
  var host = ctx.host;
  if (!ctx.started) {
    renderWnykLobby(host, ctx);
    return;
  }
  renderWnykPlay(host, ctx);
}

// ---- lobby (shared host-start template + WNYK host options) ----
function renderWnykLobby(host, ctx) {
  var seats = (ctx.room && ctx.room.players || []).length;
  renderHostStartLobby(host, ctx, {
    wrap: "wnyk-root",
    heading: "Players",
    blurb: seats >= 3
      ? "Table's ready — deal them in."
      : "Well, Now You Know seats 3 or more (" + seats + "/3) — invite players or bots to fill the table.",
    extraHtml:
      '<div class="hx-options">' +
      '<div class="hx-opt"><div class="hx-opt-label"><b>Play to</b><span>first to this many round wins</span></div>' +
      '<div class="hx-seg" data-hx-opt="target_score"><button type="button" data-v="5">5</button><button type="button" data-v="7" class="hx-on">7</button><button type="button" data-v="10">10</button></div></div>' +
      '<div class="hx-opt"><div class="hx-opt-label"><b>Deck</b><span>Classic is adult — Kid-Friendly for family play</span></div>' +
      '<div class="hx-seg" data-hx-opt="deck"><button type="button" data-v="classic" class="hx-on">Classic</button><button type="button" data-v="family">Kid-Friendly</button></div></div>' +
      "</div>",
    getStartArg: function (lobbyHost) {
      var options = {};
      lobbyHost.querySelectorAll("[data-hx-opt]").forEach(function (seg) {
        var on = seg.querySelector(".hx-on");
        if (!on) return;
        var value = on.getAttribute("data-v");
        options[seg.getAttribute("data-hx-opt")] = /^\d+$/.test(value) ? Number(value) : value;
      });
      return options;
    },
    onMount: function (lobbyHost) {
      lobbyHost.querySelectorAll("[data-hx-opt] button").forEach(function (button) {
        button.addEventListener("click", function () {
          button.parentElement.querySelectorAll("button").forEach(function (other) { other.classList.remove("hx-on"); });
          button.classList.add("hx-on");
        });
      });
    },
  });
}

// ---- play ----
function renderWnykPlay(host, ctx) {
  var esc = ctx.escapeHtml;
  var game = ctx.game;
  wnykResetUiIfStale(game);
  var localMark = ctx.localMark;
  var me = game.players.find(function (seat) { return seat.mark === localMark; }) || null;
  var complete = game.status === "complete";
  var skipGates = ctx.skipGates || null;
  wnykUi.graceMsLeft = ctx.graceMsLeft || 0;
  var parts = [];

  parts.push(wnykSeatsHtml(esc, game, localMark, complete ? null : skipGates));
  parts.push('<p class="wk-msg' + (ctx.message && ctx.messageIsError ? " wk-error" : "") + '">' + esc(ctx.message || wnykStatusLine(game, me)) + "</p>");

  if (complete) {
    parts.push(wnykCompleteHtml(esc, game));
  } else if (game.phase === "prompt") {
    parts.push(wnykPromptHtml(esc, game, me, ctx));
  } else if (game.phase === "submitting") {
    parts.push(wnykSubmittingHtml(esc, game, me));
  } else if (game.phase === "judging") {
    parts.push(wnykJudgingHtml(esc, game, me));
  } else if (game.phase === "round_end") {
    parts.push(wnykRoundEndHtml(esc, game));
    parts.push('<div class="wk-commitbar"><button type="button" class="primary" data-act="next_round">Next Round</button></div>');
  }

  if (!complete) parts.push('<div class="wk-panel">' + wnykStandingsHtml(esc, game) + "</div>");
  parts.push(wnykHelpHtml());

  host.className = "macro-board";
  host.innerHTML = '<div class="wnyk-root">' + parts.join("") + "</div>";
  wireWnyk(host, ctx);
}

// Stage-1 predicate (engine: wnykInReadAloud) — reveal_cursor is ALWAYS an
// integer; the read-aloud runs while it still points inside the submissions.
function wnykInReadAloud(game) {
  return game.phase === "judging" && game.reveal_cursor < game.submissions.length;
}

// Engine: wnykBlackRateKey — the current prompt's rating key ("<deck>:b:<i>").
function wnykBlackRateKey(game) {
  return game.black_card && Number.isInteger(game.black_card.i)
    ? game.options.deck + ":b:" + game.black_card.i
    : null;
}

function wnykStatusLine(game, me) {
  if (game.status === "complete") return "Game over — well, now you know everyone.";
  if (game.phase === "prompt") {
    if (me && me.is_judge) return "Read the prompt aloud, then release it.";
    return "The judge is reading the prompt…";
  }
  if (game.phase === "submitting") {
    if (me && me.is_judge) return "You're the judge ⚖️ — waiting for answers.";
    if (me && me.submitted) return "Answer in ✅ — waiting for the table.";
    if (me && me.skipped) return "The table moved on without you this round.";
    var pick = game.black_card ? game.black_card.pick : 1;
    return pick > 1 ? "Pick " + pick + " cards — tap in the order they read." : "Pick your best answer.";
  }
  if (game.phase === "judging") {
    if (wnykInReadAloud(game)) {
      if (me && me.is_judge) return "Read it aloud — ❤️ it or tap Next.";
      return "The judge is reading the answers aloud…";
    }
    if (me && me.is_judge) return "Sort your favorites, promote one to Final, confirm.";
    return "The judge is deciding — ❤️ moves are live.";
  }
  return "Round " + game.round + " done.";
}

// Prompt stage: the judge reads the black card aloud before anyone else sees
// it — 👎 dumps-and-replaces the prompt (re-enabled by every fresh draw),
// Release opens the round. Everyone else: face-down card, no text leak (the
// sanitizer nulls black_card for non-judges in this phase).
function wnykPromptHtml(esc, game, me, ctx) {
  var isJudge = Boolean(me && me.is_judge);
  if (!isJudge) {
    return '<div class="wk-black wk-black-down">🂠</div>';
  }
  var swap = ctx && ctx.blackSwapped ? " wk-swapped" : "";
  var hero = wnykBlackCardHtml(esc, game.black_card, []);
  hero = hero.replace('class="wk-black"', 'class="wk-black' + swap + '"');
  // Engine: the black 👎 routes through {type:"rate", card:<black key>} and
  // the per-round swap budget is the judge-only `black_swaps` dict field.
  var swapsLeft = Math.max(0, 2 - (game.black_swaps || 0));
  var blackKey = wnykBlackRateKey(game);
  return hero +
    '<div class="wk-prompt-controls">' +
    '<button type="button" class="secondary wk-black-dump" data-act="dump_black" data-black-key="' + esc(blackKey || "") + '"' +
    (swapsLeft > 0 && blackKey ? "" : " disabled") + ' aria-label="Downvote and swap this prompt">👎</button>' +
    '<button type="button" class="primary" data-act="release">Release</button>' +
    "</div>" +
    '<div class="wk-remaining">' + swapsLeft + " prompt swap" + (swapsLeft === 1 ? "" : "s") + " left</div>";
}

// Submitting phase: prompt (with live fill preview), hand or waiting view.
function wnykSubmittingHtml(esc, game, me) {
  var parts = [];
  var isPlayer = me && !me.is_judge && !me.submitted && !me.skipped;
  var fills = [];
  if (isPlayer) {
    fills = wnykUi.selection.map(function (idx) {
      var face = me.hand[idx];
      if (!face) return "";
      if (face.blank) return wnykUi.composerText.trim() || "…";
      return face.text;
    });
  }
  parts.push(wnykBlackCardHtml(esc, game.black_card, fills));
  if (!me || me.is_judge || me.submitted || me.skipped) {
    var own = game.submissions.find(function (sub) { return me && sub.mark === me.mark; });
    if (own) {
      parts.push('<div class="wk-panel"><div class="wk-sub">' +
        own.cards.map(function (face) { return wnykWhiteCardHtml(esc, face, {}); }).join("") + "</div></div>");
    }
    return parts.join("");
  }
  var pick = game.black_card ? game.black_card.pick : 1;
  parts.push('<div class="wk-hand">' + me.hand.map(function (face, idx) {
    var at = wnykUi.selection.indexOf(idx);
    // The 👎 binds to hand_rate_keys (index-aligned with hand; null = not
    // rateable: blanks). Disabled — never hidden — once the round's dump is
    // spent or while the card sits in the current selection.
    var rateKey = me.hand_rate_keys ? me.hand_rate_keys[idx] : null;
    return wnykWhiteCardHtml(esc, face, {
      idx: idx,
      raised: at >= 0,
      order: pick > 1 ? String(at + 1) : "✓",
      ratable: Boolean(rateKey),
      dumpDisabled: Boolean(me.dump_used || at >= 0),
      key: rateKey,
    });
  }).join("") + "</div>");
  parts.push('<div class="wk-dumpbadge' + (me.dump_used ? " wk-spent" : "") + '">' +
    (me.dump_used ? "👎 used this round" : "👎 ready — downvote dumps the card for a fresh draw") + "</div>");
  if (wnykUi.composerOpen) {
    var count = wnykUi.composerText.length;
    parts.push('<div class="wk-panel wk-composer">' +
      '<textarea id="wnykComposer" maxlength="80" placeholder="Write your answer…">' + esc(wnykUi.composerText) + "</textarea>" +
      '<div class="wk-composer-row"><span class="wk-count" id="wnykComposerCount">' + count + "/80</span>" +
      '<button type="button" class="secondary" data-act="composer_cancel">Cancel</button></div></div>');
  }
  // 5-second grace after release: Commit is held (disabled, never hidden,
  // same button = no layout shift) with a visible count; selection is free.
  var graceSec = Math.ceil((wnykUi.graceMsLeft || 0) / 1000);
  var canCommit = wnykCanCommit(me, pick) && graceSec <= 0;
  parts.push('<div class="wk-commitbar">' +
    '<button type="button" class="primary" data-act="commit"' + (canCommit ? "" : " disabled") + ">" +
    (graceSec > 0 ? "Commit in " + graceSec + "…" : "Commit") + "</button>" +
    '<p class="wk-commit-hint">tap to raise · tap again to lower · swipe a raised card up to commit</p></div>');
  return parts.join("");
}

function wnykCanCommit(me, pick) {
  if (wnykUi.selection.length !== pick) return false;
  var hasBlank = wnykUi.selection.some(function (idx) { return me.hand[idx] && me.hand[idx].blank; });
  if (hasBlank && !wnykUi.composerText.trim()) return false;
  return true;
}

// Judging stage 1 — the read-aloud ritual: ONE submission at a time as the
// hero completed sentence, judge and room in lockstep (the cursor lives in
// game state). Judge: ❤️ (one-way) + Next; spectators: face-down count.
function wnykReadAloudHtml(esc, game, me) {
  var isJudge = Boolean(me && me.is_judge);
  var cursor = game.reveal_cursor;
  var total = game.submissions.length;
  var current = game.submissions.find(function (sub) { return sub.id === cursor; });
  var remaining = Math.max(0, total - cursor - 1);
  var hero = current ? wnykHeroSentenceHtml(esc, game.black_card, current.cards) : "";
  var controls = isJudge
    ? '<div class="wk-ra-controls">' +
      '<button type="button" class="secondary" data-act="heart" data-sub="' + cursor + '"' +
      (current && current.liked ? " disabled" : "") + ">" +
      (current && current.liked ? "❤️ Hearted" : "❤️ Heart") + "</button>" +
      '<button type="button" class="primary" data-act="ra_next">Next ▶</button></div>'
    : "";
  return '<div class="wk-readaloud">' +
    '<div class="wk-progress">' + (cursor + 1) + " of " + total + "</div>" +
    hero +
    controls +
    '<div class="wk-remaining">' + (remaining ? "🂠 " + remaining + " still face-down" : "last one — triage is next") + "</div>" +
    "</div>";
}

// Judging stage 2: All | Favorite | Final — judge gets controls (hearts from
// the read-aloud pre-fill Favorite), the room spectates the columns moving
// live (no authorship anywhere).
function wnykJudgingHtml(esc, game, me) {
  if (wnykInReadAloud(game)) {
    return wnykBlackCardHtml(esc, game.black_card, []) + wnykReadAloudHtml(esc, game, me);
  }
  var isJudge = Boolean(me && me.is_judge);
  var cols = { all: [], favorite: [], final: [] };
  game.submissions.forEach(function (sub) {
    var col = sub.id === game.final_pick ? "final" : sub.liked ? "favorite" : "all";
    cols[col].push(wnykSubmissionHtml(esc, sub, { isJudge: isJudge, column: col, black: game.black_card }));
  });
  var confirm = isJudge
    ? '<button type="button" class="wk-confirm" data-act="confirm"' + (game.final_pick === null ? " disabled" : "") + ">Confirm</button>"
    : "";
  var finalArmed = game.final_pick !== null ? " wk-final-armed" : "";
  return wnykBlackCardHtml(esc, game.black_card, []) +
    '<div class="wk-triage">' +
    '<div class="wk-col"><h4 class="wk-col-h">📋 All</h4>' + cols.all.join("") + "</div>" +
    '<div class="wk-col"><h4 class="wk-col-h">❤️ Favorite</h4>' + cols.favorite.join("") + "</div>" +
    '<div class="wk-col wk-col-final' + finalArmed + '"><h4 class="wk-col-h">🏆 Final</h4>' + cols.final.join("") + confirm + "</div>" +
    "</div>";
}

// Round end: the reveal beat the title names.
function wnykRoundEndHtml(esc, game) {
  var result = game.round_result || {};
  if (result.type === "win") {
    var winning = game.submissions.find(function (sub) { return sub.id === result.submission_id; });
    var winner = game.players.find(function (seat) { return winning && seat.mark === winning.mark; });
    var writein = winning && winning.cards.find(function (face) { return face && face.writein; });
    var libNote = writein ? '<div class="wk-banner-sub">📚 “' + esc(writein.text) + "” joins the family library</div>" : "";
    // Hero: the WHOLE completed sentence (prompt + winning fills) IS the
    // reveal — black and white text only, no card faces repeated below.
    return '<div class="wk-banner">' +
      '<div class="wk-banner-line">Well, now you know: ' + esc(winner ? winner.name : "?") + " 🏆</div>" +
      (winning ? wnykHeroSentenceHtml(esc, game.black_card, winning.cards) : "") +
      libNote + "</div>";
  }
  if (result.type === "judge_skipped") {
    return '<div class="wk-banner"><div class="wk-banner-line">The table moved on ⏭️</div>' +
      '<div class="wk-banner-sub">No point this round — hearts already given still count.</div></div>';
  }
  return '<div class="wk-banner"><div class="wk-banner-line">No answers this round 🤷</div></div>';
}

// Game end: champion + the ❤️ Most Liked second podium (ties share).
function wnykCompleteHtml(esc, game) {
  var champion = game.players.find(function (seat) { return seat.mark === game.winner; });
  var likedNames = (game.most_liked && game.most_liked.marks || []).map(function (mark) {
    var seat = game.players.find(function (s) { return s.mark === mark; });
    return seat ? seat.name : mark;
  });
  var lastPlay = game.round_result && game.round_result.type === "win"
    ? game.submissions.find(function (sub) { return sub.id === game.round_result.submission_id; })
    : null;
  return '<div class="wk-banner"><div class="wk-podium">' +
    '<div class="wk-podium-line">🏆 ' + esc(champion ? champion.name : "?") + " takes the game</div>" +
    (likedNames.length
      ? '<div class="wk-podium-line wk-podium-liked">❤️ Most Liked: ' + esc(likedNames.join(" & ")) +
        (game.most_liked ? " (" + game.most_liked.likes + ")" : "") + "</div>"
      : "") +
    "</div>" +
    (lastPlay
      ? '<div class="wk-banner-sub">The winning play:</div>' +
        wnykHeroSentenceHtml(esc, game.black_card, lastPlay.cards)
      : "") +
    "</div>" +
    '<div class="wk-panel">' + wnykStandingsHtml(esc, game) + "</div>" +
    '<div class="wk-commitbar"><button type="button" class="secondary" data-act="play_again">Back to Lobby</button></div>';
}

// ---- wiring (addEventListener only; every action goes through ctx.makeMove) ----
function wireWnyk(host, ctx) {
  var game = ctx.game;
  var me = game.players.find(function (seat) { return seat.mark === ctx.localMark; }) || null;
  var pick = game.black_card ? game.black_card.pick : 1;

  // The 👎 dump control: never selects the card (stopPropagation); disabled
  // buttons never reach here. Irreversible by design — no toggle.
  host.querySelectorAll("[data-dump]").forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      ctx.makeMove({ type: "rate", card: button.getAttribute("data-dump") });
    });
  });

  // Hand select/commit: tap raises, tap again lowers; swipe a raised card up
  // to commit; Commit button always visible (disabled until the pick is full).
  host.querySelectorAll(".wk-hand [data-hand-idx]").forEach(function (card) {
    var idx = Number(card.getAttribute("data-hand-idx"));
    card.addEventListener("click", function () {
      var face = me && me.hand[idx];
      var at = wnykUi.selection.indexOf(idx);
      if (at >= 0) {
        wnykUi.selection.splice(at, 1);
        if (face && face.blank) { wnykUi.composerOpen = false; }
      } else if (wnykUi.selection.length < pick) {
        wnykUi.selection.push(idx);
        if (face && face.blank) { wnykUi.composerOpen = true; }
      } else if (pick === 1) {
        var old = me && me.hand[wnykUi.selection[0]];
        if (old && old.blank) wnykUi.composerOpen = false;
        wnykUi.selection = [idx];
        if (face && face.blank) wnykUi.composerOpen = true;
      }
      ctx.repaint();
    });
    var touchY = null;
    card.addEventListener("touchstart", function (event) {
      touchY = event.touches[0].clientY;
    }, { passive: true });
    card.addEventListener("touchend", function (event) {
      if (touchY === null) return;
      var dy = event.changedTouches[0].clientY - touchY;
      touchY = null;
      if (dy < -60 && wnykUi.selection.indexOf(idx) >= 0 && wnykCanCommit(me, pick) && !(wnykUi.graceMsLeft > 0)) wnykCommit(ctx, me);
    }, { passive: true });
  });

  var composer = host.querySelector("#wnykComposer");
  if (composer) {
    composer.addEventListener("input", function () {
      wnykUi.composerText = composer.value;
      var count = host.querySelector("#wnykComposerCount");
      if (count) count.textContent = composer.value.length + "/80";
      var commit = host.querySelector('[data-act="commit"]');
      if (commit) commit.disabled = !wnykCanCommit(me, pick);
      var gap = host.querySelector(".wk-black .wk-gap");
      if (gap && wnykUi.selection.length) { gap.classList.add("wk-filled"); gap.textContent = composer.value.trim() || "…"; }
    });
  }

  host.querySelectorAll("[data-act]").forEach(function (button) {
    button.addEventListener("click", function () {
      var act = button.getAttribute("data-act");
      if (act === "commit") { wnykCommit(ctx, me); return; }
      if (act === "composer_cancel") {
        wnykUi.selection = wnykUi.selection.filter(function (idx) { return !(me && me.hand[idx] && me.hand[idx].blank); });
        wnykUi.composerOpen = false;
        wnykUi.composerText = "";
        ctx.repaint();
        return;
      }
      if (act === "release") { ctx.makeMove({ type: "release" }); return; }
      if (act === "dump_black") { ctx.makeMove({ type: "rate", card: button.getAttribute("data-black-key") }); return; }
      if (act === "heart") {
        // ❤️ hearts AND advances in one tap (UI sugar only — the engine
        // contract stays two distinct actions: like, then next).
        Promise.resolve(ctx.makeMove({ type: "like", submission: Number(button.getAttribute("data-sub")) }))
          .then(function (heartErr) { if (!heartErr) ctx.makeMove({ type: "next" }); });
        return;
      }
      if (act === "ra_next") { ctx.makeMove({ type: "next" }); return; }
      if (act === "like" || act === "unlike") { ctx.makeMove({ type: act, submission: Number(button.getAttribute("data-sub")) }); return; }
      if (act === "promote") { ctx.makeMove({ type: "promote", submission: Number(button.getAttribute("data-sub")) }); return; }
      if (act === "demote") { ctx.makeMove({ type: "promote", submission: null }); return; }
      if (act === "confirm") { ctx.makeMove({ type: "confirm" }); return; }
      if (act === "next_round") { ctx.makeMove({ type: "next_round" }); return; }
      if (act === "play_again") { ctx.playAgain(); return; }
    });
  });

  host.querySelectorAll("[data-skip]").forEach(function (button) {
    button.addEventListener("click", function () {
      ctx.makeMove({ type: "skip_vote", target: button.getAttribute("data-skip") });
    });
  });

  // Dump-swap flip-in on the freshly drawn card (one paint only).
  if (ctx.swappedIdx !== undefined && ctx.swappedIdx !== null) {
    var swapped = host.querySelector('.wk-hand [data-hand-idx="' + ctx.swappedIdx + '"]');
    if (swapped) swapped.classList.add("wk-swapped");
  }
}

function wnykCommit(ctx, me) {
  var hasBlank = wnykUi.selection.some(function (idx) { return me && me.hand[idx] && me.hand[idx].blank; });
  ctx.makeMove({
    type: "submit",
    cards: wnykUi.selection.slice(),
    writein: hasBlank ? wnykUi.composerText : undefined,
  });
}
