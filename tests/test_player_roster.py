from src.sogogames import server


def test_player_roster_persists_to_json(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "DATA_DIR", tmp_path)
    monkeypatch.setattr(server, "PLAYERS_FILE", tmp_path / "players.json")

    player = {
        "id": "player-1",
        "name": "Sogo",
        "icon": "🙂",
        "color": "#1f7a5f",
    }

    saved = server._upsert_player(player)
    loaded = server._load_players()

    assert saved == [player]
    assert loaded == [player]


def test_player_roster_delete_removes_future_selection(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "DATA_DIR", tmp_path)
    monkeypatch.setattr(server, "PLAYERS_FILE", tmp_path / "players.json")

    server._upsert_player({"id": "one", "name": "One", "icon": "1", "color": "#111111"})
    server._upsert_player({"id": "two", "name": "Two", "icon": "2", "color": "#222222"})

    remaining = server._delete_player("one")

    assert [player["id"] for player in remaining] == ["two"]
    assert [player["id"] for player in server._load_players()] == ["two"]
