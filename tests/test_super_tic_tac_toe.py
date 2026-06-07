import pytest

from src.sogotable.super_tic_tac_toe import InvalidMove, SuperTicTacToeState, new_game


def test_initial_empty_game():
    game = new_game()

    assert game.status == "playing"
    assert game.current_player == "X"
    assert game.next_board is None
    assert game.legal_boards() == list(range(9))
    assert all(cell is None for board in game.boards for cell in board)


def test_valid_move_sets_cell_and_redirects_next_player():
    game = new_game()

    game.make_move(0, 2)

    assert game.boards[0][2] == "X"
    assert game.current_player == "O"
    assert game.next_board == 2
    assert game.legal_boards() == [2]


def test_invalid_move_into_wrong_board():
    game = new_game()
    game.make_move(0, 2)

    with pytest.raises(InvalidMove, match="required board"):
        game.make_move(1, 0)


def test_turn_alternation():
    game = new_game()

    game.make_move(0, 1)
    game.make_move(1, 0)

    assert game.boards[0][1] == "X"
    assert game.boards[1][0] == "O"
    assert game.current_player == "X"


def test_free_choice_when_target_board_is_won():
    game = new_game()
    game.small_winners[4] = "X"
    game.make_move(0, 4)

    assert game.next_board is None
    assert 4 not in game.legal_boards()
    assert 1 in game.legal_boards()


def test_free_choice_when_target_board_is_full():
    game = new_game()
    game.boards[3] = ["X", "O", "X", "X", "O", "O", "O", "X", "X"]
    game.small_winners[3] = "D"
    game.make_move(0, 3)

    assert game.next_board is None
    assert 3 not in game.legal_boards()


def test_small_board_win_claims_macro_cell():
    game = new_game()
    game.boards[0] = ["X", "X", None, None, None, None, None, None, None]
    game.current_player = "X"

    game.make_move(0, 2)

    assert game.small_winners[0] == "X"
    assert game.status == "playing"


def test_macro_board_win():
    game = new_game()
    game.small_winners[0] = "X"
    game.small_winners[1] = "X"
    game.boards[2] = ["X", "X", None, None, None, None, None, None, None]
    game.current_player = "X"

    game.make_move(2, 2)

    assert game.status == "x_won"
    assert game.winner == "X"
    assert game.legal_boards() == []


def test_draw_state_when_all_boards_complete_without_macro_winner():
    game = new_game()
    game.small_winners = ["X", "O", "X", "X", "O", "O", "O", "X", None]
    game.boards[8] = ["X", "O", "X", "X", "O", "O", "O", "X", None]
    game.current_player = "X"

    game.make_move(8, 8)

    assert game.small_winners[8] == "D"
    assert game.status == "draw"
    assert game.winner is None


def test_cannot_move_after_game_over():
    game = SuperTicTacToeState(status="x_won", winner="X")

    with pytest.raises(InvalidMove, match="already over"):
        game.make_move(0, 0)


def test_serialization_round_trip():
    game = new_game()
    game.make_move(0, 5)

    restored = SuperTicTacToeState.from_dict(game.to_dict())

    assert restored.to_dict() == game.to_dict()
