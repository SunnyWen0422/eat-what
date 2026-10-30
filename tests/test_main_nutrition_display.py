import copy
import unittest
from assistant_v4_isolation import isolated_service
from canonical_catalog_fixture import canonical_row

class MainNutritionDisplayTest(unittest.TestCase):
    def test_projection_keeps_scope_and_does_not_relabel_old_calculation(self):
        with isolated_service():
            from canonical_catalog import project_recipe
            source=canonical_row()['recipe']
            definition=source['ingredients'][0].pop('ingredient')
            metadata={'catalogContractVersion':4,'quantityPolicy':'fixed-recipe-v1','catalogRevision':'main-fixture'}
            source['calculatedNutrition']={'scope':'main_ingredients','description':'主料营养参考','ruleVersion':'eatwhat-main-ingredients-20261029-v1','completeness':'partial','total':None,'perServing':None,'includedMainCount':1,'unknownLineIds':['i1']}
            result=project_recipe(source,{definition['id']:definition},metadata)['recipe']['calculatedNutrition']
            self.assertEqual('main_ingredients',result['scope'])
            self.assertEqual('主料营养参考',result['description'])
            self.assertNotIn('unknownLineIds',result)
            del source['calculatedNutrition']['scope']
            self.assertNotIn('scope',project_recipe(source,{definition['id']:definition},metadata)['recipe']['calculatedNutrition'])

    def test_assistant_accepts_main_scope_in_actual_nutrition(self):
        with isolated_service():
            from assistant_v4_schema import ACTUAL_NUTRITION,validate,StepValidationError
            result={'scope':'main_ingredients','description':'主料营养参考，不含调味料及辅料','basis':'recipe_baseline','personalIntakeAvailable':False,'entryCount':1,'coveredCount':0,'unknownCount':1,'complete':False,'knownTotal':None,'total':None}
            validate(result,ACTUAL_NUTRITION)
            with self.assertRaises(StepValidationError):validate(dict(result,scope='invented_scope'),ACTUAL_NUTRITION)

    def test_recipe_read_result_accepts_main_scope_and_no_main_reason(self):
        with isolated_service():
            from assistant_v4_schema import read_result,StepValidationError
            nutrition={'scope':'main_ingredients','description':'主料营养参考，不含调味料及辅料','ruleVersion':'eatwhat-main-ingredients-20261029-v1','completeness':'partial','total':None,'perServing':None,'includedMainCount':0,'unavailableReason':'no_enabled_main_ingredients','perServingUnavailableReason':'diners_not_specified'}
            result={'callId':'nutrition','name':'get_dish_details','items':[{'id':1,'nutrition':nutrition}],'truncated':False}
            read_result(result)
            nutrition['untrustedField']=True
            with self.assertRaises(StepValidationError):read_result(result)

    def test_model_guidance_cannot_call_main_reference_whole_dish_intake(self):
        from pathlib import Path
        source=(Path(__file__).parents[1]/'recommend-service'/'assistant_v4_step.py').read_text(encoding='utf-8')
        self.assertIn('scope=main_ingredients',source)
        self.assertIn('不能称整道菜总热量或个人实际摄入',source)
        self.assertIn('不自行补算调味料',source)

if __name__=='__main__':unittest.main()
