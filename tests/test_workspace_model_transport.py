import importlib
import sys
from pathlib import Path
import unittest
from unittest.mock import patch, Mock

SERVICE = Path(__file__).resolve().parents[1] / 'recommend-service'

class WorkspaceModelTransportTest(unittest.TestCase):
 def test_tool_round_trip_keeps_provider_metadata_private(self):
  sys.path.insert(0, str(SERVICE))
  try:
   client = importlib.import_module('model_client')
   agent = importlib.import_module('workspace_agent')
   context = {'date':'2026-10-06','mealType':'dinner','requirements':'不要鸡蛋'}
   tool = {'id':'tool-1','type':'function','function':{'name':'search_dishes','arguments':'{}'}}
   responses = [
    {'choices':[{'message':{'content':'','reasoning_content':'opaque provider metadata','tool_calls':[tool]}}]},
    {'choices':[{'message':{'content':'{"needsInput":false,"constraintsUnderstood":true,"date":"2026-10-06","mealType":"dinner","dishIds":[7],"criteria":{"excludedIngredients":["鸡蛋"]}}'}}]},
   ]
   def post(*args, **kwargs):
    if len(responses)==1:
     assistant=next(m for m in kwargs['json']['messages'] if m['role']=='assistant')
     self.assertEqual('opaque provider metadata',assistant.get('reasoning_content'))
    response=Mock(status_code=200);response.json.return_value=responses.pop(0);return response
   with patch.object(client.httpx,'post',side_effect=post):
    result=agent.run_task({'context':context,'draft':{}},910002,model=client.DeepSeekModelClient(api_key='test-only'),execute=lambda *args:[{'id':7}])
   self.assertFalse(result['needsInput'])
   self.assertNotIn('reasoning_content',result)
   self.assertEqual([7],result['dishIds'])
  finally:sys.path.remove(str(SERVICE))
