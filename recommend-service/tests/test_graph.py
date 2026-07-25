from unittest.mock import patch

from graph import graph


def test_run_recommend_maps_request_shape_into_graph_state():
    captured = {}

    class FakeGraph:
        def invoke(self, state):
            captured.update(state)
            return {**state, "plans": []}

    with patch.object(graph, "get_graph", return_value=FakeGraph()):
        result = graph.run_recommend({
            "people": 4,
            "meat": 3,
            "veg_count": 1,
            "soup": 0,
            "selected_recipe": {"selectedDishes": [{"id": 9}]},
            "user_id": 7,
        })

    assert result["plans"] == []
    assert captured["people"] == 4
    assert captured["meat_count"] == 3
    assert captured["veg_count"] == 1
    assert captured["soup_count"] == 0
    assert captured["selected_dishes"] == [{"id": 9}]
    assert captured["user_id"] == 7
