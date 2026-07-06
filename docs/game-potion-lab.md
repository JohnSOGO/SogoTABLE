# Potion Lab

A re-theme of **Sushi Go!** — simultaneous ingredient-card drafting over three
rounds. Host-start, N players (minimum 2, no maximum, bots fill), round-locked
(`liveRound`) sync with hidden hands.

## How to play

Each **pick**, every alchemist secretly keeps **one** card from the hand in
front of them, then passes the rest one seat on; a fresh hand comes round each
pick until hands are empty. That is a **round** — score it, deal fresh hands,
play **three** rounds, then the end-of-game Ice Crystal tally.

## Scoring

| Card | Scores |
|---|---|
| 🧪 Potion | its value 1 / 2 / 3, on its own |
| 🔥 Fire Essence | triples the **next** potion collected after it (one potion per fire; order matters) |
| 🐸 Frog | every set of **3** = +10 |
| 🍄 Mushroom | every **pair** = +5 |
| 🌿 Herb | 1 / 2 / 3 / 4 / 5+ herbs = 1 / 3 / 6 / 10 / 15 |
| 🌙 Moon Dust | round-end majority of icons: most +6, second-most +3 (ties split) |
| 🧙 Wizard | a power, not points: on a later pick, draft **two** cards at once (returns to the pool). Scores 0 |
| ❄️ Ice Crystal | **game end** only: most +6, least −6 (no −6 at two players; ties split) |

The deck scales to the table (`handSize × players × 3`, from the 108-card Sushi
Go! weight profile); hand size shrinks as players grow (2p:10 … 7p+:5).

## Architecture

- **Server rules** — `workers/games/potion-lab/rules.js` (pure, server-authoritative).
  The per-pick simultaneous **barrier** holds until every human has committed a
  pick, then bots commit and the pick resolves (keep + pass); a per-round
  **review** barrier (`READY_NEXT`) gates the next deal. Hidden hands: the deck
  is stripped for everyone in `potionLabGameToDict`; `potionLabGameToDictForViewer`
  masks every other seat's hand to null until the game completes. RNG flows
  through the seedable `setPotionLabRandom` seam (the deal shuffle).
- **Bot** — `workers/games/potion-lab/ai.js` (`choosePotionLabPick`), runs the
  same commit path a human uses, resolved internally (`resolvesBotsInternally`).
- **Client** — `src/sogotable/static/games/potion-lab/{render,styles,manifest}.js`,
  mounted through the shared live-round render branch in `app.js`; the pre-game
  screen is the shared `renderHostStartLobby`.
- **Actions** — `COMMIT_PICK { round, pick, cards:[id…], useWizard }` and
  `READY_NEXT { round }`, both round/pick-stamped so stale barriers are ignored.

Registered in `games/registry.js`, `workers/games/handlers.js` (GAME_HANDLERS row
+ viewer projection), `games/game-kinds.js` (predicate), and `app.js`.
Tests: `workers/tests/potion-lab.test.js`.
