import ast
import copy
import json
import os
import sys
import tempfile
import time
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Set

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'recommend-service'))
from assistant_store import AssistantStore
from plan_commands import PlanCommandError

class AssistantLifecycleTest(unittest.TestCase):
    def setUp(self):
        base = ROOT / 'tests' / '.tmp'
        base.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(base.resolve()))
        self.addCleanup(self.temp.cleanup)
        self.store = AssistantStore(Path(self.temp.name) / 'sessions.sqlite3')
        self.plan = {'version': 1, 'meals': [{'date': '2026-10-01', 'meal_type': 'dinner', 'dishes': [{'id': 1, 'type': 'meat', 'locked': True}]}]}
        self.store.create('user:1', 'one', {'plan': self.plan, 'plan_history': [copy.deepcopy(self.plan)], 'next_plan_version': 2})
        self.command = {'request_id': 'keep-one', 'action': 'release', 'plan_version': 1, 'date': '2026-10-01', 'meal_type': 'dinner', 'dish_id': 1}

    def test_all_actual_generation_stages_block_commands(self):
        task = self.store.create_task('one', 'user:1', 'generate', 'task-one')
        for stage in ('queued', 'understanding', 'querying', 'planning', 'validating'):
            with self.subTest(stage=stage):
                self.store.update_task(task['task_id'], 'user:1', status=stage)
                with self.assertRaisesRegex(ValueError, '等待'):
                    self.store.command_plan('one', 'user:1', self.command, [])
        self.assertEqual(1, self.store.get('one', 'user:1')['state']['plan']['version'])

    def test_date_picker_iso_value_takes_priority_over_relative_wording(self):
        import re
        from datetime import date, datetime, timedelta
        tree=ast.parse((ROOT/'recommend-service/assistant_engine.py').read_text(encoding='utf-8'))
        node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_parse_dates')
        namespace=dict(globals(),re=re,date=date,datetime=datetime,timedelta=timedelta)
        exec(compile(ast.Module(body=[node],type_ignores=[]),'assistant_engine.py','exec'),namespace)
        self.assertEqual(['2026-10-20'],namespace['_parse_dates']('2026-10-20 早餐，4个人。今天想清淡',datetime(2026,10,2)))
        with self.assertRaises(PlanCommandError): namespace['_parse_dates']('2026-02-30 早餐',datetime(2026,10,2))

    def test_replay_and_owner_checks(self):
        first = self.store.command_plan('one', 'user:1', self.command, [])
        self.assertEqual(first, self.store.command_plan('one', 'user:1', self.command, []))
        self.assertEqual(2, first['plan']['version'])
        with self.assertRaises(ValueError): self.store.command_plan('one', 'user:2', self.command, [])
        with self.assertRaises(ValueError): self.store.command_plan('one', 'user:1', dict(self.command, action='keep'), [])

    def test_two_concurrent_commands_cannot_overwrite_a_new_version(self):
        def submit(number):
            try:
                self.store.command_plan('one', 'user:1', dict(self.command, request_id='release-' + str(number)), [])
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(2) as pool:
            self.assertEqual(1, sum(pool.map(submit, [1, 2])))
        self.assertEqual(2, self.store.get('one', 'user:1')['state']['plan']['version'])

    def test_rule_lock_error_finishes_task_and_allows_next_message(self):
        # Load the actual runtime class without constructing provider/DB singletons.
        tree = ast.parse((ROOT / 'recommend-service' / 'agent_runtime.py').read_text(encoding='utf-8'))
        runtime_node = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'AgentRuntime')
        stages = next(node for node in tree.body if isinstance(node, ast.Assign) and any(getattr(target, 'id', '') == 'STAGES' for target in node.targets))
        def reject(*args, **kwargs): raise PlanCommandError('已保留的菜不可被替换')
        namespace = dict(globals(), assistant_engine=SimpleNamespace(handle_message=reject),
            STAGES=ast.literal_eval(stages.value), TaskInProgressError=RuntimeError,
            policy_hash=lambda: 'test', default_model_client=lambda: None)
        exec(compile(ast.Module(body=[runtime_node], type_ignores=[]), 'agent_runtime.py', 'exec'), namespace)
        previous = os.environ.get('ASSISTANT_AGENT_MODE')
        os.environ['ASSISTANT_AGENT_MODE'] = 'rule'
        try:
            result = namespace['AgentRuntime'](self.store).run('new date', 'user:1', 'one', 'generation-one')
        finally:
            if previous is None: os.environ.pop('ASSISTANT_AGENT_MODE', None)
            else: os.environ['ASSISTANT_AGENT_MODE'] = previous
        self.assertEqual('needs_input', result['task']['status'])
        self.assertEqual(self.plan, result['plan'])
        self.assertIn('解除', result['reply'])
        self.store.create_task('one', 'user:1', 'next message', 'generation-two')

if __name__ == '__main__': unittest.main()
