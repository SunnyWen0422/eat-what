"""Offline protocol checks; never imports main, credentials, or a provider client."""
import importlib.util
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'recommend-service'))
def module(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'recommend-service'/f'{name}.py')
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

class BalancedContractTest(unittest.TestCase):
    def test_rule_owned_generation_accepts_intent_without_model_chosen_ids(self):
        schema=module('assistant_v4_schema')
        schema.validate({'operation':'generate','selectionMode':'recommend','contextPatch':{'recommendationPreferences':{'includeTagCodes':['LIGHT']},'expectedTotalCookMinutes':20,'candidateScope':'all'}},schema.ACTION_ARGUMENTS['draft_update'])
    def test_home_text_interpreter_returns_wishes_without_selecting_dishes(self):
        agent=module('workspace_agent');context={'date':'2026-10-21','mealType':'dinner','recommendationPolicy':'balanced-v1'}
        result=agent.validate_result({**context,'needsInput':False,'constraintsUnderstood':True,'dishIds':[],'criteria':{'excludedIngredients':['花生']},'recommendationPreferences':{'includeTagCodes':['LIGHT']}},context,set())
        self.assertEqual(['LIGHT'],result['recommendationPreferences']['includeTagCodes']);self.assertEqual([],result['dishIds'])
    def test_explicit_named_selection_still_requires_sourced_ids(self):
        agent=module('workspace_agent');context={'date':'2026-10-21','mealType':'dinner','recommendationPolicy':'balanced-v1'}
        with self.assertRaises(ValueError):agent.validate_result({**context,'needsInput':False,'constraintsUnderstood':True,'selectionMode':'explicit','dishIds':[99]},context,{1})

if __name__=='__main__':unittest.main()
