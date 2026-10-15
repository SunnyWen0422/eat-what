import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("maturity_catalog",ROOT/"scripts/catalog_quality.py")
engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)

class CatalogMaturityTest(unittest.TestCase):
    def test_audit_does_not_hide_duplicates_or_private_rows(self):
        rows=[dict(id="1",name="炒蛋",type="meat",cl="鸡蛋",step="炒熟",image="",user_id=""),
              dict(id="1",name="炒蛋",type="meat",cl="鸡蛋",step="",image="javascript:bad",user_id="3"),
              dict(id="2",name="另一道",type="veg",ingredients_amounts="菜|NaN|桶",step="烫熟")]
        audit=engine.audit_catalog(rows)
        self.assertEqual(audit["counts"]["rows"],3)
        self.assertEqual(audit["duplicates"]["idGroups"],1)
        self.assertEqual(audit["duplicates"]["nameGroups"],1)
        self.assertEqual(audit["missing"]["step"],1)
        self.assertGreater(audit["anomalies"]["invalidImageUrls"],0)
        self.assertEqual(audit["anomalies"]["privateRows"],1)
        self.assertGreater(audit["anomalies"]["invalidIngredientLines"],0)
        self.assertEqual(audit,engine.audit_catalog(rows))
        self.assertEqual(rows[1]["image"],"javascript:bad")
    def test_review_queue_is_stratified_and_has_no_fabricated_verification(self):
        rows=[dict(id=str(i+1),name=f"菜{i}",type=t,cl="菜",step="煮熟",source_ref="") for i,t in enumerate(["meat"]*40+["veg"]*40+["soup"]*25+["staple"]*20+["dessert"]*8)]
        q=engine.audit_catalog(rows)["reviewQueue"]
        self.assertEqual(len(q),100)
        from collections import Counter
        self.assertEqual(dict(Counter(x["type"] for x in q)),dict(meat=30,veg=30,soup=20,staple=15,dessert=5))
        self.assertTrue(all(x["reviewStatus"]=="UNKNOWN" and x["sourceHash"] for x in q))
    def test_missing_name_and_numerically_duplicate_ids_are_auditable(self):
        audit=engine.audit_catalog([{"id":"01","name":""},{"id":"1"},{"id":"bad","name":"菜"}])
        self.assertEqual(audit["duplicates"]["idGroups"],1)
        self.assertEqual(audit["anomalies"]["invalidIds"],1)

if __name__=="__main__":unittest.main()
