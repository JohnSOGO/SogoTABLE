// The Mystic Wood — the joust (pure: no DOM, no I/O, no timers).
// Knight-vs-knight combat: the contest itself, its record told for BOTH seats, the spoils
// on offer, and the winner's chosen prize (Thing / Prowess / Companion / Tower). Extracted
// from engine.js to keep it under the god-file cap. The die + derived totals + the shared
// combat plumbing (clearSnub / recordRoll / enforcePower / toTower / syncQuestCompanion)
// flow in from engine.js; the chronicle (logEvent) from the pure narration.js leaf; the
// card data (THINGS / DEN) from data.js. None of them import back — the arrow is one-way.
import { d6, totalS, totalP, clearSnub, recordRoll, enforcePower, toTower, syncQuestCompanion } from "./engine.js";
import { logEvent } from "./narration.js";
import { THINGS, DEN } from "./data.js";

/* ------------------------------- joust ---------------------------------- */
// The contest only: both knights add full S+P + a die; ties reroll. Returns the FIGHT (both dice and
// both bonus breakdowns) so it can be shown like any other fight; the caller records it once the
// prize/fate is known, and applies the prize separately.
export function resolveJoust(game, ch, def) {
  const cName = ch.name, dName = def.name;
  let cDie, dDie, cw, dw, guard = 0;
  do {
    cDie = d6(); dDie = d6();
    cw = cDie + totalS(ch) + totalP(ch); dw = dDie + totalS(def) + totalP(def);
  } while (cw === dw && guard++ < 50);
  const chWon = cw > dw;
  clearSnub(ch); clearSnub(def);   // §8.2.1: a joust frees BOTH knights to approach a snubbing denizen again
  logEvent(game, `${cName} jousts ${dName} — ${cw} vs ${dw}. ${chWon ? cName : dName} prevails!`, "a");
  return { chWon, cw, dw, cDie, dDie, cName, dName, winnerName: chWon ? cName : dName,
    cParts: [{ l: "Strength", v: totalS(ch) }, { l: "Prowess", v: totalP(ch) }],
    dParts: [{ l: "Strength", v: totalS(def) }, { l: "Prowess", v: totalP(def) }] };
}
// §12: BOTH knights watch the joust. The loser used to get only a bare "you are in the Tower" notice with
// no word of the fight that put them there (bug mrhc3izr) — the jail notice overwrote the joust result.
// Now the same fight is recorded for each seat, told from that knight's side, carrying the fate it ended in.
export function recordJoust(game, ch, def, res, detail) {
  const fight = { joust: true, ...res, detail: detail || "" };
  recordRoll(game, ch.mark, { ...fight, youWon: res.chWon, youAreCh: true, foeName: def.name });
  recordRoll(game, def.mark, { ...fight, youWon: !res.chWon, youAreCh: false, foeName: ch.name });
}
// Whether the loser has anything worth taking (so the client only offers valid prizes).
export function joustSpoils(loser) {
  return {
    things: (loser.things.length > 0 || loser.horse),
    prowess: loser.prowess.length > 0,           // §12: a prowess card is a valid spoil
    companions: loser.companions.length > 0,
  };
}
// Apply the winner's chosen prize. "tower" imprisons the loser (keeps cards); "thing" takes their
// best Thing/Horse; "companion" takes one companion. Falls back to Tower if the picked spoil is gone.
export function joustPrize(game, winner, loser, prize, via = null) {
  const wn = winner.name, ln = loser.name;
  if (prize === "thing") {
    if (loser.horse && !winner.horse) { loser.horse = false; winner.horse = true; logEvent(game, `${wn} wins ${ln}'s Horse (+2 Strength).`, "g"); enforcePower(game, winner); return; }
    if (loser.things.length) {
      loser.things.sort((a, b) => ((THINGS[b].S || 0) + (THINGS[b].P || 0)) - ((THINGS[a].S || 0) + (THINGS[a].P || 0)));
      const t = loser.things.shift(); winner.things.push(t); logEvent(game, `${wn} takes ${ln}'s ${THINGS[t].name}.`, "g"); enforcePower(game, winner); return;
    }
  }
  if (prize === "prowess" && loser.prowess.length) {   // §12: take one extra prowess card
    loser.prowess.sort((a, b) => (b.P || 1) - (a.P || 1));
    const pc = loser.prowess.shift(); winner.prowess.push(pc);
    logEvent(game, `${wn} takes ${ln}'s ${pc.name} (+${pc.P || 1} Prowess).`, "g"); enforcePower(game, winner); return;
  }
  if (prize === "companion" && loser.companions.length) { joustTakeCompanion(game, winner, loser); return; }
  logEvent(game, `${wn} unhorses ${ln} — away to the Tower!`, "r");
  toTower(game, loser, false, via);   // sent by a joust → keeps all cards
}
// §12: Sage (and Boy/Damsel) come outright; every other Companion must be APPROACHED with a die roll —
// "remains" leaves them loyal to the foe, and the Prince fights back (winning, he stays and jails you).
function joustTakeCompanion(game, winner, loser) {
  const wn = winner.name, ln = loser.name, cid = loser.companions[0];
  const take = () => {
    loser.companions.shift(); winner.companions.push(cid);
    logEvent(game, `${wn} wins ${ln}'s ${DEN[cid].name}.`, "g");
    if ((winner.q === "princess" && cid === "princess") || (winner.q === "prince" && cid === "prince")) { winner.questDone = true; logEvent(game, `${wn}'s quest companion is won — leave by the Enchanted Gate!`, "g"); }
    enforcePower(game, winner);
    syncQuestCompanion(game, loser);   // …and robbed of HIS quest companion, the loser's quest is undone (mrh9klnb)
  };
  if (cid === "sage") { take(); return; }
  if (cid === "prince") {
    let cw, pw, guard = 0;
    do { cw = d6() + totalS(winner) + totalP(winner); pw = d6() + DEN.prince.S + DEN.prince.P; } while (cw === pw && guard++ < 50);
    logEvent(game, `The Prince fights ${wn} for his loyalty — ${cw} vs ${pw}.`, "a");
    if (cw > pw) take();
    else { logEvent(game, `The Prince stays loyal to ${ln} and strikes ${wn} down — away to the Tower!`, "r"); toTower(game, winner, false); }
    return;
  }
  const need = (cid === "grail" || cid === "princess") ? 9 : 8, roll = d6() + totalP(winner);
  logEvent(game, `${wn} approaches ${ln}'s ${DEN[cid].name} — ${roll} (need ${need}).`, "a");
  if (roll >= need) take();
  else logEvent(game, `The ${DEN[cid].name} remains loyal to ${ln}.`);
}
