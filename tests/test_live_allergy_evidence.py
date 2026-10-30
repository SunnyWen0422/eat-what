"""Strict canonical-ID allergy checks; no DB/network/provider."""
import copy
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from daily_menu_live_review import check_case

class AllergyEvidenceTests(unittest.TestCase):
    def test_canonical_identity_not_only_chinese_text(self):
        before={'draft':{'dishes':[{'id':1},{'id':2}]}}
        after={'context':{'criteria':{'excludedIngredients':['花生']}},'draft':{'dishes':[
            {'id':3,'recipe':{'allergenCodes':[],'ingredients':[{'ingredientId':'vegetable'}]}},
            {'id':4,'recipe':{'allergenCodes':[],'ingredients':[{'ingredientId':'oil'}]}}]}}
        definitions={'vegetable':{'id':'vegetable','name':'青菜','allergens':[]},'oil':{'id':'oil','name':'食用油','allergens':[]}}
        check_case('allergy',before,after,{}, {}, {'status':'completed'},definitions)
        nullable=copy.deepcopy(after);nullable['draft']['dishes'][0]['recipe']['allergenCodes']=None
        check_case('allergy',before,nullable,{}, {}, {'status':'completed'},definitions)
        variants=[{'id':'oil','name':'花生油'}, {'id':'oil-peanut','name':'油'},
                  {'id':'oil','name':'油','aliases':['花生油']}, {'id':'oil','name':'油','allergens':['peanut']}]
        for definition in variants:
            with self.subTest(definition=definition),self.assertRaises(AssertionError):
                check_case('allergy',before,after,{}, {}, {'status':'completed'},{**definitions,'oil':definition})
        for missing in (None,{}, {'vegetable':definitions['vegetable']}):
            with self.subTest(missing=missing),self.assertRaises(AssertionError):
                check_case('allergy',before,after,{}, {}, {'status':'completed'},missing)
        changed=copy.deepcopy(after);changed['draft']['dishes'][0]['recipe']['allergenCodes']=['ALLERGEN_PEANUT']
        with self.assertRaises(AssertionError):check_case('allergy',before,changed,{}, {}, {'status':'completed'},definitions)

if __name__=='__main__':unittest.main()
