import json
from unittest.mock import patch

import pytest

import chat_handler


def setup_function():
    chat_handler._conversations.clear()


def test_intent_and_ingredient_detection_cover_primary_chat_flows():
    assert chat_handler._detect_intent("家里有番茄和鸡蛋") == "ingredient_match"
    assert chat_handler._detect_intent("推荐今晚吃什么") == "recommend"
    assert chat_handler._detect_intent("这个怎么做") == "howto"
    assert chat_handler._detect_intent("加入我的菜谱") == "add_custom"
    assert set(chat_handler._extract_ingredients("番茄和鸡蛋、土豆")) >= {"番茄", "鸡蛋", "土豆"}


def test_history_is_bounded_to_twenty_messages(tmp_path):
    with patch.object(chat_handler, "MEMORY_FILE", str(tmp_path / "memory.json")):
        for i in range(25):
            chat_handler.append_history("u", "assistant", str(i))
    assert len(chat_handler._conversations["u"]) == 20
    assert chat_handler.get_history("u") == chat_handler._conversations["u"][-10:]


def test_sync_chat_falls_back_to_local_results_when_model_fails(tmp_path):
    dishes = [{"id": 1, "name": "番茄炒蛋", "type": "meat", "kcal": 200}]
    with patch.object(chat_handler, "MEMORY_FILE", str(tmp_path / "memory.json")), \
            patch.object(chat_handler.rag, "load_index"), \
            patch.object(chat_handler.rag, "search_semantic", return_value=dishes), \
            patch.object(chat_handler, "_match_dishes", return_value=[]), \
            patch.object(chat_handler.httpx, "post", side_effect=RuntimeError("offline")):
        result = chat_handler.chat("推荐一道菜", "u")

    assert "番茄炒蛋" in result["reply"]
    assert result["dishes"][0]["id"] == 1
    assert [item["role"] for item in chat_handler._conversations["u"]] == ["user", "assistant"]


def test_add_custom_returns_a_structured_command_without_database_write(tmp_path):
    original_import = __import__
    chat_handler._conversations["7"] = [
        {"role": "assistant", "content": "推荐你试试番茄炒蛋。"}
    ]
    dish = {
        "id": 1,
        "name": "番茄炒蛋",
        "type": "veg",
        "cl": "番茄#鸡蛋",
        "step": "炒熟",
    }

    with patch.object(chat_handler, "MEMORY_FILE", str(tmp_path / "memory.json")), \
            patch.object(chat_handler.rag, "load_index"), \
            patch.object(chat_handler.rag, "_dish_meta", [dish]), \
            patch.object(chat_handler.httpx, "post", side_effect=RuntimeError("offline")), \
            patch("builtins.__import__", side_effect=lambda name, *args, **kwargs: (
                (_ for _ in ()).throw(AssertionError("chat handler must not import db"))
                if name == "db" else original_import(name, *args, **kwargs)
            )):
        result = chat_handler.chat("加入我的菜谱", "7")

    assert result["action"] == {
        "type": "CREATE_CUSTOM_DISH",
        "dish": {
            "name": "番茄炒蛋",
            "type": "veg",
            "cl": "番茄#鸡蛋",
            "step": "炒熟",
        },
    }
    assert "已把" not in result["reply"]


@pytest.mark.asyncio
async def test_streaming_request_includes_current_user_message(tmp_path):
    captured = {}

    class FakeStream:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def aiter_lines(self):
            yield "data: " + json.dumps({"choices": [{"delta": {"content": "ok"}}]})
            yield "data: [DONE]"

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        def stream(self, *args, **kwargs):
            captured.update(kwargs["json"])
            return FakeStream()

    with patch.object(chat_handler, "MEMORY_FILE", str(tmp_path / "memory.json")), \
            patch.object(chat_handler.rag, "search_semantic", return_value=[]), \
            patch.object(chat_handler.httpx, "AsyncClient", FakeClient):
        chunks = [chunk async for chunk in chat_handler.stream_chat("current question", "u")]

    assert chunks == ["ok"]
    assert captured["messages"][-1] == {"role": "user", "content": "current question"}
