from unittest.mock import patch

from graph import nodes


def dish(identifier, name, kind, tags=None):
    return {"id": identifier, "name": name, "type": kind, "tags": tags or []}


def test_fetch_and_filter_groups_all_supported_types():
    dishes = [
        dish(1, "meat", "meat"), dish(2, "veg", "veg", ["清淡"]),
        dish(3, "soup", "soup"), dish(4, "sweet", "dessert"),
        dish(5, "rice", "staple"),
    ]
    with patch.object(nodes.db, "fetch_all_dishes", return_value=dishes):
        fetched = nodes.fetch_dishes({"meal_type": "lunch"})
    assert set(fetched["grouped_dishes"]) == {"meat", "veg", "soup", "dessert", "staple"}

    filtered = nodes.health_filter(fetched)
    assert filtered["grouped_dishes"]["_light_veg"][0]["id"] == 2


def test_fetch_error_is_preserved_in_state():
    with patch.object(nodes.db, "fetch_all_dishes", side_effect=RuntimeError("db down")):
        result = nodes.fetch_dishes({})
    assert result["error"] == "db down"
    assert result["dishes"] == []


def test_rule_fallback_generates_three_complete_plans_with_selected_dish():
    state = {
        "meat_count": 1,
        "veg_count": 1,
        "soup_count": 1,
        "selected_dishes": [dish(99, "selected", "meat")],
        "grouped_dishes": {
            "meat": [dish(i, f"m{i}", "meat") for i in range(1, 5)],
            "veg": [dish(i + 10, f"v{i}", "veg") for i in range(1, 5)],
            "soup": [dish(i + 20, f"s{i}", "soup") for i in range(1, 5)],
            "_light_veg": [],
        },
    }
    plans = nodes._rule_based_fallback(state)
    assert len(plans) == 3
    assert all(len(plan["dishes"]) == 3 for plan in plans)
    assert all(plan["dishes"][0]["name"] == "selected" for plan in plans)


def test_validation_enriches_short_llm_output_with_fallback():
    all_dishes = [
        dish(1, "m", "meat"), dish(2, "v", "veg"), dish(3, "s", "soup")
    ]
    state = {
        "meat_count": 1, "veg_count": 1, "soup_count": 1,
        "dishes": all_dishes,
        "plans": [{"dishes": [dish(1, "m", "meat")]}],
        "grouped_dishes": {
            "meat": [all_dishes[0]], "veg": [all_dishes[1]],
            "soup": [all_dishes[2]], "_light_veg": [],
        },
    }
    result = nodes.validate_plans(state)
    assert len(result["plans"][0]["dishes"]) == 3


def test_user_context_skips_database_for_guest():
    with patch.object(nodes.db, "fetch_recent_dish_names") as fetch:
        assert nodes.fetch_user_context({})["recent_dish_names"] == []
    fetch.assert_not_called()
