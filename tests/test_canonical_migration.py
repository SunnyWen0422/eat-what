import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from canonical_catalog_migration import private_document,same_document

class PersonalMigrationTest(unittest.TestCase):
 def row(self):return {'ID':90001,'NAME':'自家青菜','TYPE':'veg','CL':'青菜 大蒜','INGREDIENTS_AMOUNTS':'青菜 大蒜','STEPS':'清洗#煮熟','FL':None,'user_id':999}
 def test_free_text_content_survives_without_fabricated_amounts_nutrition_or_steps(self):
  source=self.row();recipe,definitions=private_document(source)
  self.assertEqual(recipe['name'],source['NAME']);self.assertEqual(recipe['id'],source['ID'])
  self.assertEqual([s['text'] for s in recipe['steps']],['清洗','煮熟'])
  self.assertEqual([d['name'] for d in definitions],['青菜','大蒜'])
  self.assertTrue(all(x['quantity'] is None for x in recipe['ingredients']))
  self.assertIsNone(recipe['calculatedNutrition']['total']);self.assertIsNone(recipe['baseServings'])
  self.assertEqual(recipe['quantityPolicy'],'fixed-recipe-v1')
 def test_unsupported_numeric_source_stops_instead_of_losing_amount(self):
  source=self.row();source['INGREDIENTS_AMOUNTS']='青菜 200克'
  with self.assertRaisesRegex(ValueError,'quantity format'):private_document(source)
 def test_ownerless_source_cannot_become_a_personal_recipe(self):
  source=self.row();source['user_id']=None
  with self.assertRaisesRegex(ValueError,'owner'):private_document(source)

class NativeJsonRoundtripTest(unittest.TestCase):
 def test_native_double_roundtrip_uses_published_twelve_decimal_output_precision(self):
  self.assertTrue(same_document({'id':'sample','nutrition':{'energyKcal':26.981919332406118}},
                                {'id':'sample','nutrition':{'energyKcal':26.98191933240612}}))
 def test_real_quantity_or_structure_changes_are_not_accepted(self):
  self.assertFalse(same_document({'quantity':26.981919332406},{'quantity':26.981919332416}))
  self.assertFalse(same_document({'id':'a'},{'id':'b'}))
  self.assertFalse(same_document({'quantity':None},{'quantity':0}))
  self.assertFalse(same_document({'optional':True},{'optional':1}))
  self.assertFalse(same_document({'id':'a'},{'id':'a','extra':None}))
