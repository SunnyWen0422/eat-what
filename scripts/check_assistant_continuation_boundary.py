"""Actual Java wire JSON -> Python validator/continuation; synthetic provider only."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from assistant_v4_isolation import isolated_service

value = json.loads(sys.stdin.buffer.read().decode('utf-8'))
class Provider:
    def complete_message(self, messages, tools, **kwargs):
        number = 1 + sum(m.get('role') == 'assistant' for m in messages)
        return {'role': 'assistant', 'content': None, 'tool_calls': [{
            'id': 'wire-' + str(number), 'type': 'function',
            'function': {'name': 'get_recommendation_options', 'arguments': '{}'}}]}

with isolated_service() as service:
    from assistant_v4_step import run_step
    result = run_step(value, Provider())
    assert result['type'] == 'read_calls', result
    assert not service.network_attempts
print(json.dumps(result, ensure_ascii=False))
