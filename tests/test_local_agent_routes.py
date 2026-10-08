import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]

class LocalAgentRoutesTest(unittest.TestCase):
 def test_advanced_routes_use_private_history_and_the_same_budget(self):
  scratch=ROOT/'.test-artifacts'/'local-agent';scratch.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(dir=scratch) as name:
   private=Path(name);budget=private/'model-budget.json';budget.write_text(json.dumps({'limit':20,'used':20}),encoding='utf-8')
   env=os.environ.copy();env.update(DB_HOST='127.0.0.1',DB_NAME='eatwhat_v4_local_unit',LOCAL_MODEL_BUDGET_FILE=str(budget),ASSISTANT_STORE_PATH=str(private/'assistant.sqlite3'),DISH_META_PATH=str(private/'dish_meta.json'),INGREDIENT_MAP_PATH=str(private/'ingredient_map.json'))
   env['PYTHONPATH']=str(ROOT/'recommend-service')+os.pathsep+env.get('PYTHONPATH','')
   code="""
from pathlib import Path
import local_agent as local
import agent_runtime
assert '/assistant/sessions' in {r.path for r in local.app.routes}
assert '/chat/sync' not in {r.path for r in local.app.routes}
assert agent_runtime.RUNTIME.model_factory is local.BudgetedModel
assert agent_runtime.RUNTIME.store.path.resolve().parent == local.budget.parent.resolve()
try:
 local.BudgetedModel().complete([],[],{})
 raise AssertionError('Budget limit did not stop the request')
except RuntimeError as error:
 assert str(error)=='Local model budget exhausted'
# Unit fixture only: cap is enforced before a second provider call, including failures.
import json
local.budget.write_text(json.dumps({'limit':20,'used':0}))
model=local.BudgetedModel(max_requests=1)
class Fake:
 def complete(self,*args):raise ValueError('simulated provider failure')
model.client=Fake()
try:model.complete([],[],{})
except ValueError:pass
assert json.loads(local.budget.read_text())['used']==1
try:
 model.complete([],[],{})
 raise AssertionError('Run cap did not stop second request')
except RuntimeError as error:assert str(error)=='Local evaluation request cap exhausted'
print('PASS')
"""
   result=subprocess.run([sys.executable,'-c',code],env=env,capture_output=True,text=True,timeout=20)
   self.assertEqual(0,result.returncode,result.stderr)
   self.assertEqual(1,json.loads(budget.read_text())['used'])
