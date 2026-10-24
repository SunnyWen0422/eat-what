import copy,json,os,unittest
from pathlib import Path
from canonical_catalog_import import validate_bundle, assert_owned_target

class CatalogImportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle=json.loads(Path(os.environ['CANONICAL_CATALOG_PATH']).read_text('utf-8'))
    def test_all_recipes_have_one_resolvable_structure(self):
        result=validate_bundle(self.bundle)
        self.assertEqual(result['recipes'],5407)
        self.assertEqual(result['mapped'],5450)
        self.assertTrue(any(l['quantity'] is None for r in self.bundle['recipes'] for l in r['ingredients']))
        self.assertEqual(sum(r['baseServings'] is None for r in self.bundle['recipes']),5)
    def test_null_is_not_zero_and_partial_nutrition_cannot_have_total(self):
        broken=copy.deepcopy(self.bundle)
        row=next(l for r in broken['recipes'] for l in r['ingredients'] if l['quantity'] is None)
        row['quantity']=0
        with self.assertRaises(ValueError):validate_bundle(broken)
        broken=copy.deepcopy(self.bundle)
        row=next(r for r in broken['recipes'] if r['calculatedNutrition']['completeness']=='partial')
        row['calculatedNutrition']['total']={}
        with self.assertRaises(ValueError):validate_bundle(broken)
    def test_duplicate_or_missing_ingredient_rejects_entire_import(self):
        broken=copy.deepcopy(self.bundle);broken['ingredients'].pop(0)
        with self.assertRaises(ValueError):validate_bundle(broken)
        broken=copy.deepcopy(self.bundle);broken['recipes'].append(broken['recipes'][0])
        with self.assertRaises(ValueError):validate_bundle(broken)
    def test_bad_quantity_and_step_reference_rejected_before_db(self):
        for field,value in [('quantity',-1),('unit','unknown')]:
            broken=copy.deepcopy(self.bundle);broken['recipes'][0]['ingredients'][0][field]=value
            with self.assertRaises(ValueError):validate_bundle(broken)
        broken=copy.deepcopy(self.bundle);broken['recipes'][0]['steps'][0]['ingredientLineIds']=['missing']
        with self.assertRaises(ValueError):validate_bundle(broken)
    def test_remote_or_other_database_rejected(self):
        for host,db in [('example.com','eatwhat_catalog_local_1234abcd'),('127.0.0.1','food'),('localhost','eatwhat_catalog_local_1234abcd')]:
            with self.assertRaises(ValueError):assert_owned_target(host,db)
        assert_owned_target('127.0.0.1','eatwhat_catalog_local_1234abcd')
    def test_runtime_has_only_fixed_recipe_quantities(self):
        self.assertEqual(self.bundle['quantityPolicy'],'fixed-recipe-v1')
        self.assertTrue(all('scaling' not in r for r in self.bundle['recipes']))
        self.assertTrue(all('scaleRule' not in l for r in self.bundle['recipes'] for l in r['ingredients']))
        self.assertTrue(all(r['calculatedNutrition']['perServing'] is None for r in self.bundle['recipes']))
        for change in ('policy','recipe_rule','line_rule'):
            broken=copy.deepcopy(self.bundle)
            if change=='policy':broken['quantityPolicy']='linear'
            elif change=='recipe_rule':broken['recipes'][0]['scaling']={'mode':'linear'}
            else:broken['recipes'][0]['ingredients'][0]['scaleRule']={'type':'linear'}
            with self.assertRaises(ValueError):validate_bundle(broken)

if __name__=='__main__':unittest.main()
