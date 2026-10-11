"""Live-entry safeguards tested only with synthetic files and mocked transport."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import assistant_v4_live_acceptance as live

SCRATCH=ROOT/'.test-artifacts/assistant-live-guards'
SCRATCH.mkdir(parents=True,exist_ok=True)

class LiveEntryGuardsTest(unittest.TestCase):
    def test_final_diagnostic_uses_only_trusted_recipe_facts_and_enabled_actions(self):
        context={'schemaVersion':'assistant.v4.1','capabilities':['draft_update','search_dishes','read_current_meal'],
            'activeMeal':{'currentDishes':[{'id':910000101}]}}
        payload={'messages':[{'role':'system','content':'synthetic instructions'},
            {'role':'user','content':'当前授权上下文资料(JSON)：'+json.dumps(context)},
            {'role':'user','content':'PRIVATE_USER_TEXT 910000999'},
            {'role':'assistant','content':'PRIVATE_FAKE_ID 910000999'},
            {'role':'tool','content':json.dumps({'callId':'PRIVATE_CALL','name':'search_dishes','items':[{'id':910000102}], 'truncated':False})},
            {'role':'tool','content':json.dumps({'callId':'PRIVATE_CALL2','name':'read_current_meal','items':[{'currentDishes':[{'id':910000103}]}], 'truncated':False})}]}
        for args,code in (({'operation':'generate','selectedDishIds':[910000101,910000102,910000103]},None),
            ({'operation':'generate','selectedDishIds':[910000999]},'unsourced dish'),
            ({'operation':'generate','selectedDishIds':[910000102,910000102]},'duplicate dish'),
            ({'operation':'','selectedDishIds':[910000102]},'invalid enum')):
            message={'role':'assistant','content':json.dumps({'type':'final','reply':'PRIVATE_REPLY','actionProposal':{'steps':[{'kind':'draft_update','arguments':args}]}}),'tool_calls':[]}
            result=live.message_diagnostic(message,payload)['finalDiagnostic']
            self.assertEqual(code is None,result['validation']['passed']);self.assertEqual(code,result['validation']['code'])
            self.assertEqual(3,result['authorizedDishCount']);self.assertEqual(1,result['stepCount'])
            if code=='invalid enum':self.assertEqual('actionProposal.steps[].arguments.operation',result['steps'][0]['argumentValidation']['path'])
            encoded=json.dumps(result);self.assertNotIn('PRIVATE_',encoded);self.assertNotIn('910000',encoded)
        context['capabilities']=[];payload['messages'][1]['content']='当前授权上下文资料(JSON)：'+json.dumps(context)
        message['content']=json.dumps({'type':'final','reply':'PRIVATE_REPLY','actionProposal':{'steps':[{'kind':'draft_update','arguments':{'operation':'generate','selectedDishIds':[910000101]}}]}})
        result=live.message_diagnostic(message,payload)['finalDiagnostic'];self.assertEqual('action not enabled',result['validation']['code'])
        message['tool_calls']=None
        result=live.message_diagnostic(message,payload)['finalDiagnostic'];self.assertEqual('message.tool_calls',result['frameValidation']['path'])
    def test_deep_argument_diagnostic_failure_never_interrupts_original_response(self):
        message={'role':'assistant','content':None,'reasoning_content':'PRIVATE_REASONING',
            'tool_calls':[{'id':'PRIVATE_ID','type':'function','function':{'name':'search_dishes','arguments':'['*5000+'0'+']'*5000}}]}
        original=json.dumps(message);events=[]
        class Ledger:
            def wrap(self,post,metrics):
                def counted(*args,**kwargs):events.append('reserved');return post(*args,**kwargs)
                return counted
        response=Mock(status_code=200);response.json.return_value={'choices':[{'message':message}]}
        with patch('httpx.post',return_value=response) as post,patch('socket.socket.connect',side_effect=AssertionError('external socket')):
            model=live.LiveCompletion({'DEEPSEEK_API_KEY':'synthetic','DEEPSEEK_BASE_URL':'https://fixture.invalid','DEEPSEEK_MODEL':'synthetic'},Ledger())
            result=model.complete({'messages':[]})
        self.assertIs(message,result);self.assertEqual(original,json.dumps(message));post.assert_called_once()
        self.assertEqual(['reserved'],events)
        self.assertEqual([{'diagnosticFailure':'diagnostic_unavailable'}],model.diagnostics)
        self.assertNotIn('PRIVATE_',json.dumps(model.diagnostics))
    def test_tool_diagnostic_valid_and_empty_query_use_actual_schema_without_values(self):
        for arguments,valid in (({'top_k':8},True),({'query':'','top_k':8},False)):
            message={'role':'assistant','content':None,'reasoning_content':'PRIVATE_REASONING',
                'tool_calls':[{'id':'PRIVATE_ID','type':'function','function':{'name':'search_dishes','arguments':json.dumps(arguments)}}]}
            result=live.message_diagnostic(message)
            self.assertEqual(valid,result['assistantCallsValidation']['passed'])
            self.assertEqual('NoneType',result['fieldTypes']['content'])
            call=result['toolDiagnostics'][0]
            self.assertEqual({'keys':['function','id','type'],'unknownKeyCount':0},call['callKeys'])
            self.assertEqual(valid,call['validation']['passed'])
            if not valid:
                self.assertEqual({'code':'invalid string length','path':'arguments.query'},call['argumentValidation'])
                self.assertTrue(call['argumentFields']['query']['blank'])
            encoded=json.dumps(result);self.assertNotIn('PRIVATE_',encoded);self.assertNotIn('top_k": 8',encoded)
        message['tool_calls'][0]['index']=0
        result=live.message_diagnostic(message)
        self.assertFalse(result['assistantCallsValidation']['passed']);self.assertIn('index',result['toolDiagnostics'][0]['callKeys']['keys'])
        message['tool_calls'][0]['function']['name']=['PRIVATE_UNKNOWN']
        result=live.message_diagnostic(message);self.assertEqual(['unknown'],result['toolNames']);self.assertNotIn('PRIVATE_',json.dumps(result))
    def test_usage_unknown_partial_and_failed_requests_preserve_coverage(self):
        samples=[([{'status':'failed'}],None,0,None,'unknown'),
            ([{'httpStatus':200,'status':'responded'}],None,0,None,'unknown'),
            ([{'usage':{'prompt_tokens':4}}],None,0,None,'unknown'),
            ([{'usage':{'prompt_tokens':4,'completion_tokens':2,'total_tokens':6}}, {'status':'failed'}],None,1,6,'partial'),
            ([{'usage':{'prompt_tokens':0,'completion_tokens':0,'total_tokens':0}}],0,1,0,'complete')]
        for calls,total,known,subtotal,status in samples:
            with self.subTest(calls=calls),tempfile.TemporaryDirectory(dir=SCRATCH) as tmp:
                path=Path(tmp)/'budget.json';path.write_text(json.dumps({'limit':20,'used':0,'authorizationDate':'2026-10-11','scope':'new V4 assistant synthetic local integration tests','providerRequestsCountedPerHttpAttempt':True}),encoding='utf-8')
                execution=live.LiveExecution({},path)
                for _ in calls:execution.ledger.reserve()
                report={'cases':[]};execution.finish_report(report,Mock(calls=[dict(c,latencyMs=1) for c in calls]))
                self.assertEqual(total,report['tokenUsage']['total_tokens'])
                self.assertEqual({'knownRequests':known,'totalRequests':len(calls),'knownSubtotal':subtotal,'status':status},report['tokenUsageCoverage']['total_tokens'])
                if calls==[{'usage':{'prompt_tokens':4}}]:
                    self.assertEqual(4,report['tokenUsage']['prompt_tokens']);self.assertIsNone(report['tokenUsage']['completion_tokens'])
    def test_diagnostics_keep_structure_without_payload_or_reasoning(self):
        message={'role':'assistant','reasoning_content':'private reasoning','secret-key':'private value',
            'content':'{"type":"need_input","question":"请说明日期 private prose"}',
            'tool_calls':[{'function':{'name':'search_dishes','arguments':'private arguments'}}]}
        result=live.message_diagnostic(message)
        self.assertEqual('need_input',result['jsonType']);self.assertEqual(['search_dishes'],result['toolNames'])
        self.assertEqual('date',result['needInputCategory'])
        encoded=json.dumps(result);self.assertNotIn('private',encoded);self.assertNotIn('secret-key',encoded)
        result=live.turn_diagnostic({'status':'needs_input','reply':live.UNAVAILABLE,'retryable':True,'cards':[]})
        self.assertEqual('unavailable',result['replyCategory'])
    def test_case_selection_is_explicit_and_rejects_unknown(self):
        self.assertEqual(['LIVE01'],live.selected_cases('LIVE01'))
        with self.assertRaises(AssertionError):live.selected_cases('LIVE99')
    def test_inflight_reserved_attempt_remains_in_live_totals(self):
        with tempfile.TemporaryDirectory(dir=SCRATCH) as tmp:
            path=Path(tmp)/'budget.json'
            path.write_text(json.dumps({'limit':20,'used':0,'authorizationDate':'2026-10-11',
                'scope':'new V4 assistant synthetic local integration tests','providerRequestsCountedPerHttpAttempt':True}),encoding='utf-8')
            execution=live.LiveExecution({},path);execution.ledger.reserve();report={'cases':[]}
            execution.finish_report(report,Mock(calls=[]))
            self.assertEqual(1,report['realProviderRequests']);self.assertEqual(1,report['inFlightOrInterruptedRequests'])
            self.assertEqual(0,report['completedProviderMetrics']);self.assertIsNone(report['latencyMs']['p50'])
            self.assertIsNone(report['tokenUsage']['total_tokens']);self.assertEqual(0,report['tokenUsageCoverage']['total_tokens']['knownRequests'])
    def test_only_three_fields_are_loaded_from_explicit_known_file(self):
        with tempfile.TemporaryDirectory(dir=SCRATCH) as tmp:
            root=Path(tmp);service=root/'recommend-service';service.mkdir()
            path=service/'.env';path.write_text('DB_PASSWORD=must-not-be-retained\nDEEPSEEK_API_KEY="synthetic-key"\nDEEPSEEK_BASE_URL=https://fixture.invalid\nDEEPSEEK_MODEL=synthetic-model\n',encoding='utf-8')
            with patch.object(live.runner,'ROOT',root):fields=live.approved_provider_fields(path)
            self.assertEqual(live.FIELDS,set(fields));self.assertNotIn('must-not-be-retained',json.dumps(fields))
            with self.assertRaises(AssertionError):live.approved_provider_fields(path)
    def test_insecure_provider_base_rejected_before_transport(self):
        with tempfile.TemporaryDirectory(dir=SCRATCH) as tmp:
            root=Path(tmp);service=root/'recommend-service';service.mkdir();path=service/'.env'
            for base in ('http://fixture.invalid','https://name:password@fixture.invalid','https://fixture.invalid?secret=x'):
                path.write_text('DEEPSEEK_API_KEY=synthetic\nDEEPSEEK_MODEL=synthetic\nDEEPSEEK_BASE_URL='+base,encoding='utf-8')
                with patch.object(live.runner,'ROOT',root),self.assertRaises(AssertionError):live.approved_provider_fields(path)
    def test_forwarding_preserves_actual_payload_and_reserves_before_http(self):
        calls=[]
        class Ledger:
            def wrap(self,post,metrics):
                def counted(*args,**kwargs):
                    calls.append('reserved');return post(*args,**kwargs)
                return counted
        def post(*args,**kwargs):
            self.assertEqual(['reserved'],calls)
            self.assertEqual('actual-configured-model',kwargs['json']['model'])
            self.assertEqual([{'role':'user','content':'synthetic request'}],kwargs['json']['messages'])
            self.assertEqual([{'function':{'name':'read_current_meal'}}],kwargs['json']['tools'])
            response=Mock(status_code=200);response.json.return_value={'choices':[{'message':{'role':'assistant','content':'{"type":"need_input","question":"哪一天？"}'}}]};return response
        with patch('httpx.post',side_effect=post),patch('socket.socket.connect',side_effect=AssertionError('external socket')):
            model=live.LiveCompletion({'DEEPSEEK_API_KEY':'synthetic-key','DEEPSEEK_BASE_URL':'https://fixture.invalid','DEEPSEEK_MODEL':'actual-configured-model'},Ledger())
            result=model.complete({'model':'synthetic-local-model','messages':[{'role':'user','content':'synthetic request'}],'tools':[{'function':{'name':'read_current_meal'}}]})
        self.assertEqual('assistant',result['role']);self.assertEqual(['reserved'],calls)

if __name__=='__main__':unittest.main()
