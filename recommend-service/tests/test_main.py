from unittest.mock import patch

from fastapi.testclient import TestClient

import main


client = TestClient(main.app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_internal_ai_service_does_not_enable_browser_cors():
    response = client.options(
        "/chat/sync",
        headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in response.headers


def test_recommend_endpoint_maps_legacy_and_current_count_fields():
    captured = {}

    def fake_run(params):
        captured.update(params)
        return {"plans": [{"dishes": []}]}

    with patch("graph.graph.run_recommend", side_effect=fake_run):
        response = client.post("/recommend", json={"people": 3, "meat": 4, "veg_count": 1, "soup": 2})

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert captured["people"] == 3
    assert captured["meat_count"] == 4
    assert captured["veg_count"] == 1
    assert captured["soup_count"] == 2


def test_recommend_endpoint_surfaces_graph_error():
    with patch("graph.graph.run_recommend", return_value={"plans": [], "error": "database unavailable"}):
        response = client.post("/recommend", json={})
    assert response.status_code == 500
    assert "database unavailable" in response.json()["detail"]


def test_sync_chat_endpoint_preserves_reply_and_dishes():
    with patch.object(main.chat_handler, "chat", return_value={
        "reply": "answer", "dishes": [{"id": 1}],
        "action": {"type": "CREATE_CUSTOM_DISH", "dish": {"name": "A"}},
    }):
        response = client.post("/chat/sync", json={"message": "hello", "user_id": "7"})
    assert response.status_code == 200
    assert response.json() == {
        "reply": "answer",
        "dishes": [{"id": 1}],
        "action": {"type": "CREATE_CUSTOM_DISH", "dish": {"name": "A"}},
        "success": True,
    }


def test_stream_chat_endpoint_uses_sse_framing():
    async def fake_stream(message, user_id):
        yield "part"

    with patch.object(main.chat_handler, "stream_chat", fake_stream):
        response = client.post("/chat", json={"message": "hello"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.text == "data: part\n\ndata: [DONE]\n\n"
