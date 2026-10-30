"""Offline failure/identity tests for source-preserving official enrichment."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/enrich_canonical_nutrition.py"
spec = importlib.util.spec_from_file_location("enrich_canonical_nutrition", SCRIPT)
enrich = importlib.util.module_from_spec(spec)
spec.loader.exec_module(enrich)


class EnrichmentTests(unittest.TestCase):
    def setUp(self):
        self.facts = {key: index + 0.25 for index, key in enumerate(enrich.NUTRIENTS)}
        self.definition = {"id": "onion", "name": "大葱（生）", "unit": "g", "gramsPerUnit": 1,
            "procurementYield": None, "definitionKnowledge": "identity_only", "nutritionPer100g": None,
            "specification": {"form": "生"}, "allergens": None, "compositionSource": {"description": "identity"}}
        self.source = {"ingredients": [copy.deepcopy(self.definition)]}
        self.rule = {"ingredientId": "onion", "expectedName": "大葱（生）", "archive": "official.zip",
            "sourceId": "one", "expectedSourceName": "山東大蔥", "equivalenceEvidence": "same raw net edible species and form"}
        self.rule["expectedDefinitionSha256"] = enrich.definition_sha(self.definition)
        self.rules = {"version": "exact-v1", "matches": [self.rule]}
        self.record = {"id": "one", "name": "山東大蔥", "description": "生净葱", "archive": "official.zip",
                       "publisher": "TFDA", "nutrients": self.facts}
        self.records = {("official.zip", "one"): self.record}
        self.archives = {"official.zip": {"sha256": "a" * 64, "url": "https://example.test/official"}}

    def apply(self):
        return enrich.apply_rules(self.source, self.rules, self.records, self.archives)

    def test_only_nutrition_and_provenance_change_and_original_is_unchanged(self):
        original = copy.deepcopy(self.source)
        result, changes = self.apply()
        self.assertEqual(self.source, original)
        item = result["ingredients"][0]
        self.assertEqual(item["nutritionPer100g"], self.facts)
        self.assertIsNone(item["procurementYield"])
        self.assertIsNone(item["allergens"])
        self.assertEqual(item["gramsPerUnit"], 1)
        self.assertEqual(item["definitionKnowledge"], "identity_only")
        self.assertEqual(changes[0]["before"], self.definition)
        self.assertEqual(item["compositionSource"]["archiveSha256"], "a" * 64)

    def test_missing_official_nutrient_is_rejected_not_zero_filled(self):
        del self.facts["fiberG"]
        with self.assertRaisesRegex(ValueError, "Incomplete official"):
            self.apply()

    def test_known_nutrition_cannot_be_replaced(self):
        self.source["ingredients"][0]["nutritionPer100g"] = self.facts
        with self.assertRaisesRegex(ValueError, "replace known"):
            self.apply()

    def test_target_identity_drift_is_rejected(self):
        self.source["ingredients"][0]["name"] = "小葱（生）"
        with self.assertRaisesRegex(ValueError, "Target identity drift"):
            self.apply()

    def test_source_identity_drift_is_rejected(self):
        self.record["name"] = "熟大葱"
        with self.assertRaisesRegex(ValueError, "Source identity drift"):
            self.apply()

    def test_same_name_with_changed_processing_specification_is_rejected(self):
        self.source["ingredients"][0]["specification"]["form"] = "cooked"
        with self.assertRaisesRegex(ValueError, "Target specification/provenance drift"):
            self.apply()

    def test_duplicate_rule_is_rejected(self):
        self.rules["matches"].append(self.rule)
        with self.assertRaisesRegex(ValueError, "Duplicate mapping"):
            self.apply()

    def test_mapping_without_reviewed_equivalence_is_rejected(self):
        self.rule["equivalenceEvidence"] = ""
        with self.assertRaisesRegex(ValueError, "equivalence justification"):
            self.apply()

    def test_negative_or_nonfinite_or_boolean_source_nutrient_is_rejected(self):
        for value in (-1, float("inf"), float("nan"), True):
            with self.subTest(value=value):
                self.facts["energyKcal"] = value
                with self.assertRaisesRegex(ValueError, "Invalid official"):
                    self.apply()

    def test_published_estimate_requires_explicit_adoption_and_keeps_marker(self):
        self.record["publishedEstimates"] = ["fiberG"]
        self.record["rawNutrientCells"] = {"fiberG": "(0)"}
        with self.assertRaisesRegex(ValueError, "Publisher estimate"):
            self.apply()
        self.rule["allowPublishedEstimates"] = True
        result, changes = self.apply()
        self.assertEqual(result["ingredients"][0]["compositionSource"]["publisherEstimatedNutrients"], ["fiberG"])
        self.assertEqual(changes[0]["sourceRecord"]["rawNutrientCells"]["fiberG"], "(0)")

    def test_output_directory_cannot_contain_original(self):
        import argparse
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "original.json"
            path.write_text('{"preserve":"bytes"}', "utf-8")
            with self.assertRaisesRegex(ValueError, "Output must not contain original"):
                enrich.run(argparse.Namespace(source=path, output_dir=Path(directory)))
            self.assertEqual(path.read_text("utf-8"), '{"preserve":"bytes"}')

    def test_strict_json_rejects_duplicate_keys_and_nonfinite(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.json"
            for text in ('{"a":1,"a":2}', '{"a":NaN}'):
                path.write_text(text, "utf-8")
                with self.assertRaises(ValueError):
                    enrich.load(path)

    def test_tfda_conflicting_numeric_rows_fail(self):
        import csv
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=["整合編號", "樣品名稱", "內容物描述", "分析項", "含量單位", "每100克含量"])
        writer.writeheader()
        for amount in ("31", "32"):
            writer.writerow({"整合編號": "one", "樣品名稱": "大蔥", "內容物描述": "生", "分析項": "熱量", "含量單位": "kcal", "每100克含量": amount})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "official.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("20.csv", stream.getvalue())
            with self.assertRaisesRegex(ValueError, "Conflicting TFDA nutrient"):
                enrich.parse_tfda(path)

    def test_baseline_full_state_and_subtotal_are_compared(self):
        actual = {"completeness": "partial", "total": None, "unknownLineIds": ["i1"],
            "unknownReasons": [{"lineId": "i1", "reason": "quantity"}],
            "quantifiedSubtotal": {"total": self.facts, "perServing": None}, "perServing": None}
        catalog = {"recipes": [{"id": 1, "calculatedNutrition": copy.deepcopy(actual)}]}
        enrich.assert_baseline(catalog, {1: actual})
        changed = copy.deepcopy(actual)
        changed["quantifiedSubtotal"]["total"]["energyKcal"] += 1
        with self.assertRaisesRegex(ValueError, "Baseline subtotal mismatch"):
            enrich.assert_baseline(catalog, {1: changed})

    def test_mext_trace_is_unknown_and_publisher_estimate_is_marked(self):
        ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        headers = {"D": "成分識別子", "G": "ENERC_KCAL", "J": "PROT-", "M": "FAT-",
                   "U": "CHOCDF-", "S": "FIB-", "X": "NA"}
        values = {"B": "00001", "D": "Test raw food", "G": "20", "J": "1.2",
                  "M": "0.1", "U": "4.2", "S": "(0)", "X": "Tr"}
        strings = list(dict.fromkeys([*headers.values(), *values.values()]))
        shared = f'<sst xmlns="{ns}">' + "".join('<si><t>' + text + '</t>' +
            ('<rPh sb="0" eb="2"><t>セイブン</t></rPh>' if text == "成分識別子" else '') + '</si>'
            for text in strings) + '</sst>'
        def row(number, mapping):
            return f'<row r="{number}">' + ''.join(
                f'<c r="{col}{number}" t="s"><v>{strings.index(text)}</v></c>'
                for col, text in mapping.items()) + '</row>'
        sheet = f'<worksheet xmlns="{ns}"><sheetData>' + row(12, headers) + row(13, values) + '</sheetData></worksheet>'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "mext.xlsx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("xl/sharedStrings.xml", shared)
                archive.writestr("xl/worksheets/sheet1.xml", sheet)
            record = enrich.parse_mext(path)["00001"]
        self.assertEqual(record["nutrients"]["fiberG"], 0)
        self.assertNotIn("sodiumMg", record["nutrients"])
        self.assertEqual(record["rawNutrientCells"]["sodiumMg"], "Tr")
        self.assertEqual(record["publishedEstimates"], ["fiberG"])

    def test_recipe_amount_mutation_is_rejected(self):
        original = {"recipes": [{"id": 1, "ingredients": [{"quantity": None}], "calculatedNutrition": {}}],
                    "ingredients": [self.definition]}
        changed = copy.deepcopy(original)
        changed["recipes"][0]["ingredients"][0]["quantity"] = 1
        with self.assertRaisesRegex(ValueError, "Recipe content changed"):
            enrich.assert_preservation(original, changed)

    def test_unknown_density_and_yield_cannot_change(self):
        original = {"recipes": [], "ingredients": [self.definition]}
        changed = copy.deepcopy(original)
        changed["ingredients"][0]["procurementYield"] = 1
        with self.assertRaisesRegex(ValueError, "Ingredient semantics changed"):
            enrich.assert_preservation(original, changed)


if __name__ == "__main__":
    unittest.main()
