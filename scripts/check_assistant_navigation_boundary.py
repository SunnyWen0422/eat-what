"""Validate actual Java navigation payloads with Python's provider-output validator."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from assistant_v4_isolation import isolated_service

values = json.loads(sys.stdin.buffer.read().decode('utf-8'))
results = []
with isolated_service() as isolated:
    from assistant_v4_schema import final_output, StepValidationError
    for value in values:
        try:
            accepted = final_output(value, {7}, {'handoff_v1'})
            results.append({'accepted': True, 'output': accepted})
        except StepValidationError:
            results.append({'accepted': False})
    assert not isolated.network_attempts
sys.stdout.buffer.write(json.dumps(results, ensure_ascii=False).encode('utf-8'))
