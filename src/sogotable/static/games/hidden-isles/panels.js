// Hidden Isles — HTML for the non-board panels: status strip, clue banner,
// action area, ship's log, results, and the crew-setup screen. Pure string
// builders over the view model render.js prepares; every word comes from
// branding.js. No rule logic: phases, turns, guesses left, remaining islands,
// legality and the winner all arrive decided by the server.
import { compassIcon, crewBadge, tileIcon } from "./art.js";
import {
  CREWS, RESULTS, ROLES, SETUP, TILES, UI,
  crewEmoji, crewName,
} from "./branding.js";

const teamClass = (team) => (team === "A" || team === "B" ? ` hi-team-${team}` : "");

// ---------- status strip ----------
function scoreChip(vm, team) {
  const n = vm.remaining[team];
  const active = !vm.complete && vm.turnTeam === team;
  return `<span class="hi-score hi-team-${team}${active ? " hi-active" : ""}" aria-label="${vm.esc(UI.islandsLeftAria(team, n))}">${crewBadge(team, 20)}<span aria-hidden="true">${n}</span></span>`;
}

export function stripHtml(vm) {
  const { esc } = vm;
  const team = vm.complete ? vm.winnerTeam : vm.turnTeam;
  const head = vm.complete ? RESULTS.voyageOver : UI.turnOf(team);
  const tickerClass = vm.flash ? ` hi-ticker-${vm.flash.kind}` : "";
  const tickerText = vm.flash ? vm.flash.text : vm.ticker;
  const me = vm.myTeam ? UI.youAre(vm.myTeam, vm.myRole) : UI.watching;
  return `<div class="hi-line">
      <span class="hi-turn${teamClass(team)}">${team ? crewBadge(team, 22) : ""}<span>${esc(head)}</span></span>
      ${scoreChip(vm, "A")}${scoreChip(vm, "B")}
    </div>
    <div class="hi-line">
      <span class="hi-me">${esc(me)}</span>
      <span class="hi-ticker${tickerClass}">${tickerText ? esc(tickerText) : "&nbsp;"}</span>
    </div>`;
}

// ---------- clue banner ----------
export function bannerHtml(vm) {
  const { esc, game } = vm;
  const team = vm.turnTeam;
  const clue = game.phase === "guess" ? game.clue : null;
  if (clue) {
    const count = clue.unlimited ? UI.unlimited : String(clue.count);
    const by = vm.nameOf(clue.by);
    return `<div class="hi-banner-main">
        <span class="hi-banner-who">${esc(UI.clueSays(team))} · ${esc(by)}</span>
        <span class="hi-banner-clue">${esc(String(clue.word || "").toUpperCase())} · ${esc(count)}</span>
      </div>
      <span class="hi-banner-left">${esc(UI.guessesLeft(game.guesses_left))}</span>`;
  }
  const guide = vm.seats.find((p) => p.team === team && p.role === "guide");
  let text = UI.waitingGuide(team);
  if (guide && guide.mark === vm.myMark) text = UI.yourClueTurn;
  else if (guide && guide.is_bot) text = UI.botGuideThinking(team);
  return `<div class="hi-banner-main"><span class="hi-banner-wait">${esc(text)}</span></div>`;
}

// ---------- action area ----------
function nudgeHtml(vm) {
  return `<button type="button" class="hi-nudge" data-hi-act="nudge" ${vm.canNudge ? "" : "hidden"} ${vm.sending ? "disabled" : ""}>${vm.esc(vm.sending === "nudge" ? UI.nudging : UI.nudge)}</button>`;
}

function guideActions(vm) {
  const { esc, game } = vm;
  let hint = UI.notYourClue(vm.turnTeam);
  if (vm.canClue) hint = UI.clueHowTo;
  else if (vm.turnTeam === vm.myTeam) hint = UI.guideWatching;
  const nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
    const on = !vm.clueUnlimited && vm.clueCount === n;
    return `<button type="button" class="hi-num${on ? " hi-on" : ""}" data-hi-num="${n}" aria-pressed="${on}" ${vm.canClue ? "" : "disabled"}>${n}</button>`;
  }).join("");
  const inf = `<button type="button" class="hi-num${vm.clueUnlimited ? " hi-on" : ""}" data-hi-num="inf" aria-pressed="${vm.clueUnlimited}" aria-label="unlimited" ${vm.canClue ? "" : "disabled"}>${UI.unlimited}</button>`;
  const ideasOn = Boolean(game.options && game.options.clue_ideas);
  const ideas = Array.isArray(game.clue_ideas) && vm.canClue ? game.clue_ideas : [];
  const ideaChips = ideas.map((idea, i) => `<button type="button" class="hi-idea-chip${vm.ideaIdx === i ? " hi-on" : ""}" data-hi-idea="${i}">${esc(String(idea.word || "").toUpperCase())} · ${esc(String(idea.count))}</button>`).join("");
  const giveLabel = vm.sending === "clue" ? UI.giving : UI.giveClue;
  return `<div class="hi-hint">${esc(hint)}</div>
    <div class="hi-row">
      <input class="hi-clue-input" type="text" data-hi-focus="clue" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24"
        aria-label="${esc(UI.clueLabel)}" placeholder="${esc(UI.cluePlaceholder)}" enterkeyhint="send" ${vm.myRole === "guide" && !vm.complete ? "" : "disabled"}>
      <button type="button" class="hi-btn hi-btn-primary hi-give" data-hi-act="clue" data-hi-focus="give" ${vm.canGiveClue ? "" : "disabled"}>${esc(giveLabel)}</button>
    </div>
    <div class="hi-nums" role="group" aria-label="${esc(UI.numberLabel)}">${nums}${inf}</div>
    ${ideasOn ? `<div class="hi-ideas"><span class="hi-ideas-label">💡 ${esc(UI.ideas)}</span>${ideaChips}</div>` : ""}
    ${nudgeHtml(vm)}`;
}

function guesserActions(vm) {
  const { esc, game } = vm;
  let hint;
  if (vm.canGuess) {
    const sel = vm.selected !== null ? vm.board[vm.selected] : null;
    hint = sel ? UI.tapAgain(String(sel.word || "").toUpperCase()) : UI.tapToPick;
  } else if (vm.turnTeam === vm.myTeam) hint = UI.waitClue;
  else hint = game.phase === "guess" ? UI.otherCrewGuessing(vm.turnTeam) : UI.otherCrewClue(vm.turnTeam);
  const canReveal = vm.canGuess && vm.selected !== null && !vm.sending;
  const revealLabel = vm.sending === "guess" ? UI.revealing : UI.reveal;
  return `<div class="hi-hint">${esc(hint)}</div>
    <div class="hi-row">
      <button type="button" class="hi-btn hi-btn-primary" data-hi-act="guess" data-hi-focus="guess" ${canReveal ? "" : "disabled"}>${esc(revealLabel)}</button>
      <button type="button" class="hi-btn" data-hi-act="pass" data-hi-focus="pass" ${vm.canPass ? "" : "disabled"} title="${esc(vm.canGuess && !vm.canPass ? UI.needOneGuess : UI.endTurn)}">${esc(UI.endTurn)}</button>
    </div>
    ${nudgeHtml(vm)}`;
}

export function actionsHtml(vm) {
  if (vm.myRole === "guide") return guideActions(vm);
  if (vm.myRole === "guesser") return guesserActions(vm);
  return `<div class="hi-hint">${vm.esc(UI.spectating)}</div>${nudgeHtml(vm)}`;
}

// ---------- ship's log ----------
function resultChip(r, esc) {
  const key = r.key || "neutral";
  return `<span class="hi-res hi-res-${key}" title="${esc(TILES[key] ? TILES[key].name : "")}">${tileIcon(key, 18)}${esc(String(r.word || ""))}</span>`;
}

export function logHtml(vm, open) {
  const { esc } = vm;
  const log = Array.isArray(vm.game.log) ? vm.game.log : [];
  const items = log.slice().reverse().map((entry) => {
    const count = entry.unlimited ? UI.unlimited : String(entry.count);
    const results = Array.isArray(entry.results) && entry.results.length
      ? entry.results.map((r) => resultChip(r, esc)).join("")
      : `<span class="hi-log-none">${esc(UI.logNoGuess)}</span>`;
    return `<li class="${teamClass(entry.team).trim()}">
        <div class="hi-log-head"><span aria-hidden="true">${crewEmoji(entry.team)}</span><b>${esc(String(entry.word || "").toUpperCase())} · ${esc(count)}</b>
          <span class="hi-log-by">${esc(vm.nameOf(entry.by))}</span></div>
        <div class="hi-log-results">${results}</div>
      </li>`;
  }).join("");
  return `<details class="hi-log hi-panel" data-hi-log ${open ? "open" : ""}>
      <summary data-hi-focus="log">${esc(UI.logTitle(log.length))}</summary>
      ${items ? `<ol>${items}</ol>` : `<p class="hi-log-none">${esc(UI.logEmpty)}</p>`}
    </details>`;
}

// ---------- results ----------
export function resultsHtml(vm) {
  const { esc } = vm;
  const team = vm.winnerTeam;
  let mine = "";
  if (vm.myTeam) mine = `<p class="hi-results-me">${esc(vm.myTeam === team ? RESULTS.youWon : RESULTS.youLost)}</p>`;
  return `<div class="${teamClass(team).trim()}">
      ${crewBadge(team, 64)}
      <h3>${esc(RESULTS.winner(team))}</h3>
      <p>${esc(RESULTS.reason(team, vm.game.end_reason))}</p>
      ${mine}
    </div>`;
}

// ---------- setup screen ----------
function avatar(vm, mark) {
  const color = vm.colorOf(mark);
  return `<span class="hi-avatar" style="background:${color}">${vm.esc(vm.iconOf(mark))}</span>`;
}

function memberHtml(vm, seat) {
  const { esc } = vm;
  const me = seat.mark === vm.myMark;
  const tags = [];
  if (seat.role === "guide") tags.push(`<span class="hi-tag hi-tag-guide">${compassIcon(12)}${esc(ROLES.guide.name)}</span>`);
  if (seat.is_bot) tags.push(`<span class="hi-tag">🤖 ${esc(SETUP.bot)}</span>`);
  return `<li class="hi-member${me ? " hi-is-me" : ""}">
      ${avatar(vm, seat.mark)}
      <span class="hi-member-name">${esc(vm.nameOf(seat.mark))}${me ? ` <em>(${esc(SETUP.you)})</em>` : ""}</span>
      ${tags.join("")}
    </li>`;
}

function crewColumn(vm, team) {
  const { esc } = vm;
  const members = vm.seats.filter((p) => p.team === team)
    .sort((a, b) => (a.role === "guide" ? -1 : 0) - (b.role === "guide" ? -1 : 0));
  const list = members.length ? members.map((p) => memberHtml(vm, p)).join("") : `<li class="hi-member hi-member-empty">${esc(SETUP.empty)}</li>`;
  const canJoin = vm.canSetup && vm.myTeam !== team;
  return `<section class="hi-crew hi-panel hi-team-${team}" aria-label="${esc(crewName(team))}">
      <div class="hi-crew-head">${crewBadge(team, 30)}<span>${esc(CREWS[team].name)}</span></div>
      <ul>${list}</ul>
      <button type="button" class="hi-btn" data-hi-act="join" data-hi-team="${team}" data-hi-focus="join-${team}" ${canJoin ? "" : "disabled"}>${esc(SETUP.join(team))}</button>
    </section>`;
}

export function setupHtml(vm) {
  const { esc, game } = vm;
  const isGuide = vm.myRole === "guide";
  const problem = vm.isSpectator ? SETUP.spectator : (!game.can_deal && game.setup_problem ? game.setup_problem : "");
  const legend = ["A", "B", "neutral", "trap"].map((k) => `<span class="hi-res hi-res-${k}">${tileIcon(k, 18)}${esc(TILES[k].name)}</span>`).join("");
  return `<h3 class="hi-setup-title hi-panel">${esc(SETUP.title)}</h3>
    <div class="hi-crews">${crewColumn(vm, "A")}${crewColumn(vm, "B")}</div>
    <div class="hi-setup-actions hi-panel">
      <div class="hi-row">
        <button type="button" class="hi-btn" data-hi-act="guide" data-hi-focus="guide" ${vm.canSetup && !isGuide ? "" : "disabled"}>${compassIcon(16)} ${esc(isGuide ? SETUP.youAreGuide : SETUP.beGuide)}</button>
        <button type="button" class="hi-btn" data-hi-act="shuffle" data-hi-focus="shuffle" ${vm.canSetup ? "" : "disabled"}>🔀 ${esc(SETUP.shuffle)}</button>
      </div>
      <button type="button" class="hi-btn hi-btn-primary hi-deal" data-hi-act="deal" data-hi-focus="deal" ${vm.canSetup && game.can_deal ? "" : "disabled"}>${esc(vm.sending === "deal" ? SETUP.dealing : SETUP.deal)}</button>
      <p class="hi-problem" role="status">${esc(problem)}</p>
    </div>
    <div class="hi-how hi-panel">
      <h4>${compassIcon(18)} ${esc(SETUP.howTitle)}</h4>
      <ol>${SETUP.how.map((l) => `<li>${esc(l)}</li>`).join("")}</ol>
      <div class="hi-legend">${legend}</div>
    </div>`;
}
