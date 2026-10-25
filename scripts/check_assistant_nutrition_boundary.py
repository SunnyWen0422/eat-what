"""Real Java serialization -> strict Python validators and isolated ASGI, no external calls."""
import copy
import json
from pathlib import Path
import sys
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from assistant_v4_isolation import asgi_post, isolated_service, load_main

value = json.loads(sys.stdin.buffer.read().decode("utf-8"))
with isolated_service() as service:
    from assistant_v4_schema import step_input, read_result, StepValidationError
    step_input(value["input"])
    read_result(value["read"])
    bad = copy.deepcopy(value["read"])
    bad["items"][0]["untrustedField"] = 123
    try:
        read_result(bad)
        raise AssertionError("Unknown fields must remain forbidden")
    except StepValidationError:
        pass
    main = load_main()
    response = Mock(status_code=200)
    response.json.return_value = {"choices": [{"message": {"role": "assistant", "content": json.dumps({"type": "final", "reply": "已读取本次营养信息"})}}]}
    with patch.dict("os.environ", {"MEAL_WORKSPACE_SERVICE_TOKEN": "synthetic-nutrition"}), patch.object(service.client.httpx.AsyncClient, "post", return_value=response):
        result = asgi_post(main.app, "/internal/v4/assistant/step", value["input"], {"X-Service-Token": "synthetic-nutrition"})
    assert result.status_code == 200, result.text
    assert not service.network_attempts
print("nutrition contract passed")
