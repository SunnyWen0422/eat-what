from unittest.mock import MagicMock, patch

import db


def test_type_mapping_covers_supported_values_and_unknowns():
    assert db._map_type("meat") == "meat"
    assert db._map_type("荤菜") == "meat"
    assert db._map_type("素菜") == "veg"
    assert db._map_type("汤品") == "soup"
    assert db._map_type("甜品") == "dessert"
    assert db._map_type("主食") == "staple"
    assert db._map_type("unknown") == "veg"
    assert db._map_type("") == "veg"


def test_tag_inference_returns_detected_and_default_tags():
    assert "清淡" in db._infer_tags({"name": "清蒸鱼", "cl": "鱼"})
    assert db._infer_tags({"name": "普通菜", "cl": "土豆"}) == ["家常"]


def test_empty_id_and_user_queries_avoid_database():
    with patch.object(db, "_get_connection") as connect:
        assert db.fetch_dishes_by_ids([]) == []
        assert db.fetch_recent_dish_names(None) == []
    connect.assert_not_called()


def test_recent_dish_names_tolerate_bad_json_and_resolves_valid_ids():
    cursor = MagicMock()
    cursor.__enter__.return_value = cursor
    cursor.fetchall.return_value = [
        {"DISH_IDS": "[1,2]"},
        {"DISH_IDS": "broken"},
        {"DISH_IDS": "[2,3]"},
    ]
    connection = MagicMock()
    connection.cursor.return_value = cursor

    with patch.object(db, "_get_connection", return_value=connection), \
            patch.object(db, "fetch_dishes_by_ids", return_value=[
                {"id": 1, "name": "one"}, {"id": 2, "name": "two"}
            ]) as fetch:
        assert db.fetch_recent_dish_names(7) == ["one", "two"]

    assert set(fetch.call_args.args[0]) == {1, 2, 3}
    connection.close.assert_called_once()


def test_cache_round_trip_and_expiry():
    db._cache.clear()
    db._cache_set("key", [1])
    assert db._cache_get("key") == [1]
    db._cache["key"]["time"] = 0
    assert db._cache_get("key") is None
