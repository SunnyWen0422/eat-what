"""Offline guard regressions always run; real sockets/DB require an explicit manifest."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('assistant_acceptance',ROOT/'scripts/assistant_v4_acceptance.py')
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
budget_spec=importlib.util.spec_from_file_location('assistant_provider_budget',ROOT/'scripts/assistant_v4_provider_budget.py')
budget_module=importlib.util.module_from_spec(budget_spec);budget_spec.loader.exec_module(budget_module)

class AcceptanceGuardsTest(unittest.TestCase):
    def test_owned_internal_endpoint_and_token_are_required_before_any_io(self):
        configurations=[
            'recommend:\n  service:\n    base-url: https://remote.invalid\nmeal-workspace:\n  service-token: synthetic-token\n',
            'meal-workspace:\n  service-token: synthetic-token\n',
            'recommend:\n  service:\n    base-url: http://127.0.0.1:8000\nmeal-workspace:\n  service-token: synthetic-token\n',
            'recommend:\n  service:\n    base-url: http://127.0.0.1:18781\n',
            'recommend:\n  service:\n    base-url: http://127.0.0.1:18781\nmeal-workspace:\n  service-token: ""\n',
            'recommend:\n  service:\n    base-url: http://127.0.0.1:18781\nmeal-workspace:\n  service-token: ${EXTERNAL_TOKEN}\n']
        with tempfile.TemporaryDirectory(prefix='.local-maturity-assistant-guards-',dir=ROOT) as tmp:
            private=Path(tmp);jar=private/'synthetic.jar';jar.write_bytes(b'synthetic')
            manifest=self.manifest();manifest.update(privateDirectory=str(private),jarSha256=runner.sha(jar))
            state={'database':manifest['database'],'api':manifest['isolatedApiBase'],'root':str(ROOT),
                'dataDir':str(private.relative_to(ROOT)/'mysql'),'dbPort':13060,'password':'synthetic-password','tokenSecret':'synthetic-auth-secret','mysqlPid':0,'javaPid':0}
            (private/'runtime.json').write_text(json.dumps(state),encoding='utf-8')
            base='server:\n  address: 127.0.0.1\n  port: 18780\n  servlet:\n    context-path: /api\nspring:\n  datasource:\n    url: jdbc:mysql://127.0.0.1:13060/'+manifest['database']+'\n    username: root\n    password: synthetic-password\nsecurity:\n  token:\n    secret: synthetic-auth-secret\n'
            for configuration in configurations:
                (private/'application-local.yml').write_text(base+configuration,encoding='utf-8');events=[]
                def forbidden(*args,**kwargs):events.append('io');raise RuntimeError('Unexpected IO')
                with self.subTest(configuration=configurations.index(configuration)),patch('socket.socket',side_effect=forbidden),patch('subprocess.Popen',side_effect=forbidden):
                    with self.assertRaisesRegex(AssertionError,'Owned internal'):
                        runner.run_owned(manifest,jar,private/'result.json')
                    self.assertEqual([],events)
    def test_owned_internal_configuration_returns_same_literal_token(self):
        configuration='recommend:\n  service:\n    base-url: "http://127.0.0.1:18781"\nmeal-workspace:\n  service-token: "synthetic-token"\n'
        self.assertEqual('synthetic-token',runner.validate_owned_internal_configuration(configuration))
    def manifest(self):
        return {'purpose':'assistant-v4-synthetic-acceptance','syntheticOnly':True,
            'isolatedApiBase':'http://127.0.0.1:18780/api','database':'eatwhat_v4_local_0123abcd',
            'privateDirectory':str(ROOT/'.local-maturity-assistant-test'),'users':[910001,910002],
            'jarSha256':'0'*64,'providerMode':'mock'}
    def test_manifest_rejects_production_and_ambiguous_targets_before_socket(self):
        for field,value in [('isolatedApiBase','https://chishenme.icu/api'),('database','food'),
            ('isolatedApiBase','http://localhost:18780/api'),('syntheticOnly',False),
            ('providerMode','live'),('users',[1,2]),('jarSha256',''),
            ('privateDirectory',str(ROOT/'.local-maturity-active'))]:
            candidate=self.manifest();candidate[field]=value
            with self.subTest(field=field,value=value),patch('socket.socket.connect',side_effect=AssertionError('socket opened')):
                with self.assertRaises(AssertionError):runner.validate_manifest(candidate)
    def test_explicit_synthetic_manifest_accepted(self):
        self.assertEqual(self.manifest(),runner.validate_manifest(self.manifest()))
    def test_http_client_entry_scene_matches_server_contract(self):
        contract=json.loads((ROOT/'contracts/assistant-v4.json').read_text(encoding='utf-8'))
        self.assertIn(runner.ENTRY_SCENE,contract['publicRequests']['entryScenes'])
    def test_fixed_cases_have_executable_assertions_and_exact_distribution(self):
        fixtures=runner.load_fixtures();self.assertEqual(40,len(fixtures));self.assertEqual(40,len({x['id'] for x in fixtures}))
        expected={'generation':8,'adjustment':8,'calendar':8,'shopping':6,'readonly':4,'recovery':6}
        self.assertEqual(expected,{group:sum(x['group']==group for x in fixtures) for group in expected})
        for case in fixtures:
            self.assertTrue(case['initial']['dishIds']);self.assertTrue(case['input']);self.assertTrue(case['expectedDomainEffects'])
            self.assertIn('unconfirmed_persistent_write',case['forbiddenOperations']);self.assertTrue(case['assertions']['turnStatuses'])
    def test_mock_completion_uses_provider_tool_frames_then_actions(self):
        model=runner.MockCompletion();model.register('测试',[runner.action('draft_update',operation='generate',selectedDishIds=[4])],runner.details([4]))
        payload={'messages':[{'role':'user','content':'测试'}]}
        first=model.complete(payload);self.assertEqual('get_dish_details',first['tool_calls'][0]['function']['name'])
        final=model.complete(payload);self.assertEqual([4],json.loads(final['content'])['actionProposal']['steps'][0]['arguments']['selectedDishIds'])
        self.assertEqual(2,len(model.calls))
    def test_provider_unavailability_is_explicit_and_does_not_retry(self):
        model=runner.MockCompletion();model.register('不可用',unavailable=True)
        self.assertIsNone(model.complete({'messages':[{'role':'user','content':'不可用'}]}));self.assertEqual(1,len(model.calls))

class ProviderBudgetTest(unittest.TestCase):
    def ledger(self,path,used=0):
        path.write_text(json.dumps({'limit':20,'used':used,'authorizationDate':'2026-10-11',
            'scope':'new V4 assistant synthetic local integration tests','providerRequestsCountedPerHttpAttempt':True}),encoding='utf-8')
    def test_failed_http_reservation_is_not_refunded(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'budget.json';self.ledger(path);metrics=[];calls=[]
            def failed(*args,**kwargs):
                calls.append(1);self.assertEqual(1,json.loads(path.read_text())['used']);raise TimeoutError('synthetic timeout')
            counted=budget_module.ProviderBudget(path).wrap(failed,metrics)
            with self.assertRaises(TimeoutError):counted('https://fixture.invalid')
            self.assertEqual(1,json.loads(path.read_text())['used']);self.assertEqual(1,len(calls));self.assertEqual('failed',metrics[0]['status'])
            self.assertNotIn('url',metrics[0]);self.assertNotIn('messages',metrics[0])
    def test_exhausted_or_locked_budget_never_calls_transport(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'budget.json';self.ledger(path,20)
            counted=budget_module.ProviderBudget(path).wrap(lambda *_:self.fail('transport called'),[])
            with self.assertRaises(budget_module.BudgetExhausted):counted('synthetic')
            self.ledger(path);path.with_suffix('.json.lock').write_text('busy')
            with self.assertRaises(budget_module.BudgetExhausted):counted('synthetic')
            self.assertEqual(0,json.loads(path.read_text())['used'])

@unittest.skipUnless(os.environ.get('ASSISTANT_V4_ACCEPTANCE_MANIFEST'),'Real HTTP/MySQL requires validated explicit synthetic manifest')
class RealAssistantHTTPFlowTest(unittest.TestCase):
    def test_all_40_business_outcomes_in_owned_process_tree(self):
        path=Path(os.environ['ASSISTANT_V4_ACCEPTANCE_MANIFEST'])
        manifest=runner.validate_manifest(json.loads(path.read_text(encoding='utf-8')))
        report=runner.run_owned(manifest,manifest['jarPath'],manifest['outputPath'])
        self.assertEqual(40,report['total']);self.assertEqual(40,report['passed'])

if __name__=='__main__':unittest.main()
