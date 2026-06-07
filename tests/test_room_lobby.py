import pytest

from src.sogotable.server import INVITES, LOBBY_VIEWERS, ROOMS, Invite, Room, _activate_room_if_ready, _active_room_for_host, _active_room_for_player, _add_player_to_room, _close_room, _colors_are_too_similar, _handle_reset_vote, _lobby_viewers, _refresh_active_room_player, _room_status


@pytest.fixture(autouse=True)
def clear_rooms():
    ROOMS.clear()
    INVITES.clear()
    LOBBY_VIEWERS.clear()
    yield
    ROOMS.clear()
    INVITES.clear()
    LOBBY_VIEWERS.clear()


def player(player_id: str, name: str = "Player", color: str = "#1f7a5f") -> dict:
    return {
        "id": player_id,
        "name": name,
        "icon": "P",
        "color": color,
    }


def test_can_choose_o_as_first_room_mark():
    room = Room(code="TEST", host_id="one")

    _add_player_to_room(room, player("one"), "O")

    assert room.players[0].mark == "O"


def test_cannot_take_occupied_mark():
    room = Room(code="TEST", host_id="one")
    _add_player_to_room(room, player("one"), "X")

    with pytest.raises(ValueError, match="X is already taken"):
        _add_player_to_room(room, player("two"), "X")


def test_rejoining_player_can_change_to_open_mark():
    room = Room(code="TEST", host_id="one")
    _add_player_to_room(room, player("one"), "X")

    _add_player_to_room(room, player("one"), "O")

    assert len(room.players) == 1
    assert room.players[0].mark == "O"


def test_second_player_gets_remaining_mark_automatically():
    room = Room(code="TEST", host_id="one")
    _add_player_to_room(room, player("one"), "O")

    _add_player_to_room(room, player("two"), None)

    assert room.players[1].mark == "X"


def test_second_player_gets_room_safe_color_when_color_matches_host():
    room = Room(code="TEST", host_id="one")
    guest = player("two", color="#1f7a5f")

    _add_player_to_room(room, player("one", color="#1f7a5f"), None)
    _add_player_to_room(room, guest, None)

    assert room.players[0].color == "#1f7a5f"
    assert room.players[1].color != "#1f7a5f"
    assert not _colors_are_too_similar(room.players[0].color, room.players[1].color)
    assert guest["color"] == "#1f7a5f"


def test_second_player_gets_room_safe_color_when_color_is_near_host():
    room = Room(code="TEST", host_id="one")

    _add_player_to_room(room, player("one", color="#1f7a5f"), None)
    _add_player_to_room(room, player("two", color="#207b60"), None)

    assert not _colors_are_too_similar(room.players[0].color, room.players[1].color)


def test_active_room_player_refresh_preserves_safe_guest_seat_color():
    room = Room(code="TEST", host_id="one")
    _add_player_to_room(room, player("one", color="#1f7a5f"), None)
    _add_player_to_room(room, player("two", color="#dc2626"), None)
    ROOMS[room.code] = room

    _refresh_active_room_player(player("two", color="#207b60"))

    assert room.players[0].color == "#1f7a5f"
    assert room.players[1].color != "#207b60"
    assert not _colors_are_too_similar(room.players[0].color, room.players[1].color)


def test_host_waits_without_mark_until_opponent_joins():
    room = Room(code="TEST", host_id="one")

    _add_player_to_room(room, player("one"), None)

    assert room.players[0].mark == ""
    assert room.started is False
    assert _room_status(room) == "waiting_for_player"


def test_room_activates_and_assigns_marks_when_second_player_joins():
    room = Room(code="TEST", host_id="one")
    _add_player_to_room(room, player("one"), None)
    _add_player_to_room(room, player("two"), None)

    _activate_room_if_ready(room)

    assert room.started is True
    assert _room_status(room) == "active"
    assert {seat.mark for seat in room.players} == {"X", "O"}


def test_active_room_for_host_reuses_unfinished_room():
    room = Room(code="TEST", host_id="one", game_id="super_tic_tac_toe")
    ROOMS[room.code] = room

    assert _active_room_for_host("one", "super_tic_tac_toe") is room


def test_active_room_for_player_finds_participant_room():
    room = Room(code="TEST", host_id="one", game_id="super_tic_tac_toe")
    _add_player_to_room(room, player("one"), None)
    _add_player_to_room(room, player("two"), None)
    _activate_room_if_ready(room)
    ROOMS[room.code] = room

    assert _active_room_for_player("two", "super_tic_tac_toe") is room


def test_active_room_for_host_ignores_completed_room():
    room = Room(code="TEST", host_id="one", game_id="super_tic_tac_toe")
    room.game.status = "draw"
    ROOMS[room.code] = room

    assert _active_room_for_host("one", "super_tic_tac_toe") is None


def test_active_room_for_player_ignores_completed_room():
    room = Room(code="TEST", host_id="one", game_id="super_tic_tac_toe")
    _add_player_to_room(room, player("one"), None)
    _add_player_to_room(room, player("two"), None)
    _activate_room_if_ready(room)
    room.game.status = "draw"
    ROOMS[room.code] = room

    assert _active_room_for_player("two", "super_tic_tac_toe") is None


def test_invite_serializes_target_name_for_host_status_feedback():
    invite = Invite(
        id="TEST:two",
        room_code="TEST",
        game_id="super_tic_tac_toe",
        host_id="one",
        host_name="One",
        target_id="two",
        target_name="Two",
    )

    assert invite.to_dict()["target_name"] == "Two"


def test_room_serializes_latest_declined_invite_for_host_feedback():
    room = Room(code="TEST", host_id="one", game_id="super_tic_tac_toe")
    _add_player_to_room(room, player("one"), None)
    INVITES["TEST:two"] = Invite(
        id="TEST:two",
        room_code="TEST",
        game_id="super_tic_tac_toe",
        host_id="one",
        host_name="One",
        target_id="two",
        target_name="Two",
        status="declined",
    )

    assert room.to_dict()["latest_invite"]["status"] == "declined"
    assert room.to_dict()["latest_invite"]["target_name"] == "Two"


def test_reset_waits_for_both_players_to_agree():
    room = Room(code="TEST", host_id="one", game_id="super_tic_tac_toe")
    _add_player_to_room(room, player("one"), None)
    _add_player_to_room(room, player("two"), None)
    _activate_room_if_ready(room)

    assert _handle_reset_vote(room, "one", True) == "pending"
    assert room.to_dict()["reset_request"]["requester_name"] == "Player"


def test_reset_runs_after_second_player_agrees():
    room = Room(code="TEST", host_id="one", game_id="super_tic_tac_toe")
    _add_player_to_room(room, player("one"), None)
    _add_player_to_room(room, player("two"), None)
    _activate_room_if_ready(room)
    room.game.make_move(0, 0)

    assert _handle_reset_vote(room, "one", True) == "pending"
    assert _handle_reset_vote(room, "two", True) is None
    assert room.reset_votes == set()
    assert room.game.move_count == 0


def test_reset_decline_clears_pending_request():
    room = Room(code="TEST", host_id="one", game_id="super_tic_tac_toe")
    _add_player_to_room(room, player("one"), None)
    _add_player_to_room(room, player("two"), None)
    _activate_room_if_ready(room)

    assert _handle_reset_vote(room, "one", True) == "pending"
    assert _handle_reset_vote(room, "two", False) == "declined"
    assert room.reset_votes == set()
    assert room.to_dict()["reset_request"] is None


def test_close_room_deletes_room_and_prevents_reentry():
    room = Room(code="TEST", host_id="one", game_id="super_tic_tac_toe")
    _add_player_to_room(room, player("one"), None)
    ROOMS[room.code] = room

    _close_room("TEST")

    assert "TEST" not in ROOMS
    assert _active_room_for_player("one", "super_tic_tac_toe") is None


def test_room_serializes_local_mode():
    room = Room(code="TEST", host_id="one", game_id="super_tic_tac_toe", local_mode=True)

    assert room.to_dict()["local_mode"] is True


def test_lobby_viewers_filters_by_selected_game_only():
    LOBBY_VIEWERS["one"] = {
        "game_id": "super_tic_tac_toe",
        "player": player("one", "One"),
        "updated_at": 999999999,
    }
    LOBBY_VIEWERS["two"] = {
        "game_id": "other_game",
        "player": player("two", "Two"),
        "updated_at": 999999999,
    }

    assert [viewer["id"] for viewer in _lobby_viewers("super_tic_tac_toe")] == ["one"]
