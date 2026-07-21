// Render-cache key for a room snapshot. renderGame() skips re-rendering when this
// key is unchanged, so it must include every field any game's UI depends on.
// Kept out of the app shell and grouped by game so the next game's fields go in
// one obvious place. (Phase 2 goal: each game module owns its own slice.)
//
// `gameId` is the already-canonicalised opaque game id (the caller resolves
// aliases against the runtime games list).
export function buildRoomRenderKey(room, gameId) {
  if (!room) return "";
  return JSON.stringify({
    code: room.code,
    revision: room.revision,
    game_epoch: room.game_epoch,
    started: room.started,
    status: room.status,
    local_mode: room.local_mode,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      icon: player.icon,
      color: player.color,
      mark: player.mark,
    })),
    game: {
      game_id: gameId,
      // shared across games
      current_player: room.game.current_player,
      status: room.game.status,
      winner: room.game.winner,
      move_count: room.game.move_count,
      last_move: room.game.last_move,
      // super tic tac toe / tactical
      boards: room.game.boards,
      small_winners: room.game.small_winners,
      next_board: room.game.next_board,
      line_winner: room.game.line_winner,
      legal_boards: room.game.legal_boards,
      events: room.game.events,
      pickups: room.game.pickups,
      last_event: room.game.last_event,
      // dots and boxes
      lines: room.game.lines,
      boxes: room.game.boxes,
      scores: room.game.scores,
      legal_lines: room.game.legal_lines,
      // battleship
      phase: room.game.phase,
      board_size: room.game.board_size,
      fleet: room.game.fleet,
      players_state: room.game.players,
      // quoridor
      pawns: room.game.pawns,
      walls_remaining: room.game.walls_remaining,
      walls: room.game.walls,
      legal_pawn_moves: room.game.legal_pawn_moves,
      legal_walls: room.game.legal_walls,
      // 10,000
      score: room.game.score,
      turn_score: room.game.turn_score,
      farkles: room.game.farkles,
      dice: room.game.dice,
      roll_count: room.game.roll_count,
      scoring_options: room.game.scoring_options,
      can_roll: room.game.can_roll,
      can_reroll: room.game.can_reroll,
      can_bank: room.game.can_bank,
      // 10,000 seat data (phase/score/turn_score/…) rides in `players_state`
      // above (room.game.players), which already invalidates the cache per seat.
      // zombie dice (Roll of the Dead) — game-level fields; seat data rides in
      // `players_state` like 10,000's.
      round: room.game.round,
      round_pending_advance: room.game.round_pending_advance,
      tiebreaker: room.game.tiebreaker,
      active_marks: room.game.active_marks,
      target_brains: room.game.target_brains,
      lives: room.game.lives,
      // liar's dice — seat data (dice/dice_count/eliminated) rides in
      // `players_state`; the sanitizer masks other cups before this key builds.
      current_bid: room.game.current_bid,
      last_reveal: room.game.last_reveal,
      total_dice: room.game.total_dice,
      raise_options: room.game.raise_options,
      // hearts — hands/pass flags ride in `players_state`; the sanitizer masks
      // other hands (and off-turn legal_plays) before this key builds.
      options: room.game.options,
      pass_direction: room.game.pass_direction,
      trick: room.game.trick,
      last_trick: room.game.last_trick,
      hearts_broken: room.game.hearts_broken,
      first_trick: room.game.first_trick,
      legal_plays: room.game.legal_plays,
      round_results: room.game.round_results,
      // well, now you know — seat data (hands/rate keys/dump_used) rides in
      // `players_state`; the sanitizer masks other hands, pre-cursor
      // submissions, and the unreleased prompt before this key builds.
      // `options`/`phase`/`round`/`scores` are shared above.
      black_card: room.game.black_card,
      submissions: room.game.submissions,
      reveal_cursor: room.game.reveal_cursor,
      released_at: room.game.released_at,
      final_pick: room.game.final_pick,
      round_result: room.game.round_result,
      most_liked: room.game.most_liked,
      skip_votes: room.game.skip_votes,
      phase_started_at: room.game.phase_started_at,
      black_swaps: room.game.black_swaps,
      draw_count: room.game.draw_count,
    },
    latest_invite: room.latest_invite ? {
      id: room.latest_invite.id,
      status: room.latest_invite.status,
      target_name: room.latest_invite.target_name,
    } : null,
    reset_request: room.reset_request,
  });
}
