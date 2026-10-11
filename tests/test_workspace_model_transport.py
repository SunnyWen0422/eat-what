import unittest
from unittest.mock import patch, Mock

from assistant_v4_isolation import isolated_service

class WorkspaceModelTransportTest(unittest.TestCase):
 def test_tool_round_trip_keeps_provider_metadata_private(self):
  with isolated_service() as service:
   client = service.client
   agent = service.agent
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
    result=agent.run_task({'context':context,'draft':{},'agentContext':{'ownerUserId':910002,'catalog':[{'id':7,'name':'清炒青菜','type':'veg','cl':'青菜 蒜'}]}},910002,model=client.DeepSeekModelClient(api_key='test-only'))
   self.assertFalse(result['needsInput'])
   self.assertNotIn('reasoning_content',result)
   self.assertEqual([7],result['dishIds'])

 def test_missing_context_is_rejected(self):
  with isolated_service() as service:
   with patch.object(service.client.httpx,'post',side_effect=AssertionError('Provider must not run without authorized context')):
    result=service.agent.run_task({'context':{'date':'2026-10-06','mealType':'dinner'},'draft':{}},910002)
   self.assertTrue(result['needsInput'])
   self.assertEqual('AuthorizedContextMissing',result['failureClass'])
   self.assertEqual([],result['dishIds'])
