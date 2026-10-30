import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1]/'scripts'))
from recalculate_main_nutrition import verify_totals, NUTRIENTS

class MainNutritionRecalculationTest(unittest.TestCase):
    def fixture(self):
        d={'food':{'gramsPerUnit':1,'nutritionPer100g':{n:100 for n in NUTRIENTS}}}
        r={'id':1,'ingredients':[{'id':'a','ingredientId':'food','role':'main','defaultEnabled':True,'quantity':200},
             {'id':'b','ingredientId':'food','role':'seasoning','defaultEnabled':True,'quantity':900}]}
        return r,d
    def actual(self,x):return {'quantifiedSubtotal':{'total':{n:x for n in NUTRIENTS}}}
    def test_only_main(self):
        r,d=self.fixture();verify_totals(r,d,self.actual(200))
        with self.assertRaises(ValueError):verify_totals(r,d,self.actual(1100))
    def test_support_is_excluded(self):
        r,d=self.fixture();r['ingredients'][1]['role']='support';verify_totals(r,d,self.actual(200))
    def test_unknown_main_not_inferred(self):
        r,d=self.fixture();r['ingredients'][0]['quantity']=None;verify_totals(r,d,self.actual(0))
    def test_disabled_main(self):
        r,d=self.fixture();r['ingredients'][0]['defaultEnabled']=False;verify_totals(r,d,self.actual(0))
    def test_retention(self):
        r,d=self.fixture();r['ingredients'][0]['nutrientRetention']={n:0.5 for n in NUTRIENTS};verify_totals(r,d,self.actual(100))

if __name__=='__main__':unittest.main()
