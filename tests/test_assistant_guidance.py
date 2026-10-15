import unittest
from assistant_v4_isolation import isolated_service
from test_assistant_v4_step import body
class AssistantGuidanceTest(unittest.TestCase):
    def test_new_read_tools_are_only_offered_when_registered_as_enabled(self):
        with isolated_service():
            from assistant_v4_schema import tool_catalog,TOOL_ARGUMENTS,validate,StepValidationError
            names=['get_recommendation_options','read_favorites','read_saved_menus']
            self.assertEqual(set(names),{x['name'] for x in tool_catalog(names)})
            validate({'query':'家常','limit':20},TOOL_ARGUMENTS['read_saved_menus'])
            with self.assertRaises(StepValidationError):validate({'limit':21},TOOL_ARGUMENTS['read_favorites'])
            with self.assertRaises(StepValidationError):validate({'userId':8},TOOL_ARGUMENTS['read_favorites'])
    def test_personal_read_results_keep_unknowns_and_menu_identity(self):
        with isolated_service():
            from assistant_v4_schema import read_result,StepValidationError
            result={'callId':'a','name':'read_saved_menus','items':[{'kind':'menu','id':1,'name':'家常','people':2,'dishIds':[10],'version':7}],'truncated':False}
            self.assertEqual(read_result(result)['items'][0]['version'],7)
            result['items'][0]['userId']=3
            with self.assertRaises(StepValidationError):read_result(result)
    def test_validated_choice_stays_data_and_ui_features_are_negotiated(self):
        with isolated_service():
            from assistant_v4_step import prepare_step
            import json
            req=body();req['context']['capabilities']=['clarification_v1','read_favorites']
            req['context']['requestContext']={'clarification':{'kind':'meal_target','originalIntent':'保存菜单','selection':{'date':'2026-10-16'}}}
            messages=prepare_step(req)[0]
            facts=[x['content'] for x in messages if x['role']=='user']
            self.assertTrue(any('originalIntent' in x and '2026-10-16' in x for x in facts))
if __name__=='__main__':unittest.main()
