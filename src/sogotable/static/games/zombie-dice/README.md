# Roll of the Dead 🧟 (module id `zombie-dice`)

Push-your-luck zombie dice for 1+ players. Server rules live in
`workers/games/zombie-dice/rules.js` (bot policy in `ai.js` beside it, tests in
`workers/tests/zombie-dice-rules.test.js`); this directory owns the browser
module:

- `render.js` — in-game UI adapter (ctx bag; shared host-start lobby pre-game)
- `styles.js` — scoped `.zombie-dice-root` CSS, injected once (light + dark)
- `phrases.js` — flavor quips for non-turn-ending rolls (indexed by roll shape)
- `manifest.js` — module metadata (registration itself is `games/registry.js`)
- `PLAN.md` — intake survey, deviations list, rules ledger, gate receipts

Game doc: `docs/game-zombie-dice.md`.
