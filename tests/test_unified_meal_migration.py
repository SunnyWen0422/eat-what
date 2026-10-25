import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('unify',Path(__file__).parents[1]/'scripts/unify_meal_records.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class MergeTest(unittest.TestCase):
 def plan(self,**kw):return dict(user_id=1,record_date='2026-10-25',meal_type='dinner',recipe_name='旧菜',dish_details='[]',dish_ids='[]',revision=2,is_deleted=0,update_time='2026-10-25 10:00:00',**kw)
 def actual(self,status='eaten',**kw):return dict(user_id=1,meal_date='2026-10-25',meal_type='dinner',status=status,actual_dishes_json='[{"name":"改为面条"}]',updated_at='2026-10-25 11:00:00',**kw)
 def test_latest_correction_wins_once_and_original_is_unchanged(self):
  p=self.plan();rows,audit=module.merge_records([p],[self.actual()]);self.assertEqual(rows[0]['recipe_name'],'改为面条');self.assertEqual(p['recipe_name'],'旧菜');self.assertEqual(audit[0]['reason'],'preserve_actual_correction')
 def test_later_calendar_edit_or_deletion_wins(self):
  for deleted in [0,1]:
   p=self.plan();p.update(update_time='2026-10-25 12:00:00',is_deleted=deleted);rows,_=module.merge_records([p],[self.actual()]);self.assertEqual(rows,[p])
 def test_skipped_removes_record_but_withdrawn_actual_keeps_calendar(self):
  self.assertEqual(module.merge_records([self.plan()],[self.actual('skipped')])[0][0]['is_deleted'],1)
  self.assertEqual(module.merge_records([self.plan()],[self.actual('unrecorded')])[0],[self.plan()])
 def test_actual_only_free_text_kept_no_nutrition_invented(self):
  rows,_=module.merge_records([],[self.actual()]);self.assertEqual(len(rows),1);self.assertNotIn('recipe',module.decoded(rows[0]['dish_details'],[])[0])
 def test_account_and_slot_isolation(self):
  p=self.plan();p['user_id']=2;rows,_=module.merge_records([p],[self.actual()]);self.assertEqual(len(rows),2);self.assertEqual(rows[0],p)
 def test_malformed_records_fail_instead_of_silent_data_loss(self):
  a=self.actual();a['actual_dishes_json']='[]'
  with self.assertRaises(ValueError):module.merge_records([], [a])
 def test_historical_names_types_quantities_and_custom_menu_name_are_kept(self):
  p=self.plan();p['recipe_name']='我的周末菜单';p['dish_details']=module.encoded([{'id':9,'name':'曾经的鱼','type':'meat','recipe':{'ingredients':[{'quantity':'适量'}],'calculatedNutrition':{'completeness':'complete','total':{'energyKcal':999}}}}])
  a=self.actual();a['actual_dishes_json']=module.encoded([{'dishId':'9','name':'原记录的鱼'},{'dishId':10,'name':'已下架菜','type':'veg'},{'name':'外食面条'}])
  row=module.merge_records([p],[a])[0][0];details=module.decoded(row['dish_details'],[])
  self.assertEqual(row['recipe_name'],'我的周末菜单');self.assertEqual([x['name'] for x in details],['原记录的鱼','已下架菜','外食面条'])
  self.assertEqual(details[0]['type'],'meat');self.assertEqual(details[0]['recipe']['ingredients'][0]['quantity'],'适量')
  self.assertIsNone(details[0]['recipe']['calculatedNutrition']['total']);self.assertEqual(module.decoded(row['dish_ids'],[]),[9,10])
 def test_historical_nutrition_is_not_replaced_with_new_catalog_values(self):
  a=self.actual();a['actual_dishes_json']=module.encoded([{'name':'汤','nutritionSnapshot':{'basis':'recipe_baseline','baseServings':2,'completeness':'complete','total':{'energyKcal':100.6}}}])
  detail=module.decoded(module.merge_records([],[a])[0][0]['dish_details'],[])[0]
  self.assertEqual(detail['recipe']['calculatedNutrition']['total']['energyKcal'],100.6)
  self.assertEqual(detail['recipe']['baseServings'],2)
if __name__=='__main__':unittest.main()
