"""Local lossless JSON transport tests; no app imports, providers or environment."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/split_canonical_delivery.py"
SPEC = importlib.util.spec_from_file_location("split_canonical_delivery", SCRIPT)
delivery = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(delivery)


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.catalog = {"catalogRevision": "原版本", "ingredients": [{"id": "青菜", "quantity": None}],
                        "recipes": [{"id": i, "name": "菜谱中文", "quantity": 0.25,
                                     "steps": ["先洗\n后炒"]} for i in range(30)],
                        "quantityPolicy": "fixed-recipe-v1"}
        self.source = self.root / "original.json"
        self.source.write_bytes((json.dumps(self.catalog, ensure_ascii=False, indent=2) + "\n").replace("\n", "\r\n").encode())
        self.original = self.source.read_bytes()
        self.out = self.root / "parts"

    def split(self):
        return delivery.split(self.source, self.out)

    def paths(self):
        return [self.out / f"runtime-catalog.part-{i}-of-2.json" for i in (1, 2)]

    def alter(self, index, change):
        path = self.paths()[index]
        value = json.loads(path.read_bytes())
        value.pop("partPayloadSha256")
        change(value)
        path.write_bytes(delivery.sealed(value))

    def test_crlf_round_trip_is_byte_exact_and_metadata_occurs_once(self):
        manifest = self.split()
        pieces = [json.loads(path.read_bytes()) for path in self.paths()]
        self.assertIn("metadata", pieces[0])
        self.assertNotIn("metadata", pieces[1])
        self.assertEqual(self.catalog["recipes"], pieces[0]["recipes"] + pieces[1]["recipes"])
        self.assertEqual(list(self.catalog), pieces[0]["rootKeyOrder"])
        self.assertTrue(all(row["bytes"] < 20_000_000 for row in manifest["parts"]))
        result = delivery.join([], self.root / "restored.json", self.out / "manifest.json")
        self.assertEqual(self.original, (self.root / "restored.json").read_bytes())
        self.assertEqual(delivery.sha(self.original), result["sha256"])
        self.assertEqual(self.original, self.source.read_bytes())

    def test_lf_and_compact_supported_profiles_round_trip(self):
        for i, raw in enumerate([(json.dumps(self.catalog, ensure_ascii=False, indent=2) + "\n").encode(), delivery.compact(self.catalog)]):
            source, out, target = self.root / f"source-{i}.json", self.root / f"parts-{i}", self.root / f"joined-{i}.json"
            source.write_bytes(raw)
            delivery.split(source, out)
            delivery.join([], target, out / "manifest.json")
            self.assertEqual(raw, target.read_bytes())

    def test_explicit_ordered_parts_work_but_missing_duplicate_and_reverse_fail(self):
        self.split()
        paths = self.paths()
        for bad in ([paths[0]], [paths[0], paths[0]], paths[::-1], paths + [paths[0]]):
            with self.assertRaises(ValueError):
                delivery.join(bad, self.root / "bad.json")
            self.assertFalse((self.root / "bad.json").exists())
        delivery.join(paths, self.root / "good.json")
        self.assertEqual(self.original, (self.root / "good.json").read_bytes())

    def test_overlapping_or_missing_recipe_ranges_are_rejected(self):
        self.split()
        for delta in (-1, 1):
            saved = self.paths()[1].read_bytes()
            self.alter(1, lambda part: part.update(recipeStart=part["recipeStart"] + delta,
                                                  recipeEnd=part["recipeEnd"] + delta))
            with self.assertRaisesRegex(ValueError, "segment"):
                delivery.join(self.paths(), self.root / "bad.json")
            self.paths()[1].write_bytes(saved)

    def test_modified_payload_and_resealed_reordered_recipes_are_rejected(self):
        self.split()
        path = self.paths()[0]
        value = json.loads(path.read_bytes())
        value["recipes"][0]["name"] = "tampered"
        path.write_bytes(delivery.compact(value))
        with self.assertRaisesRegex(ValueError, "payload hash"):
            delivery.join(self.paths(), self.root / "bad.json")
        self.alter(0, lambda part: part["recipes"].reverse())
        with self.assertRaisesRegex(ValueError, "SHA256"):
            delivery.join(self.paths(), self.root / "bad.json")

    def test_mixed_source_and_duplicate_metadata_are_rejected(self):
        self.split()
        saved = self.paths()[1].read_bytes()
        self.alter(1, lambda part: part.update(sourceSha256="0" * 64))
        with self.assertRaisesRegex(ValueError, "source identity"):
            delivery.join(self.paths(), self.root / "bad.json")
        self.paths()[1].write_bytes(saved)
        self.alter(1, lambda part: part.update(metadata={}))
        with self.assertRaisesRegex(ValueError, "Metadata"):
            delivery.join(self.paths(), self.root / "bad.json")

    def test_manifest_hash_filename_and_index_validation(self):
        self.split()
        manifest_path = self.out / "manifest.json"
        original = json.loads(manifest_path.read_bytes())
        for mutate in (lambda value: value["parts"].reverse(),
                       lambda value: value["parts"][1].update(file=value["parts"][0]["file"]),
                       lambda value: value["parts"][0].update(file="../original.json"),
                       lambda value: value["parts"][0].update(sha256="0" * 64)):
            value = json.loads(json.dumps(original))
            mutate(value)
            manifest_path.write_bytes(delivery.compact(value))
            with self.assertRaises(ValueError):
                delivery.join([], self.root / "bad.json", manifest_path)
            self.assertFalse((self.root / "bad.json").exists())

    def test_existing_outputs_source_and_parts_never_overwritten(self):
        self.split()
        snapshots = {path: path.read_bytes() for path in self.paths()}
        with self.assertRaises(ValueError):
            self.split()
        for output in [self.source, *self.paths(), self.out / "manifest.json"]:
            with self.assertRaises(ValueError):
                delivery.join(self.paths(), output)
        self.assertEqual(self.original, self.source.read_bytes())
        for path, data in snapshots.items():
            self.assertEqual(data, path.read_bytes())

    def test_strict_byte_limit_and_unsupported_format_refuse_without_outputs(self):
        with self.assertRaises(ValueError):
            delivery.split(self.source, self.out, 500)
        self.assertFalse(self.out.exists())
        self.source.write_bytes(b'{ "recipes" : [ {"id":1}, {"id":2} ] }')
        with self.assertRaisesRegex(ValueError, "serialization"):
            self.split()
        self.assertFalse(self.out.exists())

    def test_duplicate_json_keys_are_rejected(self):
        self.source.write_bytes(b'{"recipes":[],"recipes":[1,2]}')
        with self.assertRaisesRegex(ValueError, "Duplicate JSON key"):
            self.split()


if __name__ == "__main__":
    unittest.main()
