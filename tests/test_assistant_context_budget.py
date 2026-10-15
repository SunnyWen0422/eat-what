import copy,json,unittest
from assistant_v4_isolation import isolated_service,load_main
from unittest.mock import patch
from test_assistant_v4_step import body
class AssistantContextBudgetTest(unittest.TestCase):
    def test_each_recent_text_is_sent_to_provider_once(self):
        with isolated_service():
            from assistant_v4_step import prepare_step
            req=body();text='unique-history-61015'
            req['context']['conversation']={'recentText':[{'role':'user','text':text}],'roundLimit':6}
            req['conversationFrames']=[{'role':'user','content':text}]
            before=copy.deepcopy(req)
            messages=prepare_step(req)[0]
            self.assertEqual(json.dumps(messages,ensure_ascii=False).count(text),1)
            self.assertEqual(req,before)
    def test_legacy_context_without_frames_keeps_its_only_history(self):
        with isolated_service():
            from assistant_v4_step import prepare_step
            req=body();req['context']['conversation']={'recentText':[{'role':'user','text':'only-history'}],'roundLimit':6}
            self.assertIn('only-history',json.dumps(prepare_step(req)[0]))
    def test_internal_extension_probe_is_authenticated_without_provider_calls(self):
        with isolated_service() as service:
            main=load_main()
            with patch.dict('os.environ',{'MEAL_WORKSPACE_SERVICE_TOKEN':'synthetic-probe'}):
                with self.assertRaises(main.HTTPException):main.assistant_v4_capabilities(None)
                self.assertEqual(main.assistant_v4_capabilities('synthetic-probe')['contractRevision'],'maturity.1')
            self.assertEqual(service.network_attempts,[])
if __name__=='__main__':unittest.main()
