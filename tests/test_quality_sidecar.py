import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / '.test-artifacts/quality-sidecar'
SCRATCH.mkdir(parents=True, exist_ok=True)


class QualitySidecarTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('quality_sidecar', ROOT / 'scripts/quality_sidecar.py')
        cls.helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.helper)

    def fixture(self, root):
        h = self.helper
        original = {field: '' for field in h.SOURCE_FIELDS}
        original.update(id='1', name='原配方', type='veg', cl='青菜', steps='炒熟', is_custom='0', kcal='0')
        profile = {'dishId': 1, 'datasetVersion': 'test-quality', 'sourceHash': h.digest(original), 'reviewStatus': 'UNREVIEWED', 'ingredients': [{'name': '青菜', 'quantityStatus': 'UNKNOWN', 'quantityValue': None}], 'basePeople': None}
        profile['contentHash'] = h.digest(profile)
        for name, value in [('source-recipes.jsonl', original), ('quality.jsonl', profile)]:
            (root / name).write_text(json.dumps(value, ensure_ascii=False) + '\n', encoding='utf-8')
        manifest = {'formatVersion': 1, 'datasetVersion': 'test-quality', 'recipeCount': 1, 'files': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in ['source-recipes.jsonl', 'quality.jsonl']}}
        (root / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
        live = dict(original, id=1, user_id=None, is_custom=0, kcal=0, cook_minutes=None, metadata_version=0)
        return live

    def test_attests_sources_and_binds_profile_to_actual_recipe_without_promoting_unknowns(self):
        with tempfile.TemporaryDirectory(dir=SCRATCH) as directory:
            root = Path(directory); live = self.fixture(root)
            prepared = root / 'prepared.jsonl'
            report = self.helper.prepare(root, iter([live]), prepared)
            profile = json.loads(prepared.read_text(encoding='utf-8'))
            self.assertEqual(report['recipeCount'], 1)
            self.assertEqual(profile['reviewStatus'], 'UNREVIEWED')
            self.assertIsNone(profile['ingredients'][0]['quantityValue'])
            self.assertEqual(profile['sourceRecipeVersion'], self.helper.raw_recipe_version(live))
            self.assertEqual(profile['contentHash'], self.helper.digest({k: v for k, v in profile.items() if k != 'contentHash'}))

    def test_changed_recipe_or_private_owner_fails_before_any_database_write(self):
        for changes in [{'steps': '已改做法'}, {'user_id': 99}, {'is_custom': 1}]:
            with tempfile.TemporaryDirectory(dir=SCRATCH) as directory:
                root = Path(directory); live = self.fixture(root); live.update(changes)
                with self.assertRaises(ValueError):
                    self.helper.prepare(root, iter([live]), root / 'prepared.jsonl')

    def test_corrupt_bundle_and_missing_source_coverage_fail(self):
        with tempfile.TemporaryDirectory(dir=SCRATCH) as directory:
            root = Path(directory); live = self.fixture(root)
            with self.assertRaises(ValueError): self.helper.prepare(root, iter([]), root / 'missing.jsonl')
            (root / 'quality.jsonl').write_text('changed', encoding='utf-8')
            with self.assertRaises(ValueError): self.helper.prepare(root, iter([live]), root / 'corrupt.jsonl')

    def test_schema_contains_only_two_additive_tables_not_legacy_migration_registry_writes(self):
        schema = self.helper.schema_sql(ROOT / 'backend/db/migrations/V7__catalog_quality.sql')
        self.assertEqual(len(schema), 2)
        for statement in schema:
            self.assertTrue(statement.startswith('CREATE TABLE IF NOT EXISTS dish_quality_'))
            self.assertNotIn('schema_migrations', statement)
            self.assertNotIn('DROP ', statement)
            self.assertNotIn('ALTER ', statement)

    def test_live_recipe_change_after_preflight_rolls_back_before_evidence_inserts(self):
        h = self.helper
        class Cursor:
            description = [('id',), ('name',)]
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, *args):
                self.sql = sql
                if sql.startswith('INSERT'): raise AssertionError('Evidence must not be inserted after recipe drift')
            def fetchone(self): return ('food',)
            def fetchall(self): return [(1, 'Changed after preflight')]
        class Connection:
            host = '127.0.0.1'
            rollback_count = 0
            def cursor(self): return Cursor()
            def begin(self): pass
            def rollback(self): self.rollback_count += 1
            def commit(self): raise AssertionError('Must not commit stale quality evidence')
        with tempfile.TemporaryDirectory(dir=SCRATCH) as directory:
            root = Path(directory); live = self.fixture(root); prepared = root / 'prepared.jsonl'
            report = h.prepare(root, [live], prepared)
            connection = Connection()
            with patch.object(h, 'schema_sql', return_value=[]), patch.object(h, 'validate_schema'):
                with self.assertRaisesRegex(ValueError, 'changed after quality preflight'):
                    h.apply(connection, prepared, report, root / 'unused.sql', 'food')
            self.assertEqual(connection.rollback_count, 1)


if __name__ == '__main__': unittest.main()
