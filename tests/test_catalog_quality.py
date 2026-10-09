import csv
import importlib.util
import json
from pathlib import Path
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]

def recipe(**changes):
    row = dict(id='1', name='快手青椒肉丝', type='meat', cl='猪里脊#肉丝#快手#白糖',
               fl='2名成年人总量+15%冗余', step='猪里脊切丝，加少量糖炒熟', steps='猪里脊切丝###加少量糖炒熟',
               ingredients_amounts='猪里脊|345|克|主料|切丝|2名成年人总量+15%冗余|步骤#肉丝|345|克|主料|切丝|2名成年人总量+15%冗余|菜名#快手|345|克|主料|处理|2名成年人总量+15%冗余|菜名#白糖|55|克|调味料|加入|2名成年人总量+15%冗余|烹饪常规补全',
               kcal='0', image='https://example.invalid/image.jpg', cook_time='20分钟', is_custom='0', user_id='')
    row.update(changes)
    return row

class CatalogQualityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path=ROOT/'scripts/catalog_quality.py'
        if not path.exists(): return
        spec=importlib.util.spec_from_file_location('catalog_quality',path)
        cls.engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.engine)
    def setUp(self):
        self.assertTrue(hasattr(self,'engine'),'catalog quality engine missing')
    def test_generated_numbers_are_unknown_and_original_is_preserved(self):
        result=self.engine.normalize_recipe(recipe())
        q=result['quality']
        self.assertIsNone(q['basePeople']);self.assertEqual(q['servingsStatus'],'UNKNOWN')
        self.assertEqual(q['reviewStatus'],'UNREVIEWED');self.assertIsNone(q['nutritionKcal'])
        sugar=next(x for x in q['ingredients'] if x['name']=='白糖')
        self.assertIsNone(sugar['quantityValue']);self.assertEqual(sugar['quantityStatus'],'UNKNOWN')
        self.assertEqual(sugar['rawQuantity'],'55');self.assertEqual(result['original']['kcal'],'0')
    def test_descriptive_words_are_rejected_with_evidence_not_deleted_silently(self):
        result=self.engine.normalize_recipe(recipe())
        self.assertNotIn('快手',[x['name'] for x in result['quality']['ingredients']])
        self.assertTrue(any(x['code']=='DESCRIPTOR_AS_INGREDIENT' for x in result['issues']))
        self.assertTrue(any(x['oldValue']=='快手' for x in result['changes']))
        self.assertIn('快手',result['original']['ingredients_amounts'])
    def test_possible_alias_duplicates_need_review_and_are_not_merged(self):
        result=self.engine.normalize_recipe(recipe())
        names=[x['name'] for x in result['quality']['ingredients']]
        self.assertIn('猪里脊',names);self.assertIn('肉丝',names)
        self.assertTrue(any(x['code']=='POSSIBLE_ALIAS_DUPLICATE' for x in result['issues']))
    def test_positive_plain_servings_are_not_proof_for_generated_amounts(self):
        result=self.engine.normalize_recipe(recipe(fl='2人'))
        self.assertIsNone(result['quality']['basePeople'])
        self.assertFalse(result['quality']['canScale'])
    def test_real_import_triple_separator_has_no_phantom_empty_ingredients(self):
        row=recipe();row['ingredients_amounts']=row['ingredients_amounts'].replace('#','###')
        result=self.engine.normalize_recipe(row)
        self.assertEqual(len(result['quality']['ingredients']),3)
        self.assertEqual(self.engine.profile_catalog([row])['ingredientCount'],4)
    def test_wrong_review_hash_and_fake_verification_are_rejected(self):
        with self.assertRaises(ValueError):
            self.engine.normalize_recipe(recipe(),review={'dishId':1,'sourceHash':'wrong','reviewStatus':'VERIFIED'})
    def test_duplicate_ids_and_private_rows_are_not_published(self):
        with self.assertRaises(ValueError):self.engine.profile_catalog([recipe(),recipe()])
        with self.assertRaises(ValueError):self.engine.normalize_recipe(recipe(user_id='9',is_custom='1'))
    def test_invalid_material_or_nonpositive_quantity_stops(self):
        for amount in ['肉|1|克','肉|-1|克|主料|切|2人|步骤']:
            with self.assertRaises(ValueError):self.engine.normalize_recipe(recipe(ingredients_amounts=amount))
    def test_bundle_keeps_ids_hashes_and_refuses_overwrite(self):
        area=ROOT/'.test-artifacts/catalog-quality'/uuid.uuid4().hex;area.mkdir(parents=True)
        source=area/'source.csv'
        with source.open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(recipe()));w.writeheader();w.writerow(recipe())
        before=source.read_bytes();out=area/'bundle'
        manifest=self.engine.build_bundle(source,out)
        self.assertEqual(source.read_bytes(),before);self.assertEqual(manifest['recipeCount'],1)
        facts=[json.loads(x) for x in (out/'quality.jsonl').read_text(encoding='utf-8').splitlines()]
        self.assertEqual(facts[0]['dishId'],1);self.assertEqual(facts[0]['reviewStatus'],'UNREVIEWED')
        with self.assertRaises(FileExistsError):self.engine.build_bundle(source,out)
    def test_profile_covers_missingness_duplicates_and_distribution(self):
        result=self.engine.profile_catalog([recipe(),recipe(id='2',name='另一道菜',type='veg',image='')])
        self.assertEqual(result['rows'],2);self.assertEqual(result['missing']['image'],1)
        self.assertEqual(result['categories'],{'meat':1,'veg':1})
        self.assertEqual(result['duplicateIds'],0);self.assertIn('quantityDistribution',result)

if __name__=='__main__':unittest.main()
