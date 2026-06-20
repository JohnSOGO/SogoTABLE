# Project Memory

This file is durable context for future Codex sessions. Read it with `AGENTS.md`, `README.md`, `docs/state-machine.md`, and `docs/AREC.md` before making changes.

## Product Direction

SogoTable is a mobile-first browser platform for simple family turn-based games. Super Tic Tac Toe is the first proof-of-concept, Super Tic Tactical Toe is the second playable game, Dots and Boxes is the third ready two-player game, Battleship is the fourth ready two-player game, Quoridor is the fifth ready two-player game, and 10,000 is the first ready dice game with a flexible guest list. The app should grow through a games menu and clear game modules rather than becoming a single-game app.

Local workspace note: the canonical local repository directory is now `C:\Users\Public\git\SogoTable`. The former `C:\Users\Public\git\SogoGames` path was retired during the SogoTable naming cleanup; do not start new work from the old path.

Naming note: `docs/name-decision.md` records an incoming AI naming decision proposing **MojoTable** as the stronger long-term product name and `table` as the primary user-facing metaphor. The current implemented app name is still **SogoTable** until the user explicitly approves a full product rename.

`docs/state-machine.md` is the current source of truth for screen states, modal states, transitions, and display requirements. Future agents should update it whenever navigation, room flow, or game-screen state behavior changes.

The target use case is casual local play: family members can open a phone browser, choose players, join a room, and play without installs, paid services, heavyweight accounts, or vendor lock-in.

`AI/SogoGames_Code_Review.md` has been read and partially acted on. Cleanup completed so far: fixed the `src/sogotable/static/revision.json` `.gitignore` path, removed generated cache directories locally, added Node built-in Worker API tests under `workers/tests/` for hosted brain behavior, documented the API contract in `docs/api-contract.md`, restricted Worker CORS, and added optimistic locking to the hosted D1 state row so stale concurrent writes fail instead of silently overwriting newer state. The first frontend cleanup split pure browser helpers out of `app.js` into `api-client.js`, `color-utils.js`, and `html-utils.js`; keep future state-machine work in `app.js` until there is a clean screen/controller boundary to extract.

`AI/live_round Variants.md` and `AI/live_Round rounds_without_turns.md` were adopted as future timing-mode ideology and distilled into `docs/live-rounds.md`. `AI/Nomenclature.md` was populated on retry and distilled into `docs/nomenclature.md`: SogoTable game-space language is `Table -> Board -> Zone -> Cell`, with `zone` preferred over `sector` for the nine local 3x3 areas.

`AI/CODEX_CLOUDFLARE_QUOTA_FIX.md` was adopted as Cloudflare quota guidance and distilled into `docs/cloudflare-quota.md`. Durable Object WebSockets should use WebSocket Hibernation in production, socket metadata should survive hibernation through serialized attachments, broadcasts should use `state.getWebSockets()` where available, and hot gameplay/presence/room state should not be written to Workers KV.

`docs/doctrine.md` is the short front door for durable operating doctrine. It points to the canonical docs rather than replacing them.
It also governs code-alignment audits, so future work should check implementation changes against the doctrine index as well as the deeper owner docs.
When the index and a deeper owner doc disagree, the deeper owner keeps its narrow role, but the index remains the audit entry point and should be updated alongside the owner doc.
For future changes, start the audit with `docs/doctrine.md` first, then follow the doc routes it names.

## User Preferences

- The user wants Codex to pay close attention to live playtest feedback and treat it as product-owner direction.
- The user wants future Codex sessions to be up to speed after reading `AGENTS.md`, `README.md`, and docs.
- The user values copious documentation as the project evolves, especially project goals, decisions, preferences, and test workflows.
- The user wants SogoTable to use a Wu Wei / downhill-flow programming method adapted from Ozymandias2: shape the app so correct play naturally flows through the right boundaries instead of relying on scattered special cases. The durable SogoTable version lives in `docs/wu-wei-method.md`.
- The user wants explicit refresh behavior rather than hidden background polling loops. If a manual refresh is desired, the page title or game title can be the refresh affordance.
- The user wants `/arec` or `AREC` to trigger the shared AREC review protocol. Use the local Codex skill at `C:\Users\johns\.codex\skills\arec` when available, then apply SogoTable's product-specific checks in `docs/AREC.md`.
- The user prefers small playable improvements over large speculative architecture.
- The user likes clear, polished mobile UI details: centered marks, obvious valid moves, visual win lines, player-name win declarations, and celebratory feedback.
- The user wants clean, compact UI and prefers keeping related controls on one line when it makes sense. For player rows, keep the emoji/avatar, name, `Edit`, and `Delete` in one row, truncating long names rather than wrapping action buttons.
- Use emoji/icon-only buttons where they are clear. Back navigation and game Exit should use a back emoji with accessible labels; Reset and Play Again should use the repeat emoji while preserving the existing confirmation screens.
- The user wants shared player rosters across PC/iPhone, not per-device player lists.
- The user wants players to be deletable and their emoji icons editable.
- The user wants players anchored by stable opaque IDs so their profile fields can be edited without changing identity. The shared roster edit flow should support name, icon, and color edits, and those edits should flow into active room seats and stats display names/icons.
- Durable system identity should use opaque ids, not human-readable labels. Any value a human sees as a name or label, such as a game name or bot name, must be mutable display data. Current opaque game ids are `a3f19c6e42b8` for Super Tic Tac Toe and `d7e4a91f0c23` for Super Tic Tactical Toe; legacy game ids remain aliases only for compatibility.
- The Edit Player section should keep display name wide at the top with the icon/emoji beside it, put color controls below, then show Clear Stats and Save Changes as stacked actions. Clear Stats should reset games played, wins, personal high score, ELO, and leaderboard rows for that player.
- The user wants player creation at the top of the main menu, not buried inside a game-specific flow.
- The user does not want visible example emoji buttons. Player emoji should default randomly, clear when the emoji field receives focus, and fall back to a random emoji if left blank.
- The user wants display name, icon, and color on one compact row, with color chosen from a larger color palette.
- Player color picking should follow the Mantine ColorPicker feel: hex value, swatches, full-width picker behavior, and accessible controls, but keep the app vanilla unless a larger framework migration is explicitly approved.
- User-selected player colors can be bright or high-luminance, such as Yolo's yellow. Anywhere a player color is used as a background, use contrast-aware foreground text/icon coloring rather than hardcoding exceptions for yellow. For tinted/soft surfaces, calculate contrast against the actual rendered tint, not the raw source player color.
- Player colors are gameplay signals. When a guest joins with a color too similar to the host's in-room color, automatically assign the guest a non-conflicting room-seat color from the existing palette. Do not mutate the guest's persistent roster color for this.
- The main menu should stay focused: current player and direct game selection. Player selection and player creation should be separate top-level actions, while editing/deletion stays inside the player modal.
- The `Player & Game Select` current-player row should look consistent across small and large iPhones: avatar/name and `Edit`/`Change`/`Create` stay on one line, buttons remain compact, and long names truncate instead of pushing buttons below.
- Player rows should not have Pick/Selected buttons. Tapping a player row selects it, green border indicates selection, and the modal closes immediately.
- Opening player creation from the main menu should show only the create-player form, not the existing player list.
- Opening player selection from the main menu should show only the existing players section, not the create-player form. Pressing `Edit` should narrow the modal to the edited player row plus the edit form.
- Main menu game buttons should only show game names. Game descriptions belong on the selected game's game-selected screen or game room, not on the main menu.
- Incoming AI handoff/prompt files may be placed in `AI/`. That directory is ignored and should be treated as input context, not product source.
- The user does not want distracting effects. In local hot-seat Super Tic Tac Toe, turn and active-board feedback should use the current player's selected color, with only a brief one-shot flash and no continuous green pulse.
- The user approved quiet generated UI/game sound for SogoTable. Audio should stay browser-only, centralized in `src/sogotable/static/sound.js`, enabled quietly by default, user-mutable from a compact global toggle, and deduped from room-state transitions so polling or realtime refreshes do not replay old sounds. Do not add sound assets, background music, or per-game audio systems until explicitly approved.
- For turn-change audio, player one/X keeps the original cue and player two/O should use the same cue one piano key higher. The global sound toggle should show speaker icons (`🔊` on, `🔇` muted) rather than text labels. The speaker button cycles through five persisted volume levels and then mute; show a green bottom progress bar for volume level 1-5 and no bar while muted. Volume levels should be audibly distinct on phone speakers, not just visually different.
- The user approved single-player bot opponents as normal room seats, not a separate single-player game mode. The waiting room host should see `Invite Bot` next to local and remote opponent options. Bots are Worker-owned actors with opaque ids and `kind: "bot"` that choose random legal moves through the same hosted move pipeline as humans. Bot games count for the human player's stats/ELO, while bots stay out of visible player lists and public leaderboards.
- Tactical Tess is the first normal-strength bot. She still uses the hosted move pipeline, but her move choice scores each legal move for game wins, opponent game-win blocks, zone wins/blocks, threat shape, center/corner position, destination danger, and tactical pickup value. Keep this as move selection only; do not let bot logic mutate boards outside `makeMove`.
- In the bot invite UI, show `🧠` next to Tactical Tess and `🎲` next to random legal-move bots so the algorithm difference is visible without exposing ids.
- Public API bot-vs-bot smoke tests can create a bot-shaped host and seat a predefined bot opponent, then drive legal moves through `/api/room/move`. In all-bot rooms, reset/play-again can immediately trigger bot moves again, so verify reset by `game_epoch` advancing and game state returning to active/playing rather than expecting `move_count` to stay at zero.
- The opening splash should emphasize the SogoTable image mark, not a visible `SogoTable` heading. Keep it narrow-window friendly; the image should be centered and about 90% as wide as the `Start Playing` button.
- Keep the browser/iPhone status theme bar white across phone sizes, but preserve the app's soft red page gradient.
- During phone playtesting after room WebSockets were added, the user reported that roughly 1 in 10 taps did not take. Avoid rebuilding the board DOM for unchanged room snapshots or background refreshes, because a render between touch-down and click can swallow the tap.
- During public lobby playtesting, the user reported a random lobby refresh/glitch that looked like assets being removed and replaced. Treat fallback lobby and room-list refreshes as visual no-ops when the incoming snapshot is identical; do not clear and rebuild stable lobby DOM just because a timed safety refresh fired.
- The user wants all two-player lobbies to share the same architecture. Lobby design changes should apply globally to two-player games unless a later game explicitly needs a different flow.
- The selected-game lobby panel should show only the `Lobby` heading and players currently in that game lobby. Put the game stat affordance on the same heading row at far right as a tappable `ELO` or `High Scores` link. Tapping it opens a popup with one compact stats table, visually matching the clean player-stats table and using only one separator line under the header. Do not cap the popup rows; let the popup scroll when needed. Super Tic Tac Toe shows only ELO ratings because score has no meaning there. Super Tic Tactical Toe shows only high scores because tactical score is the meaningful lobby brag metric. ELO/high-score rows should only include active selectable roster players; remove/filter missing deleted players from public stat displays.
- Once a player is selected on `Player & Game Select`, show that player's per-game stats as a compact table: header row first, then game name, games played, games won, personal high score, and ELO as clean values. Avoid repeated labels in every row.
- After reviewing `AI/wu-wei-event-driven-code-review-plan.md` and `AI/SogoGames_wu_wei_event_driven.zip`, the event-driven direction was adopted with constraints and the zip was rejected as a direct source snapshot. Track the staged implementation in `docs/wu-wei-event-driven-progress.md`.
- The user wants SogoTable to treat `liveRound` as a major future identity: digital board games with rounds but no fixed turns. The parent ideology is the Turnless Round System. Current ready games remain `turnBased`; future games can opt into `simultaneousSubmit`, `liveRound`, `liveRoundRegroup`, `timedLiveRound`, `actionBudgetRound`, or `hybridRound`.
- For future live-round games, each active player should act once per round in any order. Actions resolve through the server in official received order, the player locks after acting, and the next round begins when all active players have acted.
- Prefer `liveRoundRegroup` for future games with rewards, power-ups, coins, drafting, or catch-up mechanics. It keeps immediate board reactions while adding a regroup phase where slower players still get meaningful choices.
- Prefer `Table -> Board -> Zone -> Cell` for game-space language. The current hosted room is the multiplayer transport/session container; the table is the game-state concept inside the room. For Super Tic Tac Toe and Super Tic Tactical Toe, the whole nested play surface is the board, each local 3x3 area is a zone, and each playable square is a cell.

## Current Implemented Shape

- The Python gameplay server and Python rules engine have been removed. The project is Cloudflare-only for actual play.
- Vanilla browser UI lives under `src/sogotable/static/`.
- Cloudflare Pages serves the static app.
- All `/api/*` browser calls target the hosted Worker brain at `https://sogotable.sogodojo.com/api/*`, including local static previews. Do not reintroduce localhost/private-LAN API routing unless the user explicitly asks for a local backend again.
- If the Worker is unavailable, the UI must fail visibly and disable multiplayer actions rather than creating local-only player or room state.
- The hosted brain is a Cloudflare Worker configured by `wrangler.toml` and implemented in `workers/sogotable-api.js`. It owns players, lobby presence, rooms, invites, reset voting, Super Tic Tac Toe moves, and Super Tic Tactical Toe pickups/scoring so public browsers can see each other and play together. It currently stores shared state as one JSON row in D1 database `sogotable-state` (`bbb1cdec-0410-476f-b058-f216263b61d8`) with optimistic version locking. KV was rejected because lobby/player activity hit the free daily write limit; isolate memory was rejected because phone and PC could land on different edge instances. Durable Objects now serialize active room mutations and deliver realtime room/app snapshots while D1 remains the public-playtesting persistence layer.
- `RoomDurableObject` is one live WebSocket fanout and room-mutation object per room. Active room-changing HTTP requests enter the room object first, then the object validates/persists through D1 and broadcasts the resulting room snapshot. This removes aggressive active-room refresh checking during normal connected play while preserving HTTP as the reconnect/backfill path.
- Room fanout notifications are sent to `RoomDurableObject` through internal `fetch()` requests. Do not call custom Durable Object RPC methods from the Worker unless the object class is changed to `extends DurableObject` from `cloudflare:workers`; plain classes will surface an RPC support error to move/reset responses.
- The first app-level event channel is `EventHubDurableObject` behind `/api/events/socket`, bound as `EVENT_HUB` with migration `v2_event_hub`. It broadcasts room-list, lobby, pending-invite, and stats snapshots after Worker writes, and now sends an initial snapshot on socket open or subscription change. Room and app-event WebSockets use Cloudflare WebSocket Hibernation where available; plain `server.accept()` is only a local/test fallback.
- Public multi-device play on the EventHub build was smoke-tested successfully with two iPhones and three browsers.
- After the Cloudflare quota fix, app-level timed reads were a temporary fallback during the event-channel transition. Current doctrine now prefers push, reconnect, and explicit refresh over repeating timers.
- Active room mutations for join, bot join, invite response, leave/close, move, and reset now route through `RoomDurableObject` before D1 persistence. Room creation and invite creation are still Worker-owned for now. The next authority migration should target room creation or deeper D1 state partitioning only after this path is smoke-tested.
- Rooms carry monotonic `revision` and `game_epoch` freshness markers. Browser stale-snapshot guards should prefer those fields over `game.move_count`, because reset/play-again correctly returns move count to zero.
- Player deletion is blocked while that player is seated in an unfinished room. Successful deletes remove pending lobby presence and pending invites for the player, but do not rewrite completed historical room records.
- Frontend realtime wiring now lives in `src/sogotable/static/realtime.js`. Keep socket/reconnect/fallback timer mechanics there; keep screen state, room interpretation, and UI rendering in `app.js`.
- The browser has an in-flight move guard and touch-first `pointerdown` handling for board cells. Do not remove this without replacing it with an equally explicit anti-double-submit and anti-swallowed-tap path.
- Browser local storage keeps the device/home selected player separately from the active hot-seat turn actor. `sogotable.deviceSelectedPlayerId` is the browser's durable selected player; `selectedPlayerId` in runtime may temporarily point at the current turn owner during local hot-seat play.
- Do not clear the durable device/home selected player merely because a roster fetch fails or a single refreshed roster does not contain that id. Clear it only when the user explicitly deletes that player or chooses another one; otherwise users feel forced to recreate persistent names.
- Public builds briefly had a localStorage player fallback before the hosted D1 brain was stable. That fallback is intentionally removed because it creates false positives and separate PC/iPhone player universes. Player creation, deletion, room creation, and joins must use the shared API only.
- Browser startup should purge the deprecated `sogotable.players` and `sogotable.playersMigrated` keys so old local-only roster data cannot be mistaken for live shared state.
- Public room create/join actions must use the browser's device/home selected player from the shared API roster. Do not synthesize or migrate local fallback players into the hosted roster.
- Reserved smoke-test player ids `codex-test-player-1` and `codex-test-player-2` are Worker-recognized hidden test seats. They can be used in API tests, but must remain filtered from the public roster, lobby presence, room lists, invite targets, and public stats so normal players cannot select them.
- Open/current game cards are hints, not authority. When a user taps `Join Game` or `Re-enter Game`, fetch the room fresh from the shared brain before deciding whether the selected player is already seated, can join, or should see that the game is no longer open.
- Hosted API read-only refresh calls must not write the whole D1 state row back to the database. Saving after `GET` requests can resurrect stale room/player snapshots when several browsers and phones are refreshing at once.
- Games menu exists with Super Tic Tac Toe, Super Tic Tactical Toe, Dots and Boxes, Battleship, Quoridor, and 10,000 as ready games. The browser now loads ready-game metadata from the hosted `/api/games` registry, with a small local fallback only for startup resilience.
- Game metadata may define `player_count`. Two-player games use the normal waiting room, invite, local opponent, and bot opponent flow. Solo games start immediately on room creation and must hide opponent-selection controls.
- The player/game selection screen is titled `Player & Game Select`. It starts with the current player summary, separate `Change` and `Create` buttons positioned to the right of the player icon/name when space allows, then direct game buttons.
- Current main menu shape is selected-player summary, separate player action buttons, and simple full-width game buttons showing only game names. There is no generic Continue button and no Create/Re-enter text on the menu.
- Clicking a game now opens a selected-game screen for that game type. This screen shows the game description, current players actually viewing that selected-game lobby, current open games, current in-progress games, and a `Create Game`/`Re-enter Game` action.
- One-phone hot-seat play is supported. When a local opponent is selected, the room is marked as local mode, the browser auto-selects the current-turn player after each move, and the original device/home selected player is restored when the game ends or closes. Local hot-seat turn swaps must not overwrite the device/home selected player in local storage.
- During an active game, player names on the game screen are passive status labels, not controls. Do not let users tap player names to manually change the active turn actor. The current-turn player label should be highlighted with a light tint of that player's selected color; non-turn player labels should stay white.
- The room hosts the table: it is the live multiplayer container for the game instance and play space, not a pre-game lobby container. The selected player from the main menu is the host; do not show a player roster or ask the user to select a host again before creating the room.
- Multi-device play keeps each browser's selected player fixed. Do not auto-switch the selected player on room refresh; the game screen should show `It's Your Turn PLAYER_NAME; Place an X/O` or `Waiting for PLAYER_NAME.` and only enable moves for the selected player's turn.
- Waiting turn state should use a soft yellow box, not grey.
- Manual X/O selection is removed. Creating a room seats the host and waits for an opponent; once a second player joins or accepts an invite, X/O is assigned randomly and play begins automatically.
- Each player may have only one active hosted room per game. If the host creates again before the room is complete, the Worker returns the existing room.
- There is no separate room-entry screen for a specific room. The selected-game screen is for choosing or creating a game instance; the game screen is still the room and the room is the game.
- The selected-game lobby shows the local selected player first, then other lobby-present players in sorted order. The game screen is the waiting/play surface. It shows Host and Opponent slots while waiting for the game to start, then hides that Players section once the game is active because turn ownership is shown separately. An empty opponent slot shows `Select Local Opponent`, `Invite Remote Opponent`, and `Invite Bot` for the host. Creating a game must open the actual tic-tac-toe game screen; while waiting for the second player, show the board disabled rather than hiding it. If the selected player already has an unfinished room for the game, show a recovery notice and `Re-enter Game`; use the browser's device/home selected player for re-entry, not a temporary hot-seat actor.
- The game screen has an `Exit` button that asks the local player for Yes/No confirmation and lets that player leave without needing agreement from the other player. In the current hosted implementation, exiting closes the room so connected browsers return to the selected-game screen. `Reset` is different: it asks for confirmation, then waits for both seated players to agree before clearing the board. After a completed game the same control is labeled `Play Again` and also requires both seated players to agree before starting a fresh board.
- `Exit` should return the player to the selected game's lobby/list screen, not all the way back to `Player & Game Select`.
- Invited players receive an invite popup with `Yes` and `No`. Accepting joins the room and opens it; declining dismisses the invite. Hosts should see invite lifecycle feedback while waiting: sent, accepted, declined, or expired. Remote invite targets must come from players currently present in the selected game's lobby and must exclude anyone already seated in an unfinished game. If none are eligible, show `No players in lobby.`
- There is no manual Start Game button. When the room has the required players, it becomes active and both devices auto-open the board once the browser observes the active state.
- The selected-game screen must auto-open the game screen when the browser sees that the local selected player is seated in an active room. This prevents players from being left on a waiting/list screen after a remote join succeeds.
- Game definitions should carry explicit availability metadata in the hosted `/api/games` registry. Super Tic Tac Toe and Super Tic Tactical Toe are ready games; future games can be added as unavailable/coming soon without changing the player -> game -> room flow.
- Future game definitions should eventually carry timing metadata. Timing mode must be game metadata and room state, not a separate lobby architecture.

## Super Tic Tactical Toe UX Decisions

- Super Tic Tactical Toe is game #2 and uses the same global two-player lobby, room, invite, local-opponent, re-entry, reset, and WebSocket architecture as Super Tic Tac Toe.
- Tactical pickups and scores are authoritative Worker state. The browser must not decide pickup spawn locations, capture, or score.
- Tactical score alone does not end the game. The game ends when a player captures three zones in a macro line, then the player with the highest final score wins. If scores are tied on the line-completing move, the line completer wins. If the board fills first and scores are tied, the game is a draw.
- Use `Zone` for the nine main 3x3 sections in tactical-game docs and UI thinking. The whole play area is the board, and the 81 playable squares are cells. Existing code/API names may still contain legacy `sector` or `board` terms until an explicit migration.
- Current MVP pickups are Coin for 10 points and Treasure Chest for 25 points. Future tactical emoji effects should be added through pickup config/effect handling rather than rewriting the base nested-board engine.

## Dots And Boxes UX Decisions

- Dots and Boxes is game #3 and uses the same selected-game lobby, room, invite, local-opponent, bot-opponent, reset, exit, and room WebSocket architecture as the other ready two-player games.
- Hosted moves use `line_id` values such as `h-0-0` and `v-0-1` instead of Super Tic Tac Toe `board`/`cell` coordinates.
- Completing a box awards that box and keeps the current turn. Non-capturing line claims pass the turn.
- The game ends when all lines are claimed. Highest box count wins; equal scores draw.
- Dots and Boxes uses high scores in the selected-game lobby because box count is meaningful.
- Dots and Boxes defaults to 5 boxes across by 8 boxes down. Bot auto-play must allow long capture chains to finish instead of using the small fixed tic-tac-toe bot-turn cap.

## Battleship UX Decisions

- Battleship is game #4 and uses the same selected-game lobby, room, invite, local-opponent, bot-opponent, reset, exit, and room WebSocket architecture as the other ready two-player games.
- Battleship phases are `setup`, `playing`, and `complete`.
- During setup, players can manually draft ship positions by selecting a ship, toggling horizontal/vertical, and tapping a start cell, or use `Auto Place` for quick review.
- During play, the board defaults to offence on the local player's turn and defence while waiting, with manual `Auto`, `Offence`, and `Defence` view controls.

## Quoridor UX Decisions

- Quoridor is game #5 and uses the same selected-game lobby, room, invite, local-opponent, bot-opponent, reset, exit, and room WebSocket architecture as the other ready two-player games.
- Quoridor uses a 9x9 board, ten walls per player, standard orthogonal move, jump, and diagonal side-jump rules, and Worker validation that wall placements never block every path to either goal edge.
- Players use their selected emoji as pawn tokens. The browser offers Pawn, horizontal wall, and vertical wall modes while the Worker remains authoritative for legal moves and legal walls.
- Quoridor bots use the four difficulty model from `src/sogotable/static/games/Quoridor/quoridor_ai_rules_four_difficulties.md`: Rookie, Scout, Tactician, and Master.

## 10,000 UX Decisions

- 10,000 is game #6 and the first hosted dice game with a flexible guest list. It uses the normal selected-game screen, room, reset, exit, room WebSocket, and high-score infrastructure, and the host lobby keeps the standard invite buttons while omitting local-opponent controls.
- The Worker owns dice rolls, scoring validation, farkles, banking, and game completion. The browser renders CSS 3D dice animation as presentation only and must settle on the Worker-provided dice values.
- Tapping scoring dice updates the visible `This turn` score immediately; deselecting them subtracts the value back out before the move is committed.
- A farkle turns the dice red and opens a popup that must be acknowledged before play continues.
- The top status bar should give the player the next action first, then explain wait states while the round resolves.
- The standings table shows player icon first, reveals the player name on tap, and includes Farkle and status columns so the round state is obvious at a glance.
- Scoring uses the first classic rule set: single 1s and 5s, triples, 1-6 straight, and three pairs. The target score is 10,000.

## Super Tic Tac Toe UX Decisions

- The board is slightly narrower than full width on phones for comfort.
- Legal boards and the turn highlight use the current player's selected color. When the legal target changes, the board flashes once for about 0.25 seconds, then settles into that player's color.
- Filled cells and won sub-boards use light tints derived from the owning player's selected color, with contrast-aware foreground text. This makes ownership visible without relying only on X/O colors.
- Turn labels and player icons must stay readable against arbitrary player colors by calculating a contrast-aware foreground color. Solid avatars use the solid player color as the contrast background; soft turn banners use the mixed/tinted banner background as the contrast background.
- Inactive boards are dimmed so the playable target is clearer.
- X/O marks should be visually centered in cells.
- A win should show the winning macro line, highlight the winning macro boards, highlight cells that won each claimed small board, and update the status banner with the winning mark and player name.
- One second after a winner is detected, show a celebration overlay with confetti and the winning player's name and icon. The overlay must be closable with `Back to Board`.
- The game screen has a persistent device-perspective turn row below the player buttons. It is separate from the generic status banner and should make multi-device turn ownership obvious.

## Test And Approval Workflows

- Use the public Cloudflare URL for phone testing: `https://sogotable.sogodojo.com/`.
- Hosted test rooms are useful. The Worker supports requested 4-character room codes when creating rooms through the API.
- Room `AAAA` has been used as a staged approval room one move away from an `O` win. If hosted state is reset or the room is closed, it must be staged again.
- For the staged O-win approval position, the final move is bottom-left macro board, bottom-right cell: board `6`, cell `8`.

## Verification Habits

- Run `npm run test:worker` after hosted brain changes, including Durable Object notification behavior.
- Run `node --check` for changed browser JavaScript files after browser changes.
- Check static assets through Cloudflare Pages after publishing, or through a generic static preview server for local UI inspection.
- PWA support is intentionally conservative: cache static shell assets and icons, but never cache `/api/` requests. The PWA improves phone install/reload feel; it does not promise offline multiplayer or replace the hosted Worker/state layer.
- When public phone/PWA behavior changes, bump the service worker `CACHE_NAME`. Old iPhone installs can keep stale `app.js` even after reinstall if the service worker cache name stays the same. During fast public playtesting, core shell files (`/`, `/index.html`, `/app.js`, `/styles.css`, `/manifest.webmanifest`, `/revision.json`) should be network-only/no-store rather than cached.
- The first audio pass also keeps `/sound.js` network-only/no-store in the service worker shell fetch list.
- The intro screen shows a Git-backed revision summary. Cloudflare Pages serves `/revision.json`, generated at build time by `scripts/write-static-revision.mjs`. Use Git as the source of truth: human-facing version, short commit hash, branch, and dirty/clean state. Keep the summary short and readable on phones.
- If browser automation tools are unavailable, headless Chrome can be driven through the DevTools protocol if Chrome is installed.
