import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'recommend-service'))
from plan_commands import apply_command, PlanCommandError, next_plan_state

class PlanCommandsTest(unittest.TestCase):
    def setUp(self):
        self.plan = {'version': 1, 'period': {'people': 2}, 'meals': [{'date': '2026-10-01', 'meal_type': 'dinner', 'dishes': [{'id': 1, 'name': '鱼', 'type': 'meat'}, {'id': 2, 'name': '汤', 'type': 'soup'}]}]}
        self.state = {'plan': self.plan, 'plan_history': [copy.deepcopy(self.plan)], 'next_plan_version': 2}
        self.target = {'plan_version': 1, 'date': '2026-10-01', 'meal_type': 'dinner', 'dish_id': 1}
    def test_lock_persists_and_prevents_replacing_specific_dish(self):
        locked = apply_command(self.state, dict(self.target, action='keep'), [])
        self.assertTrue(locked['plan']['meals'][0]['dishes'][0]['locked'])
        self.assertNotIn('locked', self.plan['meals'][0]['dishes'][0])
        with self.assertRaises(PlanCommandError):
            apply_command(locked, dict(self.target, plan_version=2, action='replace'), [{'id': 3, 'name': '肉', 'type': 'meat'}])
    def test_replace_targets_only_one_slot_and_undo_keeps_monotonic_version(self):
        changed = apply_command(self.state, dict(self.target, action='replace'), [{'id': 3, 'name': '肉', 'type': 'meat'}])
        self.assertEqual(3, changed['plan']['meals'][0]['dishes'][0]['id'])
        self.assertEqual(2, changed['plan']['meals'][0]['dishes'][1]['id'])
        restored = apply_command(changed, {'action': 'undo', 'plan_version': 2}, [])
        self.assertEqual(1, restored['plan']['meals'][0]['dishes'][0]['id'])
        self.assertEqual(3, restored['plan']['version'])
    def test_model_cannot_remove_locked_dish_and_howto_keeps_plan(self):
        locked = apply_command(self.state, dict(self.target, action='keep'), [])
        self.assertEqual(2, next_plan_state(locked, None)['plan']['version'])
        other = copy.deepcopy(self.plan); other['meals'][0]['dishes'][0]['id'] = 3
        with self.assertRaises(PlanCommandError): next_plan_state(locked, other)

if __name__ == '__main__': unittest.main()
