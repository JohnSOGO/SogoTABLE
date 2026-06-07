from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Player = Literal["X", "O"]
SmallResult = Literal["X", "O", "D"]
GameStatus = Literal["playing", "x_won", "o_won", "draw"]

BOARD_COUNT = 9
CELL_COUNT = 9
WIN_LINES = (
    (0, 1, 2),
    (3, 4, 5),
    (6, 7, 8),
    (0, 3, 6),
    (1, 4, 7),
    (2, 5, 8),
    (0, 4, 8),
    (2, 4, 6),
)


class InvalidMove(ValueError):
    """Raised when a move violates the Super Tic Tac Toe rules."""


@dataclass
class SuperTicTacToeState:
    boards: list[list[Player | None]] = field(
        default_factory=lambda: [[None for _ in range(CELL_COUNT)] for _ in range(BOARD_COUNT)]
    )
    small_winners: list[SmallResult | None] = field(default_factory=lambda: [None for _ in range(BOARD_COUNT)])
    current_player: Player = "X"
    next_board: int | None = None
    status: GameStatus = "playing"
    winner: Player | None = None
    move_count: int = 0

    @classmethod
    def new(cls) -> SuperTicTacToeState:
        return cls()

    @classmethod
    def from_dict(cls, data: dict) -> SuperTicTacToeState:
        return cls(
            boards=data["boards"],
            small_winners=data["small_winners"],
            current_player=data["current_player"],
            next_board=data.get("next_board"),
            status=data.get("status", "playing"),
            winner=data.get("winner"),
            move_count=data.get("move_count", 0),
        )

    def to_dict(self) -> dict:
        return {
            "boards": self.boards,
            "small_winners": self.small_winners,
            "current_player": self.current_player,
            "next_board": self.next_board,
            "legal_boards": self.legal_boards(),
            "status": self.status,
            "winner": self.winner,
            "move_count": self.move_count,
        }

    def legal_boards(self) -> list[int]:
        if self.status != "playing":
            return []
        if self.next_board is not None and self._board_available(self.next_board):
            return [self.next_board]
        return [index for index in range(BOARD_COUNT) if self._board_available(index)]

    def make_move(self, board_index: int, cell_index: int) -> SuperTicTacToeState:
        self._validate_move(board_index, cell_index)

        player = self.current_player
        self.boards[board_index][cell_index] = player
        self.move_count += 1
        self.small_winners[board_index] = _small_board_result(self.boards[board_index])

        macro_winner = _macro_winner(self.small_winners)
        if macro_winner:
            self.status = "x_won" if macro_winner == "X" else "o_won"
            self.winner = macro_winner
            self.next_board = None
            return self

        if all(result is not None for result in self.small_winners):
            self.status = "draw"
            self.winner = None
            self.next_board = None
            return self

        self.current_player = _other_player(player)
        self.next_board = cell_index if self._board_available(cell_index) else None
        return self

    def _validate_move(self, board_index: int, cell_index: int) -> None:
        if self.status != "playing":
            raise InvalidMove("Game is already over.")
        if board_index not in range(BOARD_COUNT):
            raise InvalidMove("Board index must be 0 through 8.")
        if cell_index not in range(CELL_COUNT):
            raise InvalidMove("Cell index must be 0 through 8.")
        if board_index not in self.legal_boards():
            raise InvalidMove("Move must be played in the required board.")
        if self.boards[board_index][cell_index] is not None:
            raise InvalidMove("Cell is already occupied.")

    def _board_available(self, board_index: int) -> bool:
        return self.small_winners[board_index] is None and any(cell is None for cell in self.boards[board_index])


def new_game() -> SuperTicTacToeState:
    return SuperTicTacToeState.new()


def _small_board_result(board: list[Player | None]) -> SmallResult | None:
    for a, b, c in WIN_LINES:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    if all(cell is not None for cell in board):
        return "D"
    return None


def _macro_winner(small_winners: list[SmallResult | None]) -> Player | None:
    for a, b, c in WIN_LINES:
        if small_winners[a] in ("X", "O") and small_winners[a] == small_winners[b] == small_winners[c]:
            return small_winners[a]
    return None


def _other_player(player: Player) -> Player:
    return "O" if player == "X" else "X"
