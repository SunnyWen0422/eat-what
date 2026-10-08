"""Prepared N5 regressions; run only when the model-service test pause is lifted.

Uses real workspace/evaluator code with an in-memory model/tool seam; no provider,
network, database or subprocess is needed. This module is outside default discovery.
"""
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]


def load_source(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WorkspaceExhaustionReview(unittest.TestCase):
    def setUp(self):
        self.agent = load_source('exhaustion_workspace_agent', ROOT/'recommend-service/workspace_agent.py')
        self.evaluation = load_source('exhaustion_evaluation', ROOT/'scripts/evaluate_workspace.py')
        schemas = load_source('exhaustion_schemas', ROOT/'recommend-service/agent_schemas.py')
        client = types.ModuleType('model_client')
        client.DeepSeekModelClient = Mock(side_effect=AssertionError('No real model construction'))
        client.tool_assistant_message = lambda response, call, call_id: {'role': 'assistant', 'content': ''}
        tools = types.ModuleType('agent_tools')
        tools.model_catalog = lambda: {'tools': [{'name': 'search_dishes', 'input_schema': {'type': 'object'}}]}
        tools.execute_tool = Mock(side_effect=AssertionError('No real read tool'))
        self.modules = patch.dict(sys.modules, {'model_client': client, 'agent_tools': tools, 'agent_schemas': schemas})
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.context = {'date': '2026-10-08', 'mealType': 'lunch', 'requirements': '帮我安排'}
        self.model = Mock()
        self.model.timeout = 10
        self.model.complete.return_value = {'tool_call': {'name': 'search_dishes', 'arguments': {}}}

    def run_task(self):
        return self.agent.run_task({'context': self.context}, 1, model=self.model, execute=lambda *args: [{'id': 7}])

    def assert_failed_for_all_outcomes(self, result, failure_class):
        self.assertTrue(result['needsInput'])
        self.assertEqual('failed', result['executionStatus'])
        self.assertEqual(failure_class, result['failureClass'])
        self.assertEqual([], result['dishIds'])
        for outcome in ('proposal', 'needs_input', 'different_target'):
            case = {'expectedOutcomeClass': outcome, 'expectedTarget': self.context}
            self.assertEqual({'passed': False, 'errors': ['model_execution_failed']},
                             self.evaluation.check_result(case, result, {7}))

    def test_tool_round_exhaustion_is_not_successful_clarification(self):
        with patch.object(self.agent.time, 'monotonic', return_value=0):
            result = self.run_task()
        self.assertEqual(4, self.model.complete.call_count)
        self.assert_failed_for_all_outcomes(result, 'ToolLoopExhausted')

    def test_deadline_exhaustion_is_not_successful_clarification(self):
        with patch.object(self.agent.time, 'monotonic', side_effect=[0, 0, 15]):
            result = self.run_task()
        self.assertEqual(1, self.model.complete.call_count)
        self.assert_failed_for_all_outcomes(result, 'TaskDeadlineExceeded')

    def test_legitimate_needs_input_still_passes(self):
        self.model.complete.return_value = {'final': {'needsInput': True}}
        with patch.object(self.agent.time, 'monotonic', return_value=0):
            result = self.run_task()
        self.assertNotIn('failureClass', result)
        self.assertTrue(self.evaluation.check_result({'expectedOutcomeClass': 'needs_input'}, result, set())['passed'])

    def test_valid_cross_target_clarification_still_passes(self):
        target = {'date': '2026-10-09', 'mealType': 'dinner'}
        self.model.complete.return_value = {'final': {'needsInput': False, 'constraintsUnderstood': True, **target}}
        with patch.object(self.agent.time, 'monotonic', return_value=0):
            result = self.run_task()
        self.assertNotIn('failureClass', result)
        self.assertTrue(self.evaluation.check_result({'expectedOutcomeClass': 'different_target', 'expectedTarget': target}, result, set())['passed'])


if __name__ == '__main__':
    unittest.main()
