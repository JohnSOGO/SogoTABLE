# The Mystic Wood — Rulebook Fidelity Audit (2026-07-10)

Audit of the implementation (`workers/games/mystic-wood/{data,engine,rules,ai}.js`) against the
authoritative `docs/mystic-wood-rulebook.md` (v2.0). Documented intentional deviations
(`game-mystic-wood.md` → "Intended deviations") are excluded unless the code no longer matches even
the documented choice. This is the maintenance backlog; check items off as fixed.

**Resolved by the rulebook:** §8.1 — combat is **opposed** (white die = you, red die = the Denizen).
`resolveChallenge` (both dice) is correct. **Open issue #1 (`mrc1f6xw`, opposed-vs-fixed) can be closed, no code change.**

## 1. Implemented INCORRECTLY (rule violations — highest priority)

**ALL SIX FIXED (2026-07-10).**

- [x] **1.1 Fog & Wind are no-ops.** §18.12 Fog rotates each face-up arrow tile 180°; §18.14 Wind
  strips all Things *held by Knights*. `resolveSpell` (engine.js ~205-206) only logs flavour for both;
  Wind's text is also backwards ("loose" → should be "held"). Only Horn does anything.
- [x] **1.2 Palace/Altar second denizen discarded.** FIXED — clearCard clears only the active card; `openEncounter`/`afterEncounter` meet the second the same visit. Edge left: if the first *remains*, its partner waits for a later entry (not same-visit) — minor, tracked. Two-card areas (§5.1/§9) draw `card`+`card2`, but
  `enterTile` only opens an encounter for `card`, and `clearCard` nulls *both* — the second denizen
  vanishes unencountered. §9 multi-denizen ordering unimplemented.
- [x] **1.3 Arch-Mage transport is infinite.** §18.1 — he "remains in the area where you used it" (a
  one-shot; you lose him). `doTransport` (rules.js) never drops `archmage` from companions → teleport
  every turn forever.
- [x] **1.4 Prince kept after aid + still grants prowess.** §10 Prince is transported (leaves) after
  helping; §18.15 no prowess from a Prince-assisted kill. `usePrince` keeps him; `applyWin` still pushes
  the slayer card. (Sage is correctly consumed.)
- [x] **1.5 Joust companion-prize is a free steal.** §12 — taking a Companion needs the usual approach
  roll ("remains" keeps them loyal; Prince may counter-attack); only Boy/Damsel/Sage go outright. The
  Thing option also includes a prowess card. `joustPrize` shifts a companion over with no roll and can't
  take prowess cards.
- [x] **1.6 Enchantress capture keeps companions.** §8 — a knight vanquished by the Enchantress has
  "Companions become independent." `resolveChallenge` captured-branch leaves them attached.

## 2. Missing (in rulebook, absent from code)

- [ ] **2.1 No "withdraw" option.** §8 — on meeting a denizen you may withdraw to the prior area
  (barred only after transport-arrival / Fog / empty area). `enterTile` forces the encounter. *Not*
  in the deviations list — a core tactical choice is absent.
- [ ] **2.2 No free second move through an explored empty area.** §5.2 — entering a revealed cardless/
  knightless area grants one more move. `enterTile` always `passTurn`s.
- [ ] **2.3 Transport skips the destination denizen.** §5.3/§17.4 — after transport/Fountain you
  interact with cards on the arrival tile next turn. `relocate` sets up no pending; you can walk away.
- [ ] **2.4 Joust only before moving.** §12 — joust "at the beginning of a turn OR after moving."
  `doJoust` throws if `moved`, and moving ends the turn → can't chase-then-joust.
- [ ] **2.5 Other joust/endgame rules.** Player-King joust loss = elimination + succession (§18.10);
  re-challenge lockout (§12); voluntary Thing drop (§11); card exchange between knights (§13). None exist.
- [ ] **2.6 Chivalry / Boy-Damsel / Pilgrim / Crone obligation subsystem** (§15, §18.21/26). **Already
  documented as deferred** — the largest missing block, its own future slice.

## 3. Minor / ambiguous

- [ ] **3.1 Guyon greet bonus unconditional.** §8.2 — he chooses whether to add +1 *after* rolling
  (matters for steering the Horse). Code always adds it.
- [x] **3.2 Power-limit shedding auto-picks and deletes.** FIXED (partial): never sheds a still-needed Golden Bough; full player-choice + return-to-board is a larger follow-up. §14 — player chooses which cards to shed;
  Things stay in the area, prowess cards return to the deck as denizens. `enforcePower` auto-pops the
  last and deletes it (could drop the Golden Bough).
- [x] **3.3 Sage persists through greetings.** FIXED — the Sage now departs after aiding a companion-greeting too. §18.19 one-shot in a challenge *or* greeting; `useSage`
  only runs from `resolveChallenge`, so a greeting-only knight keeps +2 Prowess forever.
- [ ] **3.4 "Remains" is cosmetic.** §8.2.1 — can't re-greet until you act elsewhere, but may pass
  freely. `tile.remains` is set but re-entry still forces a fresh greet; free-pass absent.
- [ ] **3.5 Multiple spells on a tile overwrite.** §9 orders Horn→Wind→Fog; `drawCardFor` keeps a single
  `pendingSpell`, so a Palace/Altar second spell overwrites the first.
- [ ] **3.6 Queen greeting forced.** §18.17/§21 — asking a boon is optional; a player may ignore her.
  (Once-per-game / target-choice / send-self-to-Tower are documented fast-follows.)
- [ ] **3.7 Enchantress "jail" divergence.** §18.7 — she doesn't jail; she ignores you until you leave
  by any path. Our "captured, roll a 6" is surfaced as an intended mechanic in game-mystic-wood.md.
- [ ] **3.8 Chapel +2 vs rulebook +1.** DOCUMENTED intended deviation — noted so the +2 is known-deliberate.

## Top 5 to fix first
1. Implement Mystic Fog & Mystic Wind (§18.12/§18.14) — two spells inert.
2. Stop discarding the Palace/Altar second denizen (§9).
3. Make Arch-Mage transport one-shot (§18.1).
4. Add the "withdraw" option when meeting a denizen (§8).
5. Fix the Prince (leaves after aiding; no prowess from a Prince-assisted kill) (§10/§18.15).
