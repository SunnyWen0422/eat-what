import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock

ROOT=Path(__file__).resolve().parents[1]
def module():
 s=importlib.util.spec_from_file_location('evaluation',ROOT/'scripts/evaluate_workspace.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

class WorkspaceEvaluationTest(unittest.TestCase):
 def test_model_failure_is_not_a_successful_clarification(self):
  m=module();case=next(c for c in m.read_cases(ROOT/'tests/fixtures/workspace-evaluation.jsonl') if c['caseId']=='ambiguity-1')
  result={'needsInput':True,'executionStatus':'failed','failureClass':'ModelUnavailable','message':'本地模型未完成理解或预算已用完，请使用明确筛选后重试','dishIds':[]}
  self.assertFalse(m.check_result(case,result,set())['passed'])
 def test_explicit_other_meals_have_correct_gold_target(self):
  m=module();cases=m.read_cases(ROOT/'tests/fixtures/workspace-evaluation.jsonl')
  for case in (c for c in cases if c['caseId'] in ('cuisine-4','cuisine-5')):
   expected='lunch' if case['caseId']=='cuisine-4' else 'breakfast'
   self.assertEqual(case['expectedOutcomeClass'],'different_target');self.assertEqual(case['expectedTarget']['mealType'],expected)
   self.assertTrue(m.check_result(case,{'needsInput':True,'suggestedTarget':{'date':'2026-10-06','mealType':expected}},set())['passed'])
 def test_sixty_valid_fixed_cases_and_dry_run_never_calls_http(self):
  m=module();cases=m.read_cases(ROOT/'tests/fixtures/workspace-evaluation.jsonl');send=Mock(side_effect=AssertionError('HTTP in dry-run'))
  report=m.evaluate(cases,send=send)
  self.assertEqual(len(cases),60);self.assertEqual(len({x['family'] for x in cases}),10)
  self.assertEqual(report['validated'],60);self.assertEqual(report['executed'],0);self.assertIsNone(report['qualityPassRate']);send.assert_not_called()
 def test_unsafe_config_invalid_fixture_and_budget_exhausted_fail_closed(self):
  m=module();self.assertTrue(m.validate_fixture({}))
  manifest={'environment':'production','api':'https://example.org/api'}
  with self.assertRaises(ValueError):m.validate_execution(manifest,{'limit':20,'used':12},2)
  local={'environment':'local','api':'http://127.0.0.1:18780/api','dbHost':'127.0.0.1','database':'eatwhat_v4_local_test','root':str(ROOT),'dataDir':'.local-v4/mysql'}
  send=Mock();cases=m.read_cases(ROOT/'tests/fixtures/workspace-evaluation.jsonl')[:1]
  report=m.evaluate(cases,execute=True,manifest=local,budget={'limit':20,'used':20},max_requests=1,send=send)
  self.assertEqual(report['executed'],0);send.assert_not_called()
 def test_bad_json_and_foreign_id_are_failures_not_quality_success(self):
  m=module();case=m.read_cases(ROOT/'tests/fixtures/workspace-evaluation.jsonl')[0]
  self.assertFalse(m.check_result(case,{'dishIds':[999],'date':case['context']['date'],'mealType':case['context']['mealType'],'needsInput':False,'constraintsUnderstood':True},set(range(1,11)))['passed'])
  self.assertFalse(m.check_result(case,'bad JSON',set(range(1,11)))['passed'])
