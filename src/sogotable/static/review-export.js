// Sogo superuser source-review export: fetch an allowlist of public repo files
// from GitHub and bundle them into a stored (uncompressed) ZIP in the browser.
// This is admin tooling, kept out of the main app shell. app.js owns the button
// state and superuser gate; this module owns the file list and ZIP machinery.

const REVIEW_EXPORT_REPO_RAW_BASE = "https://raw.githubusercontent.com/JohnSOGO/SogoTABLE/main/";
const REVIEW_EXPORT_FILES = [
  "README.md",
  "docs/game-chess-tutor.md",
  "package.json",
  "scripts/bench-ten-thousand-bots.mjs",
  "scripts/write-static-revision.mjs",
  "scripts/export-bug-reports.mjs",
  "scripts/manage-bug-reports.mjs",
  "scripts/serve-bug-manager.mjs",
  "scripts/bug-agent.mjs",
  "scripts/clear-bug-reports.mjs",
  "workers/sogotable-api.js",
  "workers/room-view.js",
  "workers/room-seats.js",
  "workers/player-rooms.js",
  "workers/bug-reports.js",
  "workers/custom-cards.js",
  "workers/card-ratings.js",
  "workers/game-library.js",
  "workers/platform/http.js",
  "workers/platform/rate-limit.js",
  "workers/platform/auth.js",
  "workers/test-players.js",
  "workers/projections.js",
  "workers/game-catalog.js",
  "workers/stats.js",
  "workers/persistence/state.js",
  "workers/tests/sogotable-api.test.js",
  "workers/tests/helpers.js",
  "workers/tests/architecture.test.js",
  "workers/tests/tracklayers.test.js",
  "workers/games/bots.js",
  "workers/games/util.js",
  "workers/games/skip-vote.js",
  "workers/games/handlers.js",
  "workers/games/boxes/rules.js",
  "workers/games/battleship/rules.js",
  "workers/games/quoridor/rules.js",
  "workers/games/ten-thousand/rules.js",
  "workers/games/super-tic-tac-toe/rules.js",
  "workers/games/super-tic-tac-toe/bot.js",
  "workers/games/yahtzee/rules.js",
  "workers/games/yahtzee/ai.js",
  "workers/games/mazewright/rules.js",
  "workers/games/rtta/rules.js",
  "workers/games/rtta/ai.js",
  "workers/games/zombie-dice/rules.js",
  "workers/games/zombie-dice/ai.js",
  "workers/games/liars-dice/rules.js",
  "workers/games/liars-dice/ai.js",
  "src/sogotable/static/games/liars-dice/manifest.js",
  "src/sogotable/static/games/liars-dice/render.js",
  "src/sogotable/static/games/liars-dice/styles.js",
  "workers/games/no-thanks/rules.js",
  "workers/games/no-thanks/ai.js",
  "src/sogotable/static/games/no-thanks/manifest.js",
  "src/sogotable/static/games/no-thanks/render.js",
  "src/sogotable/static/games/no-thanks/cards.js",
  "src/sogotable/static/games/no-thanks/styles.js",
  "workers/games/hearts/rules.js",
  "workers/games/hearts/ai.js",
  "workers/games/potion-lab/rules.js",
  "workers/games/potion-lab/ai.js",
  "workers/games/realmwright/tiles.js",
  "workers/games/realmwright/board.js",
  "workers/games/realmwright/rules.js",
  "workers/games/realmwright/ai.js",
  "workers/games/bloomwork/board.js",
  "workers/games/bloomwork/resolve.js",
  "workers/games/bloomwork/rules.js",
  "workers/games/bloomwork/ai.js",
  "workers/games/reefkeepers/tiles.js",
  "workers/games/reefkeepers/board.js",
  "workers/games/reefkeepers/rules.js",
  "workers/games/reefkeepers/ai.js",
  "workers/games/hidden-isles/words.js",
  "workers/games/hidden-isles/aliases.js",
  "workers/games/hidden-isles/clues.js",
  "workers/games/hidden-isles/ai.js",
  "workers/games/hidden-isles/rules.js",
  "workers/games/chinese-checkers/board.js",
  "workers/games/chinese-checkers/resolve.js",
  "workers/games/chinese-checkers/modes.js",
  "workers/games/chinese-checkers/rules.js",
  "workers/games/chinese-checkers/ai.js",
  "workers/games/last-orders/catalog.js",
  "workers/games/last-orders/engine.js",
  "workers/games/last-orders/legal.js",
  "workers/games/last-orders/ai.js",
  "workers/games/last-orders/rules.js",
  "workers/games/last-orders/packs.js",
  "workers/games/last-orders/packs/base.js",
  "workers/games/last-orders/packs/harbor.js",
  "workers/games/last-orders/packs/frost.js",
  "workers/games/last-orders/packs/masquerade.js",
  "workers/games/last-orders/packs/clockwork.js",
  "workers/games/last-orders/packs/rowdy.js",
  "workers/games/tradewinds/board.js",
  "workers/games/tradewinds/ai.js",
  "workers/games/tradewinds/rules.js",
  "workers/games/tracklayers/map.js",
  "workers/games/tracklayers/cards.js",
  "workers/games/tracklayers/graph.js",
  "workers/games/tracklayers/legal.js",
  "workers/games/tracklayers/resolve.js",
  "workers/games/tracklayers/rules.js",
  "workers/games/tracklayers/ai.js",
  "workers/games/wnyk/rules.js",
  "workers/games/wnyk/ratings.js",
  "workers/games/wnyk/projection.js",
  "workers/games/wnyk/runtime.js",
  "workers/games/wnyk/decks.js",
  "workers/games/wnyk/ai.js",
  "workers/games/mystic-wood/data.js",
  "workers/games/mystic-wood/engine.js",
  "workers/games/mystic-wood/events.js",
  "workers/games/mystic-wood/narration.js",
  "workers/games/mystic-wood/spells.js",
  "workers/games/mystic-wood/joust.js",
  "workers/games/mystic-wood/power.js",
  "workers/games/mystic-wood/rules.js",
  "workers/games/mystic-wood/ai.js",
  "src/sogotable/static/games/mystic-wood/manifest.js",
  "src/sogotable/static/games/mystic-wood/render.js",
  "src/sogotable/static/games/mystic-wood/board-input.js",
  "src/sogotable/static/games/mystic-wood/encounter.js",
  "src/sogotable/static/games/mystic-wood/util.js",
  "src/sogotable/static/games/mystic-wood/horn.js",
  "src/sogotable/static/games/mystic-wood/herald.js",
  "src/sogotable/static/games/mystic-wood/styles.js",
  "src/sogotable/static/games/mystic-wood/content.js",
  "src/sogotable/static/games/potion-lab/manifest.js",
  "src/sogotable/static/games/potion-lab/render.js",
  "src/sogotable/static/games/potion-lab/styles.js",
  "src/sogotable/static/games/realmwright/art.js",
  "src/sogotable/static/games/realmwright/assets.js",
  "src/sogotable/static/games/realmwright/board-svg.js",
  "src/sogotable/static/games/realmwright/board-view.js",
  "src/sogotable/static/games/realmwright/bot-tick.js",
  "src/sogotable/static/games/realmwright/round-timer.js",
  "src/sogotable/static/games/realmwright/deal-fx.js",
  "src/sogotable/static/games/realmwright/fx.js",
  "src/sogotable/static/games/realmwright/branding.js",
  "src/sogotable/static/games/realmwright/lobby.js",
  "src/sogotable/static/games/realmwright/manifest.js",
  "src/sogotable/static/games/realmwright/panels.js",
  "src/sogotable/static/games/realmwright/render.js",
  "src/sogotable/static/games/realmwright/sfx.js",
  "src/sogotable/static/games/realmwright/styles.js",
  "src/sogotable/static/games/bloomwork/art.js",
  "src/sogotable/static/games/bloomwork/assets.js",
  "src/sogotable/static/games/bloomwork/board.js",
  "src/sogotable/static/games/bloomwork/branding.js",
  "src/sogotable/static/games/bloomwork/hints.js",
  "src/sogotable/static/games/bloomwork/lobby.js",
  "src/sogotable/static/games/bloomwork/manifest.js",
  "src/sogotable/static/games/bloomwork/panels.js",
  "src/sogotable/static/games/bloomwork/render.js",
  "src/sogotable/static/games/bloomwork/sfx.js",
  "src/sogotable/static/games/bloomwork/styles.js",
  "src/sogotable/static/games/bloomwork/README.md",
  "src/sogotable/static/games/reefkeepers/art.js",
  "src/sogotable/static/games/reefkeepers/assets.js",
  "src/sogotable/static/games/reefkeepers/board-view.js",
  "src/sogotable/static/games/reefkeepers/branding.js",
  "src/sogotable/static/games/reefkeepers/lobby.js",
  "src/sogotable/static/games/reefkeepers/manifest.js",
  "src/sogotable/static/games/reefkeepers/panels.js",
  "src/sogotable/static/games/reefkeepers/render.js",
  "src/sogotable/static/games/reefkeepers/sfx.js",
  "src/sogotable/static/games/reefkeepers/styles.js",
  "src/sogotable/static/games/hidden-isles/art.js",
  "src/sogotable/static/games/hidden-isles/assets.js",
  "src/sogotable/static/games/hidden-isles/board-view.js",
  "src/sogotable/static/games/hidden-isles/bot-tick.js",
  "src/sogotable/static/games/hidden-isles/branding.js",
  "src/sogotable/static/games/hidden-isles/lobby.js",
  "src/sogotable/static/games/hidden-isles/manifest.js",
  "src/sogotable/static/games/hidden-isles/panels.js",
  "src/sogotable/static/games/hidden-isles/render.js",
  "src/sogotable/static/games/hidden-isles/sfx.js",
  "src/sogotable/static/games/hidden-isles/styles.js",
  "src/sogotable/static/games/chinese-checkers/assets.js",
  "src/sogotable/static/games/chinese-checkers/board-svg.js",
  "src/sogotable/static/games/chinese-checkers/branding.js",
  "src/sogotable/static/games/chinese-checkers/lobby.js",
  "src/sogotable/static/games/chinese-checkers/manifest.js",
  "src/sogotable/static/games/chinese-checkers/panels.js",
  "src/sogotable/static/games/chinese-checkers/render.js",
  "src/sogotable/static/games/chinese-checkers/sfx.js",
  "src/sogotable/static/games/chinese-checkers/styles.js",
  "src/sogotable/static/games/last-orders/art.js",
  "src/sogotable/static/games/last-orders/assets.js",
  "src/sogotable/static/games/last-orders/branding.js",
  "src/sogotable/static/games/last-orders/content.js",
  "src/sogotable/static/games/last-orders/describe.js",
  "src/sogotable/static/games/last-orders/fx.js",
  "src/sogotable/static/games/last-orders/hand.js",
  "src/sogotable/static/games/last-orders/hand-fx.js",
  "src/sogotable/static/games/last-orders/lobby.js",
  "src/sogotable/static/games/last-orders/manifest.js",
  "src/sogotable/static/games/last-orders/panels.js",
  "src/sogotable/static/games/last-orders/render.js",
  "src/sogotable/static/games/last-orders/sfx.js",
  "src/sogotable/static/games/last-orders/styles.js",
  "src/sogotable/static/games/last-orders/tick.js",
  "src/sogotable/static/games/tradewinds/manifest.js",
  "src/sogotable/static/games/tradewinds/render.js",
  "src/sogotable/static/games/tradewinds/view.js",
  "src/sogotable/static/games/tradewinds/board-svg.js",
  "src/sogotable/static/games/tradewinds/art.js",
  "src/sogotable/static/games/tradewinds/panels.js",
  "src/sogotable/static/games/tradewinds/flows.js",
  "src/sogotable/static/games/tradewinds/trade.js",
  "src/sogotable/static/games/tradewinds/lobby.js",
  "src/sogotable/static/games/tradewinds/branding.js",
  "src/sogotable/static/games/tradewinds/assets.js",
  "src/sogotable/static/games/tradewinds/sfx.js",
  "src/sogotable/static/games/tradewinds/styles.js",
  "src/sogotable/static/games/tracklayers/advice.js",
  "src/sogotable/static/games/tracklayers/assets.js",
  "src/sogotable/static/games/tracklayers/branding.js",
  "src/sogotable/static/games/tracklayers/lobby.js",
  "src/sogotable/static/games/tracklayers/manifest.js",
  "src/sogotable/static/games/tracklayers/map-svg.js",
  "src/sogotable/static/games/tracklayers/panels.js",
  "src/sogotable/static/games/tracklayers/render.js",
  "src/sogotable/static/games/tracklayers/sfx.js",
  "src/sogotable/static/games/tracklayers/styles.js",
  "src/sogotable/static/games/chinese-checkers/clock.js",
  "src/sogotable/static/games/chinese-checkers/controls.js",
  "src/sogotable/static/games/wnyk/manifest.js",
  "src/sogotable/static/games/wnyk/render.js",
  "src/sogotable/static/games/wnyk/cards.js",
  "src/sogotable/static/games/wnyk/styles.js",
  "docs/game-potion-lab.md",
  "docs/game-realmwright.md",
  "docs/game-bloomwork.md",
  "docs/game-reefkeepers.md",
  "docs/game-hidden-isles.md",
  "docs/game-chinese-checkers.md",
  "docs/game-last-orders.md",
  "docs/game-tradewinds.md",
  "docs/game-tracklayers.md",
  "src/sogotable/static/games/playing-cards.js",
  "src/sogotable/static/games/hearts/manifest.js",
  "src/sogotable/static/games/hearts/render.js",
  "src/sogotable/static/games/hearts/lobby.js",
  "src/sogotable/static/games/hearts/styles.js",
  "src/sogotable/static/games/zombie-dice/manifest.js",
  "src/sogotable/static/games/zombie-dice/render.js",
  "src/sogotable/static/games/zombie-dice/styles.js",
  "src/sogotable/static/games/zombie-dice/phrases.js",
  "src/sogotable/static/games/rtta/manifest.js",
  "src/sogotable/static/games/rtta/rules.js",
  "src/sogotable/static/games/rtta/styles.js",
  "src/sogotable/static/games/rtta/board.js",
  "src/sogotable/static/games/rtta/board-art.js",
  "src/sogotable/static/games/rtta/board-fx.js",
  "src/sogotable/static/games/rtta/render.js",
  "src/sogotable/static/index.html",
  "src/sogotable/static/app.js",
  "src/sogotable/static/api-client.js",
  "src/sogotable/static/client/session-store.js",
  "src/sogotable/static/client/app-update.js",
  "src/sogotable/static/color-utils.js",
  "src/sogotable/static/html-utils.js",
  "src/sogotable/static/realtime.js",
  "src/sogotable/static/review-export.js",
  "src/sogotable/static/storage.js",
  "src/sogotable/static/service-worker.js",
  "src/sogotable/static/sound.js",
  "src/sogotable/static/sound-files.js",
  "src/sogotable/static/controllers/houses.js",
  "src/sogotable/static/controllers/invites.js",
  "src/sogotable/static/controllers/local-seat.js",
  "src/sogotable/static/controllers/player-appearance.js",
  "src/sogotable/static/controllers/prompts.js",
  "src/sogotable/static/controllers/room-sounds.js",
  "src/sogotable/static/controllers/sound-controls.js",
  "src/sogotable/static/controllers/superuser.js",
  "src/sogotable/static/controllers/game-options.js",
  "src/sogotable/static/controllers/game-stats.js",
  "src/sogotable/static/controllers/win-overlay.js",
  "src/sogotable/static/controllers/turn-status.js",
  "src/sogotable/static/controllers/toast.js",
  "src/sogotable/static/controllers/room-share.js",
  "src/sogotable/static/client/turn-attention.js",
  "src/sogotable/static/vendor/qrcode-generator.js",
  "src/sogotable/static/styles-tokens.css",
  "src/sogotable/static/styles.css",
  "src/sogotable/static/styles-header.css",
  "src/sogotable/static/styles-roster.css",
  "src/sogotable/static/styles-room.css",
  "src/sogotable/static/styles-games.css",
  "src/sogotable/static/manifest.webmanifest",
  "src/sogotable/static/games/registry.js",
  "src/sogotable/static/games/game-kinds.js",
  "src/sogotable/static/games/game-list-view.js",
  "src/sogotable/static/games/render-keys.js",
  "src/sogotable/static/games/room-render-dispatch.js",
  "src/sogotable/static/games/lobby.js",
  "src/sogotable/static/games/README.md",
  "src/sogotable/static/games/battleship/client.js",
  "src/sogotable/static/games/battleship/fleet-geometry.js",
  "src/sogotable/static/games/battleship/styles.js",
  "src/sogotable/static/games/battleship/phrases.js",
  "src/sogotable/static/games/battleship/assets.js",
  "src/sogotable/static/games/battleship/ship-art.js",
  "src/sogotable/static/games/battleship/fx.js",
  "src/sogotable/static/games/battleship/sfx.js",
  "src/sogotable/static/games/battleship/settings.js",
  "src/sogotable/static/games/battleship/index.js",
  "src/sogotable/static/games/battleship/manifest.js",
  "src/sogotable/static/games/battleship/PLAN.md",
  "src/sogotable/static/games/battleship/README.md",
  "src/sogotable/static/games/boxes/app.js",
  "src/sogotable/static/games/chess-tutor/board.js",
  "src/sogotable/static/games/chess-tutor/README.md",
  "src/sogotable/static/games/chess-tutor/course.js",
  "src/sogotable/static/games/chess-tutor/drill-view.js",
  "src/sogotable/static/games/chess-tutor/index.js",
  "src/sogotable/static/games/chess-tutor/openings.js",
  "src/sogotable/static/games/chess-tutor/progress.js",
  "src/sogotable/static/games/chess-tutor/render.js",
  "src/sogotable/static/games/chess-tutor/rules.js",
  "src/sogotable/static/games/chess-tutor/scheduler.js",
  "src/sogotable/static/games/chess-tutor/session.js",
  "src/sogotable/static/games/chess-tutor/styles.js",
  "src/sogotable/static/games/chess-tutor/watch-view.js",
  "src/sogotable/static/vendor/chessjs/LICENSE",
  "src/sogotable/static/vendor/chessjs/chess.js",
  "src/sogotable/static/vendor/cm-chessboard/LICENSE",
  "src/sogotable/static/vendor/cm-chessboard/assets/chessboard.css",
  "src/sogotable/static/vendor/cm-chessboard/assets/extensions/arrows/arrows.css",
  "src/sogotable/static/vendor/cm-chessboard/assets/extensions/arrows/arrows.svg",
  "src/sogotable/static/vendor/cm-chessboard/assets/extensions/markers/markers.css",
  "src/sogotable/static/vendor/cm-chessboard/assets/extensions/markers/markers.svg",
  "src/sogotable/static/vendor/cm-chessboard/assets/pieces/standard.svg",
  "src/sogotable/static/vendor/cm-chessboard/src/Chessboard.js",
  "src/sogotable/static/vendor/cm-chessboard/src/extensions/arrows/Arrows.js",
  "src/sogotable/static/vendor/cm-chessboard/src/extensions/markers/Markers.js",
  "src/sogotable/static/vendor/cm-chessboard/src/lib/Svg.js",
  "src/sogotable/static/vendor/cm-chessboard/src/lib/Utils.js",
  "src/sogotable/static/vendor/cm-chessboard/src/model/ChessboardState.js",
  "src/sogotable/static/vendor/cm-chessboard/src/model/Extension.js",
  "src/sogotable/static/vendor/cm-chessboard/src/model/Position.js",
  "src/sogotable/static/vendor/cm-chessboard/src/view/ChessboardView.js",
  "src/sogotable/static/vendor/cm-chessboard/src/view/PositionAnimationsQueue.js",
  "src/sogotable/static/vendor/cm-chessboard/src/view/VisualMoveInput.js",
  "src/sogotable/static/games/boxes/client.js",
  "src/sogotable/static/games/boxes/index.html",
  "src/sogotable/static/games/boxes/index.js",
  "src/sogotable/static/games/boxes/manifest.js",
  "src/sogotable/static/games/boxes/README.md",
  "src/sogotable/static/games/boxes/render.js",
  "src/sogotable/static/games/boxes/rules.js",
  "src/sogotable/static/games/boxes/state.js",
  "src/sogotable/static/games/boxes/styles.css",
  "src/sogotable/static/games/quoridor/index.js",
  "src/sogotable/static/games/quoridor/manifest.js",
  "src/sogotable/static/games/quoridor/PLAN.md",
  "src/sogotable/static/games/quoridor/quoridor_ai_rules_four_difficulties.md",
  "src/sogotable/static/games/quoridor/README.md",
  "src/sogotable/static/games/quoridor/client.js",
  "src/sogotable/static/games/super-tic-tac-toe/index.js",
  "src/sogotable/static/games/super-tic-tac-toe/manifest.js",
  "src/sogotable/static/games/super-tic-tac-toe/README.md",
  "src/sogotable/static/games/super-tic-tac-toe/render.js",
  "src/sogotable/static/games/super-tic-tactical-toe/index.js",
  "src/sogotable/static/games/super-tic-tactical-toe/manifest.js",
  "src/sogotable/static/games/super-tic-tactical-toe/README.md",
  "src/sogotable/static/games/super-tic-tactical-toe/render.js",
  "src/sogotable/static/games/ten-thousand/10000_complete_scoring_set.md",
  "src/sogotable/static/games/ten-thousand/farkle-ack.js",
  "src/sogotable/static/games/ten-thousand/render.js",
  "src/sogotable/static/games/ten-thousand/SCORING.md",
  "src/sogotable/static/games/yahtzee/rules.js",
  "src/sogotable/static/games/yahtzee/render.js",
  "src/sogotable/static/games/yahtzee/manifest.js",
  "src/sogotable/static/games/mazewright/rules.js",
  "src/sogotable/static/games/mazewright/render.js",
  "src/sogotable/static/games/mazewright/styles.js",
  "src/sogotable/static/games/mazewright/manifest.js",
  "docs/adding-a-game.md",
  "docs/ai-difficulty.md",
  "docs/api-contract.md",
  "docs/architecture.md",
  "docs/architecture-debt.md",
  "docs/AREC.md",
  "docs/audio.md",
  "docs/bots.md",
  "docs/bots/behavior.md",
  "docs/bots/farkle_ai_players_4_levels.md",
  "docs/bots/index.md",
  "docs/cloudflare-quota.md",
  "docs/doctrine.md",
  "docs/game-battleship.md",
  "docs/game-dots-and-boxes.md",
  "docs/game-integration-spec.md",
  "docs/game-quoridor.md",
  "docs/game-rtta.md",
  "docs/game-super-tic-tac-toe.md",
  "docs/game-super-tic-tactical-toe.md",
  "docs/game-ten-thousand.md",
  "docs/game-yahtzee.md",
  "docs/game-mazewright.md",
  "docs/game-liars-dice.md",
  "docs/game-no-thanks.md",
  "docs/game-hearts.md",
  "docs/game-zombie-dice.md",
  "docs/live-rounds.md",
  "docs/modularity.md",
  "docs/module-ownership.md",
  "docs/name-decision.md",
  "docs/nomenclature.md",
  "docs/project-memory.md",
  "docs/purpose.md",
  "docs/roadmap.md",
  "docs/state-machine.md",
  "docs/state-partition-plan.md",
  "docs/wu-wei-event-driven-progress.md",
  "docs/wu-wei-method.md",
];
const CRC32_TABLE = makeCrc32Table();

// Fetch the allowlisted files and build the ZIP, then trigger a download.
// `revisionText` is the app's revision summary, included in the export readme.
export async function downloadReviewZip(revisionText) {
  const entries = await reviewExportEntries(revisionText);
  const zipBlob = createStoredZip(entries);
  const today = new Date().toISOString().slice(0, 10);
  downloadBlob(zipBlob, `sogotable-review-${today}.zip`);
}

async function reviewExportEntries(revisionText) {
  const entries = [{
    name: "sogotable-review/REVIEW_EXPORT.md",
    bytes: encodeText(reviewExportReadme(revisionText)),
  }];
  for (const path of REVIEW_EXPORT_FILES) {
    const response = await fetch(`${REVIEW_EXPORT_REPO_RAW_BASE}${encodeURI(path)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not export ${path}.`);
    entries.push({
      name: `sogotable-review/${path}`,
      bytes: new Uint8Array(await response.arrayBuffer()),
    });
  }
  return entries;
}

function reviewExportReadme(revisionText) {
  return [
    "# SogoTable Review Export",
    "",
    `Exported: ${new Date().toISOString()}`,
    `App revision label: ${revisionText || "revision unavailable"}`,
    "",
    "This ZIP is a Sogo superuser source-review export generated from an explicit allowlist.",
    "",
    "Included:",
    "- Public source code for the browser app and Worker brain.",
    "- Worker tests, scripts, README, and durable project docs.",
    "",
    "Excluded:",
    "- Cloudflare secrets and environment values.",
    "- D1 data, runtime state, player data, room data, logs, caches, .wrangler, node_modules, AI intake files, and generated revision artifacts.",
    "- Binary app icons and intro artwork unless they are needed for source review.",
    "",
    "The source files are fetched from the public GitHub main branch at export time.",
    "",
  ].join("\n");
}

function createStoredZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encodeText(entry.name);
    const bytes = entry.bytes;
    const crc = crc32(bytes);
    const localHeader = zipLocalHeader(nameBytes, bytes.length, crc);
    chunks.push(localHeader, nameBytes, bytes);
    central.push({ nameBytes, size: bytes.length, crc, offset });
    offset += localHeader.length + nameBytes.length + bytes.length;
  }
  const centralStart = offset;
  for (const entry of central) {
    const header = zipCentralHeader(entry.nameBytes, entry.size, entry.crc, entry.offset);
    chunks.push(header, entry.nameBytes);
    offset += header.length + entry.nameBytes.length;
  }
  chunks.push(zipEndRecord(central.length, offset - centralStart, centralStart));
  return new Blob(chunks, { type: "application/zip" });
}

function zipLocalHeader(nameBytes, size, crc) {
  const header = new Uint8Array(30);
  writeU32(header, 0, 0x04034b50);
  writeU16(header, 4, 20);
  writeU16(header, 8, 0);
  writeU32(header, 10, zipDosTimestamp());
  writeU32(header, 14, crc);
  writeU32(header, 18, size);
  writeU32(header, 22, size);
  writeU16(header, 26, nameBytes.length);
  return header;
}

function zipCentralHeader(nameBytes, size, crc, offset) {
  const header = new Uint8Array(46);
  writeU32(header, 0, 0x02014b50);
  writeU16(header, 4, 20);
  writeU16(header, 6, 20);
  writeU16(header, 10, 0);
  writeU32(header, 12, zipDosTimestamp());
  writeU32(header, 16, crc);
  writeU32(header, 20, size);
  writeU32(header, 24, size);
  writeU16(header, 28, nameBytes.length);
  writeU32(header, 42, offset);
  return header;
}

function zipEndRecord(count, centralSize, centralStart) {
  const header = new Uint8Array(22);
  writeU32(header, 0, 0x06054b50);
  writeU16(header, 8, count);
  writeU16(header, 10, count);
  writeU32(header, 12, centralSize);
  writeU32(header, 16, centralStart);
  return header;
}

function zipDosTimestamp(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return ((dosDate << 16) | time) >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

function writeU16(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function encodeText(text) {
  return new TextEncoder().encode(text);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
