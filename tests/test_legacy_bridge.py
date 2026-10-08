import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class LegacyBridgeTest(unittest.TestCase):
    def engine(self):
        p=ROOT/'scripts/bridge_legacy_local.py';self.assertTrue(p.exists(),'local bridge missing')
        spec=importlib.util.spec_from_file_location('bridge',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
    def test_remote_and_existing_business_names_are_rejected(self):
        m=self.engine()
        for value in [{'environment':'local','dbHost':'60.205.194.136','database':'food'},{'environment':'local','dbHost':'127.0.0.1','database':'food'}]:
            with self.assertRaises(ValueError):m.validate_target(value)
    def test_anonymization_keeps_ids_and_relationships_but_removes_auth(self):
        m=self.engine();row={'id':7,'open_id':'original','session_key':'secret','phone':'123','avatar':'url','nickname':'private','status':1}
        anonymous=m.anonymize_user(row,'salt');self.assertEqual(anonymous['id'],7);self.assertNotIn('original',str(anonymous));self.assertEqual(anonymous['session_key'],None);self.assertEqual(anonymous['phone'],None)
        self.assertEqual(anonymous,m.anonymize_user(row,'salt'))
    def test_unknown_lineage_and_invalid_source_date_fail_closed(self):
        m=self.engine()
        with self.assertRaises(ValueError):m.validate_lineage(['V9__unknown'])
        with self.assertRaises(ValueError):m.validate_source_date('2026-02-31')
        self.assertEqual(m.validate_source_date('2026-10-08'),'2026-10-08')
    def test_resume_restores_parent_rows_before_children_even_when_all_tables_exist(self):
        m=self.engine();ddl={'shopping_dish':'FOREIGN KEY (`list_id`) REFERENCES `shopping_list` (`id`)', 'shopping_list':'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)', 'users':'CREATE TABLE users'}
        self.assertEqual(m.restoration_order(ddl),['users','shopping_list','shopping_dish'])
        with self.assertRaises(ValueError):m.restoration_order({'child':'REFERENCES `missing` (`id`)'})
    def test_quality_package_cannot_rebind_old_evidence_to_changed_recipe(self):
        import sys
        sys.path.insert(0,str(ROOT/'scripts'))
        from catalog_quality import digest
        m=self.engine();original={'id':'1','name':'旧菜谱'};profile={'dishId':1,'sourceHash':digest(original),'datasetVersion':'v1'};profile['contentHash']=digest(profile)
        m.validate_profile_sources([profile],[original],[{'id':1,'name':'旧菜谱'}],'v1')
        with self.assertRaisesRegex(ValueError,'differs from backup'):
            m.validate_profile_sources([profile],[original],[{'id':1,'name':'新菜谱'}],'v1')
        with self.assertRaisesRegex(ValueError,'different source version'):
            m.validate_profile_sources([profile],[original],[{'id':1,'name':'旧菜谱'}],'v2')
if __name__=='__main__':unittest.main()
