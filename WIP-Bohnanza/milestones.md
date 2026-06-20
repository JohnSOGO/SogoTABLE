# WIP-Bohnanza Milestones

This is the working build outline for the offline Bohnanza-style card game lab that will later plug into SogoTable.

The actual code workspace for the game is `src/sogotable/static/games/bohnanza/`.
The current playable implementation stays in turn order for simplicity, while the longer-term direction remains rounds without turns and more simultaneous bidding/asking behavior.

The point of this plan is not just to list tasks. Each milestone also states what should be true when it is finished, so we can tell the difference between progress and actual completion.

## Milestone 0: Project Setup and Scope Lock

Goal:

- Establish the local project folder, package shape, and initial runtime assumptions.
- Keep the work clearly separated from hosted multiplayer concerns.

Goals met when:

- The project lives under `WIP-Bohnanza/` as the active development workspace.
- The local app runs in the browser without Cloudflare dependencies.
- The codebase has a clear entry point and a predictable folder layout.
- The first game is explicitly treated as a rules package, not a one-off UI prototype.
- The project scope is written down well enough to stop accidental drift into networking, persistence, or account systems.

## Milestone 1: Generic Table Shell

Goal:

- Build the tabletop frame that can host multiple players, zones, and shared table state.

Goals met when:

- Seats can be rendered for 2 to 4 players locally.
- The active player is visible.
- Shared table areas are visible in the center of the screen.
- Private player areas are separated from shared areas in the UI model.
- A simple event log exists for turn and action feedback.
- The shell can support hot-seat testing without rewriting the layout for each game.

## Milestone 2: Generic Card Engine

Goal:

- Create reusable card primitives and zone operations that are not specific to Bohnanza.

Goals met when:

- Cards have stable IDs.
- Zones can represent hands, decks, discards, fields, markets, trade areas, and score piles.
- Cards can move between zones through pure state transitions.
- A seeded RNG can shuffle deterministically.
- The engine can draw, discard, and preserve card order correctly.
- Hidden and private zone visibility rules are respected in the public view layer.

## Milestone 3: Game Contract and State Model

Goal:

- Define the game package contract that SogoTable will eventually load.

Goals met when:

- The game exposes a manifest with id, name, player limits, and capability flags.
- The game exports `createInitialState`, `getLegalActions`, `applyAction`, `getPublicView`, `isGameOver`, and `getScore`.
- State, actions, and events are plain data and serializable.
- The rules package can be imported without depending on the DOM.
- The game state shape is stable enough to support replay and testing.

## Milestone 4: Core Turn Loop

Goal:

- Implement the smallest playable turn cycle for the Bohnanza-like game.

Goals met when:

- The active player can only take actions valid for the current phase.
- Ordered hands are enforced.
- The front-card planting rule works.
- The turn can advance cleanly from start to finish.
- The game can reveal the right prompts to the current player.
- Illegal or stale actions are rejected with useful feedback.

## Milestone 5: Trade Flow

Goal:

- Implement the structured trade system that makes the game interesting.

Goals met when:

- Players can create explicit trade offers.
- Offers can be accepted, declined, or cancelled.
- Trade actions move cards through the correct zones.
- Traded cards must be planted according to the rules.
- The trade UI works in hot-seat mode without hidden state confusion.
- The system remains mechanical and testable rather than becoming free-form chat or negotiation logic.

## Milestone 6: Harvesting, Scoring, and End Conditions

Goal:

- Add the scoring and game-completion rules needed for a full match.

Goals met when:

- Fields can be harvested according to the rules.
- Harvested cards become coins or score objects correctly.
- Discard handling is correct after harvest.
- Game-over conditions are checked from state, not UI assumptions.
- Final scores can be computed from the game state alone.
- A complete match can now run from setup to finish without manual intervention.

## Milestone 7: Replay, Export, and Debugging

Goal:

- Make the game easy to inspect, replay, and debug locally.

Goals met when:

- Action logs can be exported.
- State can be exported to JSON.
- Replays can be stepped forward and backward.
- A test state can be loaded directly into the harness.
- Debug output makes it obvious why an action was legal or illegal.
- A developer can inspect the flow of a game without attaching a debugger.

## Milestone 8: Bot Support

Goal:

- Add a simple legal bot for testing and automation.

Goals met when:

- The bot can choose from legal actions only.
- The bot can complete a turn without crashing.
- The bot can be used in hot-seat or local mixed human/bot sessions.
- The bot is intentionally simple, making correctness more important than skill.
- Bot behavior can be seeded and replayed.

## Milestone 9: UI Polish and Playability

Goal:

- Make the local game feel readable and pleasant enough to test repeatedly.

Goals met when:

- The front card is visually emphasized.
- Valid drop targets are obvious.
- Illegal actions produce clear feedback.
- The current phase prompt is visible.
- The event log is useful instead of noisy.
- Seat switching is smooth in hot-seat mode.
- The interface works on both desktop and mobile-sized screens without collapsing the core flow.

## Milestone 10: SogoTable Integration

Goal:

- Port the finished game package into SogoTable with minimal rewrite.

Goals met when:

- The game folder can be copied or mounted into the SogoTable game registry.
- SogoTable provides table identity, action dispatch, persistence, and player-specific rendering.
- The game still behaves the same after integration as it did in the local lab.
- Public and private player views remain separate.
- The hosted multiplayer path can use the same rules package without changing gameplay logic.

## Milestone 11: Production Readiness Check

Goal:

- Confirm the offline lab and the integrated game are ready for real use, not just demos.

Goals met when:

- A full match can be played start to finish.
- Rules are covered by automated tests.
- The UI clearly shows what each player can do next.
- Illegal actions are blocked or explained.
- The code stays free of DOM-coupled rules logic.
- Multiplayer integration is a transport layer concern, not a rules rewrite.

## Recommended Build Order

1. Project setup and scope lock
2. Generic table shell
3. Generic card engine
4. Game contract and state model
5. Core turn loop
6. Trade flow
7. Harvesting, scoring, and end conditions
8. Replay, export, and debugging
9. Bot support
10. UI polish and playability
11. SogoTable integration
12. Production readiness check

## Notes on Success

- Each milestone should be testable on its own.
- The rules engine should stay pure throughout the whole build.
- The UI should never become the source of truth for legality.
- The local lab is successful if it proves the game is fun and the architecture is reusable.
