"""Deferred model-service review checks; run only during the later unified model acceptance."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]

class LocalBudgetReviewTest(unittest.TestCase):
    def probe(self, code, used=19):
        scratch = ROOT / '.test-artifacts' / 'review-budget'
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as folder:
            private = Path(folder)
            budget = private / 'model-budget.json'
            budget.write_text(json.dumps({'limit': 20, 'used': used}), encoding='utf-8')
            env = os.environ.copy()
            env.update(DB_HOST='127.0.0.1', DB_NAME='eatwhat_v4_local_unit',
                       LOCAL_MODEL_BUDGET_FILE=str(budget), ASSISTANT_STORE_PATH=str(private/'assistant.sqlite3'),
                       DISH_META_PATH=str(private/'dishes.json'), INGREDIENT_MAP_PATH=str(private/'ingredients.json'),
                       DEEPSEEK_API_KEY='synthetic-test-only', ASSISTANT_AGENT_MODE='model')
            env['PYTHONPATH'] = str(ROOT/'recommend-service') + os.pathsep + env.get('PYTHONPATH', '')
            script = """
import json, os
from unittest.mock import patch, Mock
import local_agent as local
import agent_runtime, assistant_engine, model_client
runtime = agent_runtime.RUNTIME
""" + code
            result = subprocess.run([sys.executable, '-c', script], env=env, capture_output=True, text=True, timeout=20)
            self.assertEqual(0, result.returncode, result.stderr)

    def test_failed_twentieth_call_has_no_unbudgeted_wording_request(self):
        self.probe("""
response=Mock(status_code=500);response.json.return_value={}
with patch.object(assistant_engine, '_local_candidates', return_value=[]), patch.object(model_client.httpx, 'post', return_value=response) as post:
 result=runtime.run('今晚两人吃家常菜','910002',session_id='budget-last',idempotency_key='last')
 assert post.call_count==1, f'provider calls={post.call_count}'
 assert json.loads(local.budget.read_text())['used']==20
 assert result['task']['status'] in {'completed','needs_input'}
""")

    def test_exhausted_budget_finishes_task_and_next_message_can_start(self):
        self.probe("""
with patch.object(assistant_engine, '_local_candidates', return_value=[]), patch.object(model_client.httpx, 'post') as post:
 try: runtime.run('今晚两人吃家常菜','910002',session_id='budget-full',idempotency_key='full')
 except RuntimeError: pass
 # Persisted task is read through the runtime's task API using the real store.
 with runtime.store._connect() as connection:
  statuses=[row[0] for row in connection.execute('SELECT status FROM assistant_tasks WHERE session_id=?',('budget-full',)).fetchall()]
 assert statuses and all(s not in {'queued','understanding','querying','planning','validating'} for s in statuses), statuses
 runtime.begin_task('budget-full','910002','继续安排',idempotency_key='next')
 assert post.call_count==0
""", used=20)

    def test_explicit_rule_mode_never_spends_the_model_budget(self):
        self.probe("""
os.environ['ASSISTANT_AGENT_MODE']='rule'
with patch.object(assistant_engine, '_local_candidates', return_value=[]), patch.object(model_client.httpx, 'post') as post:
 runtime.run('今晚两人吃家常菜','910002',session_id='rule-only',idempotency_key='rule')
 assert post.call_count==0
 assert json.loads(local.budget.read_text())['used']==19
""")
