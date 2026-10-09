import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class AuthorizedCatalogTest(unittest.TestCase):
    def engine(self):
        p=ROOT/'recommend-service/authorized_catalog.py';self.assertTrue(p.exists(),'authorized catalog missing');spec=importlib.util.spec_from_file_location('catalog',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
    def ctx(self):return {'ownerUserId':7,'catalog':[{'id':1,'name':'本人私房鱼','type':'meat','cl':'鱼 姜','steps':'蒸熟'},{'id':2,'name':'青菜','type':'veg','cl':'青菜','cookMinutes':10}]}
    def test_foreign_scope_and_unlisted_dish_are_rejected(self):
        m=self.engine()
        with self.assertRaises(ValueError):m.execute_read_tool(self.ctx(),8,'get_dish_details',{'dish_ids':[1]})
        with self.assertRaises(ValueError):m.execute_read_tool(self.ctx(),7,'get_dish_details',{'dish_ids':[9]})
    def test_private_recipe_is_searchable_only_in_its_authorized_catalog(self):
        m=self.engine();result=m.execute_read_tool(self.ctx(),7,'search_dishes',{'query':'私房','top_k':10});self.assertEqual([r['id'] for r in result],[1])
        self.assertEqual([r['id'] for r in m.execute_read_tool(self.ctx(),7,'search_by_ingredients',{'ingredients':['青菜']})],[2])
    def test_unknown_filters_and_writes_are_never_silently_ignored(self):
        m=self.engine()
        with self.assertRaises(ValueError):m.execute_read_tool(self.ctx(),7,'search_dishes',{'filters':{'invented':True}})
        with self.assertRaises(ValueError):m.execute_read_tool(self.ctx(),7,'create_calendar_records',{})
    def test_included_tags_match_any_selected_tag_and_exclusions_still_apply(self):
        m=self.engine();context={'ownerUserId':7,'catalog':[
            {'id':1,'name':'家常菜','tagCodes':'HOME_STYLE'},
            {'id':2,'name':'少油菜','tagCodes':'LOW_OIL'},
            {'id':3,'name':'其他菜','tagCodes':'OTHER'},
            {'id':4,'name':'少油家常菜','tagCodes':'HOME_STYLE,LOW_OIL'},
        ]}
        for tool in ['search_dishes','search_by_ingredients']:
            with self.subTest(tool=tool):
                filters={'include_tag_codes':['HOME_STYLE','LOW_OIL']}
                self.assertEqual([r['id'] for r in m.execute_read_tool(context,7,tool,{'filters':filters})],[1,2,4])
                filters['exclude_tag_codes']=['LOW_OIL']
                self.assertEqual([r['id'] for r in m.execute_read_tool(context,7,tool,{'filters':filters})],[1])
if __name__=='__main__':unittest.main()
