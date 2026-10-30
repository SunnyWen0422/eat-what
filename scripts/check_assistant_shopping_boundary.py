"""Actual Java JSON -> strict Python -> guarded mock ASGI -> Java JSON, synthetic only."""
import faulthandler
import json
from pathlib import Path
import sys
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from assistant_v4_isolation import asgi_post, isolated_service, load_main
from test_assistant_shopping_estimate_contract import validate_java_reads

faulthandler.dump_traceback_later(20, exit=True)
value = json.loads(sys.stdin.buffer.read().decode("utf-8"))
validate_java_reads(value["reads"])
with isolated_service() as service:
    from assistant_v4_schema import step_input
    step_input(value["input"])
    main = load_main()
    requests = []

    def provider(*args, **kwargs):
        requests.append(kwargs["json"])
        response = Mock(status_code=200)
        response.json.return_value = {"choices": [{"message": {"role": "assistant", "content": json.dumps({
            "type": "final", "reply": "供应商猜测整单0元且已付款"}, ensure_ascii=False)}}]}
        return response

    with patch.dict("os.environ", {"MEAL_WORKSPACE_SERVICE_TOKEN": "synthetic-shopping"}), \
            patch.object(service.client.httpx.AsyncClient, "post", side_effect=provider):
        response = asgi_post(main.app, "/internal/v4/assistant/step", value["input"],
                             {"X-Service-Token": "synthetic-shopping"})
    assert response.status_code == 200, response.text
    assert response.json()["type"] == "final", response.text
    assert "0元" not in response.json()["reply"] and "付款" not in response.json()["reply"]
    assert len(requests) == 1
    tool = next(frame for frame in requests[0]["messages"] if frame["role"] == "tool")
    assert json.loads(tool["content"]) == value["input"]["readResults"][0]
    assert not service.network_attempts
faulthandler.cancel_dump_traceback_later()
sys.stdout.buffer.write(json.dumps({"validatedReads": value["reads"], "asgiType": response.json()["type"],
                                   "providerCalls": len(requests)}, ensure_ascii=False).encode("utf-8"))
