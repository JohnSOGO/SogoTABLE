// Tradewind Isles — view model. Turns the projected game + local UI selection
// into plain display data for the panel/board builders. It derives display
// facts only (whose seat is blocking the table, which prompt to show, what the
// hand can pay for at the listed cost); every legality decision is the
// server's `game.legal`, and every rule outcome arrives decided.
import { RESOURCE_ORDER, UI } from "./branding.js";

const FALLBACK_COLORS = ["#d94141", "#2f6fd6", "#e0b100", "#2e9e5b", "#8a4fc9", "#e07a1f"];

export function seatOf(ctx) {
  const roomPlayers = (ctx.room && Array.isArray(ctx.room.players)) ? ctx.room.players : [];
  const local = roomPlayers.find((p) => p.id === ctx.localPlayerId) || null;
  const myMark = local ? local.mark : null;
  const players = (ctx.game && ctx.game.players && typeof ctx.game.players === "object") ? ctx.game.players : {};
  return { myMark, seat: myMark && players[myMark] ? players[myMark] : null, roomPlayers };
}

export function nameOf(ctx, mark) {
  const p = ((ctx.room && ctx.room.players) || []).find((x) => x.mark === mark);
  return p ? p.name : String(mark || "?");
}
export function iconOf(ctx, mark) {
  const p = ((ctx.room && ctx.room.players) || []).find((x) => x.mark === mark);
  return p && p.icon ? p.icon : "";
}
export function colorOf(ctx, mark) {
  const p = ((ctx.room && ctx.room.players) || []).find((x) => x.mark === mark);
  if (p && typeof p.color === "string" && /^#[0-9a-f]{3,8}$/i.test(p.color)) return p.color;
  const order = Array.isArray(ctx.game.seat_order) ? ctx.game.seat_order : [];
  return FALLBACK_COLORS[Math.max(0, order.indexOf(mark)) % FALLBACK_COLORS.length];
}

export const optOn = (game, key) => !(game && game.options && game.options[key] === false);

export function canPay(cost, hand) {
  if (!cost || !hand) return false;
  return Object.entries(cost).every(([r, n]) => (Number(hand[r]) || 0) >= n);
}
export function shortfall(cost, hand) {
  if (!cost) return {};
  const out = {};
  Object.entries(cost).forEach(([r, n]) => { const miss = n - ((hand && Number(hand[r])) || 0); if (miss > 0) out[r] = miss; });
  return out;
}

// Is this seat the one the table is waiting on right now? (display: status
// chips + where a skip vote button appears; the server owns the real vote.)
export function blocking(game, mark) {
  const p = game.players[mark];
  if (!p || p.is_bot || p.skipped || game.status !== "playing") return false;
  if (game.phase === "setup") return Boolean(game.setup && game.setup.current === mark);
  if (game.phase === "discard") return (Number(p.must_discard) || 0) > 0;
  if (game.phase === "monkey") return game.captain === mark;
  if (game.phase === "build") return !p.done;
  return false;
}

function statusOf(game, mark) {
  const p = game.players[mark];
  if (game.status !== "playing") return ["idle", ""];
  if (p.skipped) return ["skipped", UI.statusSkipped];
  if (game.phase === "setup") return game.setup && game.setup.current === mark ? ["acting", UI.statusPlacing] : ["idle", ""];
  if (game.phase === "discard") return (Number(p.must_discard) || 0) > 0 ? ["acting", UI.statusDiscard] : ["idle", ""];
  if (game.phase === "monkey") return game.captain === mark ? ["acting", UI.statusMonkey] : ["idle", ""];
  if (p.done) return ["done", UI.statusDone];
  if (p.is_bot) return ["bot", UI.statusBot];
  return ["acting", UI.statusBuilding];
}

// Which board targets are live for the current mode, and which glow.
function targetsFor(game, sel, myMark, legal) {
  const glow = optOn(game, "show_spots");
  const mode = sel.mode;
  if (!mode) return { kind: null, legal: [], glow };
  if (mode === "setup") {
    if (!sel.hut) return { kind: "vertex", legal: legal.setup_huts || [], glow };
    const paths = (legal.setup_paths && legal.setup_paths[sel.hut]) || [];
    return { kind: "edge", alsoVertex: true, legal: paths, glow };
  }
  if (mode === "monkey" || mode === "ranger") return { kind: "hex", legal: legal.monkey_hexes || [], glow };
  if (mode === "path") return { kind: "edge", legal: legal.paths || [], glow };
  if (mode === "hut") return { kind: "vertex", legal: legal.huts || [], glow };
  if (mode === "lodge") return { kind: "vertex", legal: legal.lodges || [], glow };
  return { kind: null, legal: [], glow };
}

function promptFor(ctx, game, me, sel, waitingNames) {
  const seat = me.seat;
  if (game.status === "complete") return UI.promptOver;
  if (!seat) return UI.promptSpectate;
  if (seat.skipped) return UI.promptSkipped;
  const name = (m) => nameOf(ctx, m);
  if (game.phase === "setup") {
    const cur = game.setup && game.setup.current;
    if (cur !== me.myMark) return UI.promptSetupOther(name(cur));
    if (!sel.hut) return UI.promptSetupMine;
    return sel.path ? UI.promptSetupReady : UI.promptSetupPickPath;
  }
  if (game.phase === "discard") {
    const n = Number(seat.must_discard) || 0;
    return n > 0 ? UI.promptDiscard(n) : UI.promptDiscardWait(waitingNames);
  }
  if (game.phase === "monkey") {
    if (game.captain !== me.myMark) return UI.promptMonkeyOther(name(game.captain));
    return sel.hex ? UI.promptMonkeyVictim : UI.promptMonkeyMine;
  }
  if (seat.done) return UI.promptBuildDone(waitingNames);
  if (sel.mode === "ranger") return sel.hex ? UI.promptMonkeyVictim : UI.rangerHint;
  if ((Number(seat.free_paths) || 0) > 0) return UI.promptFreePaths(seat.free_paths);
  return UI.promptBuild;
}

export function buildViewModel(ctx, S, sel, palette) {
  const { game } = ctx;
  const me = seatOf(ctx);
  const seat = me.seat;
  const players = game.players || {};
  const order = Array.isArray(game.seat_order) && game.seat_order.length ? game.seat_order : Object.keys(players);
  const legal = game.legal || {};
  const pending = S.sending || (typeof ctx.isMovePending === "function" && ctx.isMovePending());
  const playing = game.status === "playing";
  const hand = (seat && seat.hand) || {};
  const handCount = RESOURCE_ORDER.reduce((a, r) => a + (Number(hand[r]) || 0), 0);
  const inBuild = Boolean(playing && seat && !seat.skipped && game.phase === "build");

  const waiting = order.filter((m) => blocking(game, m));
  const waitingNames = waiting.filter((m) => m !== me.myMark).map((m) => nameOf(ctx, m));
  const iCanVote = Boolean(playing && seat && !seat.is_bot && !seat.skipped && !blocking(game, me.myMark));
  const voters = order.filter((m) => players[m] && !players[m].is_bot && !players[m].skipped && !blocking(game, m));
  const votes = game.skip_votes || {};
  const awards = game.awards || {};

  const rows = order.filter((m) => players[m]).map((m) => {
    const p = players[m];
    const [statusKey, statusText] = statusOf(game, m);
    const vs = Array.isArray(votes[m]) ? votes[m] : [];
    const isMe = m === me.myMark;
    return {
      mark: m, name: nameOf(ctx, m), icon: iconOf(ctx, m), color: colorOf(ctx, m), isMe, isBot: Boolean(p.is_bot),
      renown: p.renown_total != null ? p.renown_total : (p.renown || 0),
      cards: p.hand_count || 0, discoveries: p.discovery_count || 0, rangers: (p.played && p.played.ranger) || 0,
      longest: p.longest_path || 0, captain: game.captain === m && playing && game.phase !== "setup",
      causeway: awards.causeway === m, chief: awards.chief_ranger === m, statusKey, statusText,
      skip: iCanVote && blocking(game, m) && !isMe ? { votes: vs.length, needed: voters.length, mine: vs.includes(me.myMark) } : null,
    };
  });

  let results = [];
  let winnerNames = [];
  if (game.status === "complete") {
    const list = Array.isArray(game.results) && game.results.length
      ? [...game.results].sort((a, b) => (a.rank || 0) - (b.rank || 0))
      : rows.map((r) => ({ mark: r.mark, renown: r.renown })).sort((a, b) => b.renown - a.renown).map((r, i) => ({ ...r, rank: i + 1 }));
    results = list.map((r) => ({ ...r, name: nameOf(ctx, r.mark), icon: iconOf(ctx, r.mark), color: colorOf(ctx, r.mark), isMe: r.mark === me.myMark, winner: r.mark === game.winner || r.rank === 1 }));
    winnerNames = results.filter((r) => r.winner).map((r) => r.name);
  }

  const flash = S.flash && S.flash.until > Date.now() ? S.flash : null;
  return {
    game, round: game.round, phase: game.phase, playing, complete: game.status === "complete",
    myMark: me.myMark, seat, hand, handCount, costs: game.costs || {}, bank: game.bank || {},
    discoveryLeft: Number(game.discovery_left) || 0,
    rates: (seat && seat.rates) || {}, legal, sel, trade: S.trade, pending, sending: S.sending, inBuild,
    showAfford: optOn(game, "show_afford"), showSpots: optOn(game, "show_spots"), showPips: optOn(game, "show_pips"),
    targets: targetsFor(game, sel, me.myMark, legal),
    prompt: promptFor(ctx, game, me, sel, waitingNames), flash,
    rows, results, winnerNames, order, players,
    name: (m) => nameOf(ctx, m), iconOf: (m) => iconOf(ctx, m), colorOf: (m) => colorOf(ctx, m), myColor: colorOf(ctx, me.myMark),
    palette, logOpen: S.logOpen, events: Array.isArray(game.events) ? game.events : [],
  };
}
