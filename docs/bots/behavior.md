# Bot Behavior Contract

Bot ids are opaque random ids. Bot names are mutable display labels, but the
current recruitable roster is stable:

- Sprout - Novice
- Buddy - Casual
- Cipher - Strategist
- Overlord - Master

## Shared Contract

- Bot seats are normal room seats with `kind: "bot"`.
- Hosted bot payloads expose a numeric ladder level (`bot_level` / `level`) so
  game modules can map the shared ladder without inventing a second roster.
- Bot actions flow through the same hosted Worker move pipeline as human moves.
- The browser should render bot intent, not decide bot truth.
- Bot turns stay event-driven from room state changes, not polling.
- Bot seats should not appear in public player lists or leaderboards.
- The room host invites bots through the same waiting-room opponent flow used
  for human guests.

## Current Behavior Families

- Sprout and Buddy are the lighter random-legal-move bots.
- Cipher and Overlord are the scored bots in the shared ladder.
- Cipher and Overlord score legal moves using the hosted rules pipeline and
  should keep their strategy inside the Worker, not in the browser.

## Game-Specific Notes

- Quoridor maps the global ladder onto its four difficulty levels.
- Battleship uses Overlord for the strongest current ship-placement and attack
  logic.
- Other games may reuse the ladder without adding a separate bot identity
  system.

## Maintenance Notes

- Update this directory when a bot's behavior contract changes.
- Update `docs/ai-difficulty.md` when the recruitable ladder changes.
- Keep shared bot strategy in docs or Worker-owned rules, not in the browser
  shell.
