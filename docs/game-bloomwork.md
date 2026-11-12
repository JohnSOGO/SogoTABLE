# 🌷 Bloomwork

An original SogoTable game: our own name, garden theme and procedural art, built on the
classic open-market tile-drafting mechanic. 2–6 gardeners, bots fill the table, and
**everyone picks at the same time**.

Code: `workers/games/bloomwork/` (rules) and `src/sogotable/static/games/bloomwork/` (client).
Opaque id `9e962268ca5f` (never changes). Spec followed: [game-integration-spec.md](game-integration-spec.md).

## How it plays

- **Market.** Each round, 2×players+1 market stalls are filled with 4 flowers each from the
  bag (20 of each of 5 kinds; 30 each at 5–6 players). Leftovers slide into the middle, the **Square**.
- **Pick.** Choose a stall (or the Square) and a flower kind: you take every flower of that kind
  there. Put them all into one of your 5 **planter rows** (row *n* holds *n* flowers, one kind per
  row, and not a kind already planted in that row of your bed) or straight onto your **compost
  heap**. Flowers that don't fit spill to compost.
- **Early Bird.** The first gardener to take from the Square each round also takes the Early Bird
  token: it costs a compost slot, and they lead next round.
- **Planting.** When the market is empty the round ends. Each full planter row moves one flower
  into its fixed spot in your 5×5 **garden bed** and scores 1, or the length of the row and/or
  column run it joins. The rest of the row is discarded. Compost costs −1, −1, −2, −2, −2, −3, −3.
  Scores never drop below zero.
- **End.** The game ends after the round in which anyone completes a horizontal bed row (Quick
  game: also after round 3). Bonuses: +2 per full bed row, +7 per full column, +10 per flower kind
  planted in all five rows. Highest score wins; ties go to more full bed rows.

## Parallel play

Each round is a chain of **pick steps** (`round`, `pick`). Every seat commits one pick per step;
the step resolves when all humans have committed (or been skipped). Bots pick last, at the
barrier close, through the same validation a human pick goes through.

**Contested stalls** resolve in this step's **priority order**: the round leader (Early Bird
holder) first, rotating one seat further every pick (`priority_order` in the projection).

1. Your stall still has your flower → you take them all; the rest of the stall slides to the Square.
2. A higher-priority player already cleared your stall → you take your flower from the Square
   instead, if there is any (often the leftovers of the stall you wanted).
3. Otherwise you miss this pick. The event names who beat you to it.

Policies (spec §6.3): duplicate picks in a step are ignored (first wins); a pick stamped with an
old round or step is rejected with "refresh"; a skipped seat sits out the rest of that round's
picks and its late pick is rejected loudly. Skip votes are unanimous among seats already done.

## Hidden information

A seat's committed pick is masked from every other viewer until the step resolves
(`bloomworkGameToDictForViewer`, wired in `handlers.js gameToDictForViewer`). The bag order is
stripped from every projection.

## Host options

`bloom_options: { length: "standard" | "quick", helps: true | false }`, clamped server-side and
carried across rematches. Helps light up rows a flower fits and preview points; with helps off
the server still rejects illegal rows with a message.

## Renaming and re-theming

All player-facing words live in `games/bloomwork/branding.js`; colours, art and sound overrides in
`games/bloomwork/assets.js` (see that folder's README). Rule ids (`rose`, `iris`, `sun`, `lilac`,
`fern`, `bird`) never change. A rename also edits the registry + manifest `name` (pinned equal by
the architecture test) and adds an alias.

## Sound

Synth cues in `sfx.js` driven by the event log; every cue has a file override key in
`ASSETS.sounds` per [the SFX spec](sfx-spec.md) (files not added yet).

## Out of scope / follow-ups

- Hot-seat play (simultaneous hidden picks would need a hand-off screen).
- Recorded sound files (Kenney CC0) once the SFX AREC lands.
- A "free bed" variant (place a planted flower in any legal column).
