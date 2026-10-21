"""Java serializer -> isolated Python ASGI/model stub -> Java action validator.

This executable accepts synthetic StepInput on stdin only. The isolation helper
blocks real provider/DB connections and .env loading.
"""
import json
from pathlib import Path
import sys
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from assistant_v4_isolation import asgi_post, isolated_service, load_main

request = json.loads(sys.stdin.buffer.read().decode("utf-8"))
assert request["context"]["constraints"]["recommendationPolicy"] == "balanced-v1"
assert "favoriteDishIds" not in json.dumps(request)
proposal = {"type": "final", "reply": "已按本餐偏好搭配", "actionProposal": {"steps": [
    {"kind": "draft_update", "arguments": {"operation": "generate", "selectionMode": "recommend",
     "contextPatch": {"recommendationPreferences": {"includeTagCodes": ["LIGHT"]},
                      "expectedTotalCookMinutes": 30, "candidateScope": "all"}}}]}}
if request["message"] == "换掉第二道菜":
    proposal["actionProposal"]["steps"][0]["arguments"] = {"operation": "adjust", "targetDishId": 2}
calls = []


def provider(*args, **kwargs):
    calls.append(kwargs)
    response = Mock(status_code=200)
    response.json.return_value = {"choices": [{"message": {
        "role": "assistant", "content": json.dumps(proposal, ensure_ascii=False)}}]}
    return response


with isolated_service() as service:
    main = load_main()
    with patch.dict("os.environ", {"MEAL_WORKSPACE_SERVICE_TOKEN": "synthetic-boundary"}), \
            patch.object(service.client.httpx.AsyncClient, "post", side_effect=provider):
        response = asgi_post(main.app, "/internal/v4/assistant/step", request,
                             {"X-Service-Token": "synthetic-boundary"})
    assert response.status_code == 200, response.text
    assert not service.network_attempts
    assert len(calls) == 1
    assert "selectionMode" in json.dumps(calls[0]["json"])
    sys.stdout.buffer.write(json.dumps(response.json(), ensure_ascii=False).encode("utf-8"))
