from __future__ import annotations

from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import random
import string
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from src.sogogames.super_tic_tac_toe import InvalidMove, SuperTicTacToeState

HOST = "0.0.0.0"
PORT = 8787
STATIC_DIR = Path(__file__).with_name("static")


@dataclass
class PlayerSeat:
    id: str
    name: str
    icon: str
    color: str
    mark: str


@dataclass
class Room:
    code: str
    game: SuperTicTacToeState = field(default_factory=SuperTicTacToeState.new)
    players: list[PlayerSeat] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "players": [player.__dict__ for player in self.players],
            "game": self.game.to_dict(),
        }

    def player_mark(self, player_id: str) -> str | None:
        for player in self.players:
            if player.id == player_id:
                return player.mark
        return None


ROOMS: dict[str, Room] = {}


class SogoGamesHandler(SimpleHTTPRequestHandler):
    server_version = "SogoGames/0.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/room":
            query = parse_qs(parsed.query)
            code = query.get("code", [""])[0].upper()
            room = ROOMS.get(code)
            if not room:
                self._json({"ok": False, "error": "Room not found."}, HTTPStatus.NOT_FOUND)
                return
            self._json({"ok": True, "room": room.to_dict()})
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/room/create":
                self._create_room()
            elif parsed.path == "/api/room/join":
                self._join_room()
            elif parsed.path == "/api/room/move":
                self._move()
            elif parsed.path == "/api/room/reset":
                self._reset_room()
            else:
                self._json({"ok": False, "error": "Unknown endpoint."}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self._json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}")

    def _create_room(self) -> None:
        payload = self._read_json()
        room = Room(code=_new_room_code())
        _add_player_to_room(room, _player_from_payload(payload))
        ROOMS[room.code] = room
        self._json({"ok": True, "room": room.to_dict()})

    def _join_room(self) -> None:
        payload = self._read_json()
        code = str(payload.get("code", "")).strip().upper()
        if not code:
            raise ValueError("Room code is required.")
        room = ROOMS.get(code)
        if not room:
            raise ValueError("Room not found.")
        _add_player_to_room(room, _player_from_payload(payload))
        self._json({"ok": True, "room": room.to_dict()})

    def _move(self) -> None:
        payload = self._read_json()
        room = ROOMS.get(str(payload.get("code", "")).strip().upper())
        if not room:
            raise ValueError("Room not found.")
        mark = room.player_mark(str(payload.get("player_id", "")))
        if mark is None:
            raise ValueError("Player is not in this room.")
        if mark != room.game.current_player:
            raise ValueError(f"It is {room.game.current_player}'s turn.")
        try:
            room.game.make_move(int(payload["board"]), int(payload["cell"]))
        except (KeyError, TypeError):
            raise ValueError("Board and cell are required.") from None
        except InvalidMove as exc:
            raise ValueError(str(exc)) from None
        self._json({"ok": True, "room": room.to_dict()})

    def _reset_room(self) -> None:
        payload = self._read_json()
        room = ROOMS.get(str(payload.get("code", "")).strip().upper())
        if not room:
            raise ValueError("Room not found.")
        room.game = SuperTicTacToeState.new()
        self._json({"ok": True, "room": room.to_dict()})

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _new_room_code() -> str:
    while True:
        code = "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        if code not in ROOMS:
            return code


def _player_from_payload(payload: dict) -> dict:
    player = payload.get("player") or payload
    player_id = str(player.get("id", "")).strip()
    name = str(player.get("name", "")).strip()
    if not player_id or not name:
        raise ValueError("Player id and name are required.")
    return {
        "id": player_id,
        "name": name[:24],
        "icon": str(player.get("icon", "🙂"))[:4],
        "color": str(player.get("color", "#2f80ed"))[:24],
    }


def _add_player_to_room(room: Room, player: dict) -> None:
    for existing in room.players:
        if existing.id == player["id"]:
            return
    if len(room.players) >= 2:
        raise ValueError("Room already has two players.")
    mark = "X" if len(room.players) == 0 else "O"
    room.players.append(PlayerSeat(mark=mark, **player))


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), SogoGamesHandler)
    print(f"SogoGAMES running at http://127.0.0.1:{PORT}/")
    print("Use your LAN IP with port 8787 for phone testing on the same network.")
    server.serve_forever()


if __name__ == "__main__":
    main()
