from __future__ import annotations

from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import random
import string
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from src.sogogames.super_tic_tac_toe import InvalidMove, SuperTicTacToeState

HOST = "0.0.0.0"
PORT = 8787
STATIC_DIR = Path(__file__).with_name("static")
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
PLAYERS_FILE = DATA_DIR / "players.json"
PLAYER_LOCK = threading.RLock()
ROOM_SEAT_COLORS = [
    "#1f7a5f",
    "#1e63d6",
    "#c43d5d",
    "#8a4bd1",
    "#b7791f",
    "#0f766e",
    "#dc2626",
    "#2563eb",
    "#7c3aed",
    "#db2777",
    "#ca8a04",
    "#16a34a",
    "#0891b2",
    "#4f46e5",
    "#be123c",
    "#334155",
]
COLOR_SIMILARITY_THRESHOLD = 110


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
    host_id: str
    game_id: str = "super_tic_tac_toe"
    started: bool = False
    local_mode: bool = False
    game: SuperTicTacToeState = field(default_factory=SuperTicTacToeState.new)
    players: list[PlayerSeat] = field(default_factory=list)
    reset_votes: set[str] = field(default_factory=set)

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "host_id": self.host_id,
            "game_id": self.game_id,
            "started": self.started,
            "local_mode": self.local_mode,
            "status": _room_status(self),
            "players": [player.__dict__ for player in self.players],
            "game": self.game.to_dict(),
            "latest_invite": _latest_invite_for_room(self),
            "reset_request": _reset_request_for_room(self),
        }

    def player_mark(self, player_id: str) -> str | None:
        for player in self.players:
            if player.id == player_id:
                return player.mark
        return None


@dataclass
class Invite:
    id: str
    room_code: str
    game_id: str
    host_id: str
    host_name: str
    target_id: str
    target_name: str
    status: str = "pending"

    def to_dict(self) -> dict:
        return self.__dict__.copy()


ROOMS: dict[str, Room] = {}
INVITES: dict[str, Invite] = {}
LOBBY_VIEWERS: dict[str, dict] = {}
LOBBY_VIEWER_TTL_SECONDS = 10


class SogoGamesHandler(SimpleHTTPRequestHandler):
    server_version = "SogoGames/0.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/players":
            self._json({"ok": True, "players": _load_players()})
            return
        if parsed.path == "/api/rooms":
            query = parse_qs(parsed.query)
            player_id = query.get("player_id", [""])[0]
            game_id = query.get("game_id", [""])[0]
            if player_id and game_id:
                active_room = _active_room_for_player(player_id, game_id)
                self._json({"ok": True, "active_room": active_room.to_dict() if active_room else None})
                return
            statuses = {"waiting_for_player", "active"}
            rooms = []
            for room in ROOMS.values():
                status = _room_status(room)
                if status not in statuses:
                    continue
                if game_id and room.game_id != game_id:
                    continue
                rooms.append(_room_summary(room))
            self._json({"ok": True, "rooms": rooms})
            return
        if parsed.path == "/api/room":
            query = parse_qs(parsed.query)
            code = query.get("code", [""])[0].upper()
            room = ROOMS.get(code)
            if not room:
                self._json({"ok": False, "error": "Room not found."}, HTTPStatus.NOT_FOUND)
                return
            self._json({"ok": True, "room": room.to_dict()})
            return
        if parsed.path == "/api/invites":
            query = parse_qs(parsed.query)
            player_id = query.get("player_id", [""])[0]
            host_id = query.get("host_id", [""])[0]
            room_code = query.get("room_code", [""])[0].upper()
            if host_id:
                invites = [
                    invite.to_dict()
                    for invite in INVITES.values()
                    if invite.host_id == host_id and (not room_code or invite.room_code == room_code)
                ]
            else:
                invites = [invite.to_dict() for invite in INVITES.values() if invite.target_id == player_id and invite.status == "pending"]
            self._json({"ok": True, "invites": invites})
            return
        if parsed.path == "/api/lobby":
            query = parse_qs(parsed.query)
            game_id = query.get("game_id", [""])[0]
            self._json({"ok": True, "players": _lobby_viewers(game_id)})
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/players/create":
                self._create_player()
            elif parsed.path == "/api/players/delete":
                self._delete_player()
            elif parsed.path == "/api/room/create":
                self._create_room()
            elif parsed.path == "/api/room/join":
                self._join_room()
            elif parsed.path == "/api/room/leave":
                self._leave_room()
            elif parsed.path == "/api/room/close":
                self._close_room()
            elif parsed.path == "/api/room/move":
                self._move()
            elif parsed.path == "/api/room/reset":
                self._reset_room()
            elif parsed.path == "/api/invite/create":
                self._create_invite()
            elif parsed.path == "/api/invite/respond":
                self._respond_to_invite()
            elif parsed.path == "/api/lobby/presence":
                self._update_lobby_presence()
            else:
                self._json({"ok": False, "error": "Unknown endpoint."}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self._json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/players":
                query = parse_qs(parsed.query)
                player_id = query.get("id", [""])[0]
                players = _delete_player(player_id)
                self._json({"ok": True, "players": players})
            else:
                self._json({"ok": False, "error": "Unknown endpoint."}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self._json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}")

    def _create_player(self) -> None:
        player = _player_from_payload(self._read_json())
        players = _upsert_player(player)
        self._json({"ok": True, "player": player, "players": players})

    def _delete_player(self) -> None:
        payload = self._read_json()
        players = _delete_player(str(payload.get("id", "")))
        self._json({"ok": True, "players": players})

    def _create_room(self) -> None:
        payload = self._read_json()
        game_id = str(payload.get("game_id", "super_tic_tac_toe")).strip() or "super_tic_tac_toe"
        if game_id != "super_tic_tac_toe":
            raise ValueError("Game is not available yet.")
        player = _player_from_payload(payload)
        existing = _active_room_for_player(player["id"], game_id)
        if existing:
            self._json({"ok": True, "room": existing.to_dict(), "existing": True})
            return
        code = _room_code_from_payload(payload) or _new_room_code()
        if code in ROOMS:
            raise ValueError("Room code is already in use.")
        room = Room(code=code, host_id=player["id"], game_id=game_id)
        _add_player_to_room(room, player, None)
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
        if bool(payload.get("local")):
            room.local_mode = True
        _add_player_to_room(room, _player_from_payload(payload), None)
        _activate_room_if_ready(room)
        self._json({"ok": True, "room": room.to_dict()})

    def _leave_room(self) -> None:
        payload = self._read_json()
        room = ROOMS.get(str(payload.get("code", "")).strip().upper())
        if not room:
            raise ValueError("Room not found.")
        player_id = str(payload.get("player_id", "")).strip()
        if not player_id:
            raise ValueError("Player id is required.")
        requester_id = str(payload.get("requester_id", "")).strip()
        if requester_id != player_id:
            raise ValueError("Only the seated player can leave their room seat.")
        _close_room(room.code)
        self._json({"ok": True, "closed": True})

    def _close_room(self) -> None:
        payload = self._read_json()
        code = str(payload.get("code", "")).strip().upper()
        requester_id = str(payload.get("requester_id", "")).strip()
        if not code:
            raise ValueError("Room code is required.")
        room = ROOMS.get(code)
        if not room:
            self._json({"ok": True, "closed": True})
            return
        if requester_id and not any(player.id == requester_id for player in room.players):
            raise ValueError("Only a seated player can close the game.")
        _close_room(code)
        self._json({"ok": True, "closed": True})

    def _move(self) -> None:
        payload = self._read_json()
        room = ROOMS.get(str(payload.get("code", "")).strip().upper())
        if not room:
            raise ValueError("Room not found.")
        if not room.started:
            raise ValueError("Room is waiting for another player.")
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
        requester_id = str(payload.get("requester_id", "")).strip()
        if requester_id and not any(player.id == requester_id for player in room.players):
            raise ValueError("Only a seated player can reset the game.")
        if not requester_id:
            raise ValueError("Requester id is required.")
        reset_status = _handle_reset_vote(room, requester_id, payload.get("approve") is not False)
        payload = {"ok": True, "room": room.to_dict()}
        if reset_status:
            payload["reset"] = reset_status
        self._json(payload)

    def _create_invite(self) -> None:
        payload = self._read_json()
        room = ROOMS.get(str(payload.get("code", "")).strip().upper())
        if not room:
            raise ValueError("Room not found.")
        host_id = str(payload.get("host_id", "")).strip()
        if host_id != room.host_id:
            raise ValueError("Only the host can invite a player.")
        if len(room.players) >= 2:
            raise ValueError("Room already has two players.")
        target = _player_from_payload(payload.get("player") or {})
        if target["id"] == host_id:
            raise ValueError("Host is already in the room.")
        invite_id = f"{room.code}:{target['id']}"
        host = next((player for player in room.players if player.id == room.host_id), None)
        INVITES[invite_id] = Invite(
            id=invite_id,
            room_code=room.code,
            game_id=room.game_id,
            host_id=room.host_id,
            host_name=host.name if host else "Host",
            target_id=target["id"],
            target_name=target["name"],
        )
        self._json({"ok": True, "invite": INVITES[invite_id].to_dict()})

    def _respond_to_invite(self) -> None:
        payload = self._read_json()
        invite = INVITES.get(str(payload.get("invite_id", "")).strip())
        if not invite or invite.status != "pending":
            raise ValueError("Invite not found.")
        player = _player_from_payload(payload)
        if player["id"] != invite.target_id:
            raise ValueError("Invite belongs to a different player.")
        accept = bool(payload.get("accept"))
        if not accept:
            invite.status = "declined"
            self._json({"ok": True, "accepted": False})
            return
        room = ROOMS.get(invite.room_code)
        if not room:
            invite.status = "expired"
            raise ValueError("Room not found.")
        _add_player_to_room(room, player, None)
        _activate_room_if_ready(room)
        invite.status = "accepted"
        self._json({"ok": True, "accepted": True, "room": room.to_dict()})

    def _update_lobby_presence(self) -> None:
        payload = self._read_json()
        game_id = str(payload.get("game_id", "super_tic_tac_toe")).strip() or "super_tic_tac_toe"
        if game_id != "super_tic_tac_toe":
            raise ValueError("Game is not available yet.")
        player = _player_from_payload(payload)
        LOBBY_VIEWERS[player["id"]] = {
            "game_id": game_id,
            "player": player,
            "updated_at": time.monotonic(),
        }
        self._json({"ok": True, "players": _lobby_viewers(game_id)})

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


def _room_summary(room: Room) -> dict:
    return {
        "code": room.code,
        "host_id": room.host_id,
        "game_id": room.game_id,
        "started": room.started,
        "local_mode": room.local_mode,
        "status": _room_status(room),
        "players": [player.__dict__ for player in room.players],
        "open_seats": max(0, 2 - len(room.players)),
    }


def _close_room(code: str) -> None:
    ROOMS.pop(str(code).strip().upper(), None)


def _latest_invite_for_room(room: Room) -> dict | None:
    room_invites = [invite for invite in INVITES.values() if invite.room_code == room.code]
    if not room_invites:
        return None
    return room_invites[-1].to_dict()


def _reset_request_for_room(room: Room) -> dict | None:
    if not room.reset_votes:
        return None
    requester_id = next(iter(room.reset_votes))
    requester = next((player for player in room.players if player.id == requester_id), None)
    return {
        "requester_id": requester_id,
        "requester_name": requester.name if requester else "Player",
        "votes": sorted(room.reset_votes),
        "needed": len(room.players),
    }


def _handle_reset_vote(room: Room, requester_id: str, approve: bool) -> str | None:
    if not approve:
        room.reset_votes.clear()
        return "declined"
    room.reset_votes.add(requester_id)
    if len(room.players) > 1 and len(room.reset_votes) < len(room.players):
        return "pending"
    room.reset_votes.clear()
    room.game = SuperTicTacToeState.new()
    return None


def _lobby_viewers(game_id: str) -> list[dict]:
    _prune_lobby_viewers()
    return [
        viewer["player"]
        for viewer in LOBBY_VIEWERS.values()
        if not game_id or viewer["game_id"] == game_id
    ]


def _prune_lobby_viewers() -> None:
    cutoff = time.monotonic() - LOBBY_VIEWER_TTL_SECONDS
    stale_ids = [player_id for player_id, viewer in LOBBY_VIEWERS.items() if viewer["updated_at"] < cutoff]
    for player_id in stale_ids:
        LOBBY_VIEWERS.pop(player_id, None)


def _active_room_for_host(host_id: str, game_id: str) -> Room | None:
    for room in ROOMS.values():
        if room.host_id == host_id and room.game_id == game_id and _room_status(room) in {"waiting_for_player", "active"}:
            return room
    return None


def _active_room_for_player(player_id: str, game_id: str) -> Room | None:
    for room in ROOMS.values():
        if room.game_id != game_id or _room_status(room) not in {"waiting_for_player", "active"}:
            continue
        if any(player.id == player_id for player in room.players):
            return room
    return None


def _room_status(room: Room) -> str:
    if room.game.status in {"x_won", "o_won", "draw"}:
        return "completed"
    if room.started:
        return "active"
    return "waiting_for_player"


def _room_code_from_payload(payload: dict) -> str | None:
    code = str(payload.get("code", "")).strip().upper()
    if not code:
        return None
    if len(code) != 4 or any(character not in string.ascii_uppercase + string.digits for character in code):
        raise ValueError("Room code must be 4 letters or numbers.")
    return code


def _load_players() -> list[dict]:
    with PLAYER_LOCK:
        if not PLAYERS_FILE.exists():
            return []
        try:
            data = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        players = data if isinstance(data, list) else data.get("players", [])
        clean_players = []
        for player in players:
            if not isinstance(player, dict):
                continue
            try:
                clean_players.append(_clean_player(player))
            except ValueError:
                continue
        return clean_players


def _save_players(players: list[dict]) -> None:
    with PLAYER_LOCK:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        PLAYERS_FILE.write_text(json.dumps(players, indent=2), encoding="utf-8")


def _upsert_player(player: dict) -> list[dict]:
    with PLAYER_LOCK:
        players = _load_players()
        for index, existing in enumerate(players):
            if existing["id"] == player["id"]:
                players[index] = player
                _save_players(players)
                _refresh_active_room_player(player)
                return players
        players.append(player)
        players.sort(key=lambda item: item["name"].casefold())
        _save_players(players)
        _refresh_active_room_player(player)
        return players


def _delete_player(player_id: str) -> list[dict]:
    player_id = str(player_id).strip()
    if not player_id:
        raise ValueError("Player id is required.")
    with PLAYER_LOCK:
        players = [player for player in _load_players() if player["id"] != player_id]
        _save_players(players)
        return players


def _refresh_active_room_player(player: dict) -> None:
    for room in ROOMS.values():
        for seated in room.players:
            if seated.id == player["id"]:
                seated.name = player["name"]
                seated.icon = player["icon"]
                seated.color = player["color"]
        _ensure_room_seat_colors(room)


def _clean_player(player: dict) -> dict:
    player_id = str(player.get("id", "")).strip()
    name = str(player.get("name", "")).strip()
    if not player_id or not name:
        raise ValueError("Player id and name are required.")
    return {
        "id": player_id[:80],
        "name": name[:24],
        "icon": str(player.get("icon", "🙂"))[:4],
        "color": str(player.get("color", "#2f80ed"))[:24],
    }


def _player_from_payload(payload: dict) -> dict:
    player = payload.get("player") or payload
    return _clean_player(player)


def _mark_from_payload(payload: dict) -> str | None:
    mark = str(payload.get("mark", "")).strip().upper()
    if not mark:
        return None
    if mark not in ("X", "O"):
        raise ValueError("Mark must be X or O.")
    return mark


def _add_player_to_room(room: Room, player: dict, requested_mark: str | None = None) -> None:
    for existing in room.players:
        if existing.id == player["id"]:
            if requested_mark and existing.mark != requested_mark:
                if any(seated.mark == requested_mark for seated in room.players):
                    raise ValueError(f"{requested_mark} is already taken.")
                existing.mark = requested_mark
            return
    if len(room.players) >= 2:
        raise ValueError("Room already has two players.")
    taken = {seated.mark for seated in room.players if seated.mark}
    if requested_mark:
        if requested_mark in taken:
            raise ValueError(f"{requested_mark} is already taken.")
        mark = requested_mark
    elif not room.players:
        mark = ""
    else:
        mark = "X" if "X" not in taken else "O"
    seated_player = player.copy()
    if room.players:
        seated_player["color"] = _non_conflicting_room_color(seated_player["color"], [seated.color for seated in room.players])
    room.players.append(PlayerSeat(mark=mark, **seated_player))
    _ensure_room_seat_colors(room)


def _ensure_room_seat_colors(room: Room) -> None:
    existing_colors: list[str] = []
    for seated in room.players:
        seated.color = _non_conflicting_room_color(seated.color, existing_colors)
        existing_colors.append(seated.color)


def _non_conflicting_room_color(color: str, existing_colors: list[str]) -> str:
    if not existing_colors:
        return _safe_hex_color(color)
    safe_color = _safe_hex_color(color)
    if all(not _colors_are_too_similar(safe_color, existing) for existing in existing_colors):
        return safe_color
    candidates = [candidate for candidate in ROOM_SEAT_COLORS if candidate.lower() not in {existing.lower() for existing in existing_colors}]
    if not candidates:
        return safe_color
    return max(candidates, key=lambda candidate: min(_color_distance(candidate, existing) for existing in existing_colors))


def _colors_are_too_similar(left: str, right: str) -> bool:
    return _color_distance(left, right) < COLOR_SIMILARITY_THRESHOLD


def _color_distance(left: str, right: str) -> float:
    left_rgb = _hex_to_rgb(_safe_hex_color(left))
    right_rgb = _hex_to_rgb(_safe_hex_color(right))
    return sum((left_channel - right_channel) ** 2 for left_channel, right_channel in zip(left_rgb, right_rgb)) ** 0.5


def _safe_hex_color(color: str) -> str:
    color = str(color or "").strip()
    if len(color) == 7 and color.startswith("#") and all(character in string.hexdigits for character in color[1:]):
        return color.lower()
    return ROOM_SEAT_COLORS[0]


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    safe_color = _safe_hex_color(color).lstrip("#")
    return (
        int(safe_color[0:2], 16),
        int(safe_color[2:4], 16),
        int(safe_color[4:6], 16),
    )


def _activate_room_if_ready(room: Room) -> None:
    if room.started or len(room.players) < 2:
        return
    marks = ["X", "O"]
    random.shuffle(marks)
    for seated, mark in zip(room.players, marks):
        seated.mark = mark
    room.started = True


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), SogoGamesHandler)
    print(f"SogoGAMES running at http://127.0.0.1:{PORT}/")
    print("Use your LAN IP with port 8787 for phone testing on the same network.")
    server.serve_forever()


if __name__ == "__main__":
    main()
