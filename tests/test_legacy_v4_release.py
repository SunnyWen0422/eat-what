"""Offline release preparation contracts; never opens a database connection."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / '.test-artifacts/legacy-v4-release'
SCRATCH.mkdir(parents=True, exist_ok=True)


def column(kind, nullable=False, default=None, extra='', collation=None):
    return {'columnType': kind, 'nullable': nullable, 'default': default, 'extra': extra, 'collation': collation}


def index(name, names, unique=False):
    return {'name': name, 'unique': unique, 'columns': names, 'prefixLengths': [None] * len(names), 'orders': ['A'] * len(names), 'type': 'BTREE'}


def quality_shapes():
    unicode = 'utf8mb4_unicode_ci'
    return {
        'dish_quality_profile': {'engine': 'InnoDB', 'collation': unicode, 'columns': {
            'dish_id': column('int'), 'dataset_version': column('varchar(80)', collation=unicode),
            'source_hash': column('char(64)', collation='ascii_bin'), 'content_hash': column('char(64)', collation='ascii_bin'),
            'review_status': column('varchar(24)', collation=unicode), 'profile_json': column('json'),
            'updated_at': column('datetime', default='CURRENT_TIMESTAMP')},
            'indexes': [index('PRIMARY', ['dish_id'], True), index('ix_quality_review', ['review_status', 'dish_id'])], 'foreignKeys': []},
        'dish_quality_revision': {'engine': 'InnoDB', 'collation': unicode, 'columns': {
            'id': column('char(64)', collation='ascii_bin'), 'dish_id': column('int'),
            'dataset_version': column('varchar(80)', collation=unicode), 'source_hash': column('char(64)', collation='ascii_bin'),
            'profile_json': column('json'), 'created_at': column('datetime', default='CURRENT_TIMESTAMP')},
            'indexes': [index('PRIMARY', ['id'], True), index('ix_quality_history', ['dish_id', 'created_at'])], 'foreignKeys': []}}


def fixture():
    legacy = ['food', 'users', 'recipe_records', 'shopping_list', 'shopping_dish', 'shopping_item', 'shopping_request_log', 'user_preference', 'schema_migrations']
    shapes = quality_shapes()
    return {'checkedAtUtc': '2026-10-10T02:06:18+00:00', 'database': 'food', 'databaseCollation': 'utf8mb4_0900_ai_ci',
        'credentialSource': '/private/do-not-export.yml', 'tables': [{'table': name, 'engine': 'InnoDB'} for name in legacy + list(shapes)],
        'schemaContracts': shapes,
        'results': [{'kind': 'migration', 'version': name} for name in ['V1__production_hardening', 'V2__admin_console', 'V3__calendar_sync', 'V4__custom_dish_receipts', 'V5__assistant_recipe_provenance']] +
            [{'kind': 'column', 'table': 'users', 'name': 'last_login_time', 'type': 'datetime'},
             {'kind': 'column', 'table': 'recipe_records', 'name': 'id', 'type': 'bigint'},
             {'kind': 'column', 'table': 'shopping_request_log', 'name': 'id', 'type': 'bigint'},
             {'kind': 'column', 'table': 'user_preference', 'name': 'user_id', 'type': 'bigint'},
             {'kind': 'shoppingPreflight', 'calculatedWithUnknownBase': 50}]}


class LegacyV4ReleaseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('prepare_legacy_v4_release', ROOT / 'scripts/prepare_legacy_v4_release.py')
        cls.helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(cls.helper)

    def test_legacy_plan_is_only_fifteen_additive_tables_six_fields_and_counted_status(self):
        plan = self.helper.build_plan([fixture()])
        self.assertEqual(15, len(plan['newTables'])); self.assertEqual(6, len(plan['addedColumns']))
        sql = '\n'.join(step['sql'] for step in plan['steps'])
        self.assertNotIn('INSERT INTO food', sql); self.assertNotIn('schema_migrations', sql)
        self.assertNotIn('last_login_time', sql); self.assertNotIn('DROP ', sql)
        correction = plan['steps'][-1]
        self.assertEqual(50, correction['expectedAffected']); self.assertFalse(correction['changesQuantityOrMoney'])
        self.assertIn('updated_at=updated_at', correction['sql']); self.assertNotIn('quantity_value=', correction['sql'])

    def test_quality_schema_requires_full_shape_and_rejects_same_name_wrong_lengths(self):
        for mutation in ['length', 'missing-metadata', 'wrong-index', 'foreign-key']:
            data = fixture()
            if mutation == 'length': data['schemaContracts']['dish_quality_profile']['columns']['dataset_version']['columnType'] = 'varchar(8)'
            if mutation == 'missing-metadata': del data['schemaContracts']['dish_quality_profile']
            if mutation == 'wrong-index': data['schemaContracts']['dish_quality_profile']['indexes'][0]['columns'] = ['review_status']
            if mutation == 'foreign-key': data['schemaContracts']['dish_quality_profile']['foreignKeys'] = [{'name': 'unexpected', 'columns': ['dish_id'], 'targetTable': 'food', 'targetColumns': ['id'], 'onDelete': 'CASCADE', 'onUpdate': 'RESTRICT'}]
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): self.helper.build_plan([data])

    def test_exact_legacy_lineage_and_explicit_nonnegative_status_count_are_required(self):
        for mutation in ['wrong-lineage', 'extra-lineage', 'missing-count', 'bool-count', 'negative-count']:
            data = fixture()
            if mutation == 'wrong-lineage': data['results'][2]['version'] = 'V3__meal_workflow'
            if mutation == 'extra-lineage': data['results'].append({'kind': 'migration', 'version': 'V4__meal_workspace'})
            if mutation == 'missing-count': data['results'].pop()
            if mutation == 'bool-count': data['results'][-1]['calculatedWithUnknownBase'] = True
            if mutation == 'negative-count': data['results'][-1]['calculatedWithUnknownBase'] = -1
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): self.helper.build_plan([data])

    def test_partial_ddl_resume_skips_only_identical_table_and_column_contracts(self):
        data = fixture(); unicode = 'utf8mb4_unicode_ci'
        data['tables'].append({'table': 'meal_workspace', 'engine': 'InnoDB'})
        data['schemaContracts']['meal_workspace'] = {'engine': 'InnoDB', 'collation': unicode, 'columns': {
            'id': column('varchar(36)', collation=unicode), 'user_id': column('bigint'), 'meal_date': column('date'),
            'meal_type': column('varchar(16)', collation=unicode), 'revision': column('bigint', default='0'),
            'state_json': column('json'), 'created_at': column('datetime', default='CURRENT_TIMESTAMP'), 'updated_at': column('datetime', default='CURRENT_TIMESTAMP')},
            'indexes': [index('PRIMARY', ['id'], True), index('uq_workspace_slot', ['user_id', 'meal_date', 'meal_type'], True), index('ix_workspace_age', ['updated_at'])], 'foreignKeys': []}
        data['schemaContracts']['recipe_records'] = {'engine': 'InnoDB', 'collation': unicode, 'columns': {'revision': column('bigint', default='1')}, 'indexes': [], 'foreignKeys': []}
        plan = self.helper.build_plan([data])
        self.assertEqual(14, len(plan['newTables'])); self.assertEqual(5, len(plan['addedColumns']))
        self.assertIn('meal_workspace', plan['skippedTables']); self.assertIn('recipe_records.revision', plan['skippedColumns'])
        bad = copy.deepcopy(data); bad['schemaContracts']['meal_workspace']['indexes'][1]['unique'] = False
        with self.assertRaises(ValueError): self.helper.build_plan([bad])
        bad = copy.deepcopy(data); bad['schemaContracts']['recipe_records']['columns']['revision']['default'] = '0'
        with self.assertRaises(ValueError): self.helper.build_plan([bad])

    def test_unknown_same_name_table_is_rejected_instead_of_create_if_not_exists_skip(self):
        data = fixture(); data['tables'].append({'table': 'workspace_task', 'engine': 'InnoDB'})
        with self.assertRaisesRegex(ValueError, 'workspace_task'): self.helper.build_plan([data])

    def test_zero_unknown_base_rows_produces_no_data_update(self):
        data = fixture(); data['results'][-1]['calculatedWithUnknownBase'] = 0
        plan = self.helper.build_plan([data]); self.assertFalse(any(step['sql'].startswith('UPDATE ') for step in plan['steps']))

    def test_file_preparation_creates_immutable_sanitized_artifacts_and_preserves_existing_output(self):
        with tempfile.TemporaryDirectory(dir=SCRATCH) as directory:
            root = Path(directory); source = root / 'snapshot.json'; source.write_text(json.dumps(fixture()), encoding='utf-8')
            out = root / 'candidate'; self.helper.prepare([source], out)
            self.assertEqual({'legacy-to-v4.sql', 'steps.json', 'contracts.json', 'preflight.json'}, {path.name for path in out.iterdir()})
            text = '\n'.join(path.read_text(encoding='utf-8') for path in out.iterdir())
            self.assertNotIn('/private/do-not-export.yml', text); self.assertNotIn(str(source), text)
            before = {path.name: path.read_bytes() for path in out.iterdir()}
            with self.assertRaises(FileExistsError): self.helper.prepare([source], out)
            self.assertEqual(before, {path.name: path.read_bytes() for path in out.iterdir()})

    def test_old_columns_plus_new_index_snapshot_cannot_invent_quality_column_proof(self):
        data = fixture(); data.pop('schemaContracts')
        data['results'] += [{'kind': 'index', 'table': 'dish_quality_profile', 'name': 'PRIMARY', 'column': 'dish_id', 'unique': True, 'sequence': 1}]
        with self.assertRaisesRegex(ValueError, 'dish_quality_profile'): self.helper.build_plan([data])

    def test_partial_fk_table_requires_identical_delete_rule_target_and_index_prefix(self):
        data = fixture(); default = data['databaseCollation']
        data['tables'].append({'table': 'shopping_expense', 'engine': 'InnoDB'})
        data['schemaContracts']['shopping_expense'] = {'engine': 'InnoDB', 'collation': default, 'columns': {
            'list_id': column('bigint'), 'ingredient_key': column('varchar(2200)', collation='ascii_bin'),
            'amount': column('decimal(9,2)'), 'channel': column('varchar(32)', nullable=True, collation=default)},
            'indexes': [index('PRIMARY', ['list_id', 'ingredient_key'], True)],
            'foreignKeys': [{'name': 'fk_expense_list', 'columns': ['list_id'], 'targetTable': 'shopping_list', 'targetColumns': ['id'],
                'targetSchema': 'CURRENT_DATABASE', 'onDelete': 'CASCADE', 'onUpdate': 'RESTRICT'}]}
        self.assertIn('shopping_expense', self.helper.build_plan([data])['skippedTables'])
        for mutation in ['delete', 'schema', 'prefix']:
            bad = copy.deepcopy(data); table = bad['schemaContracts']['shopping_expense']
            if mutation == 'delete': table['foreignKeys'][0]['onDelete'] = 'RESTRICT'
            if mutation == 'schema': table['foreignKeys'][0]['targetSchema'] = 'other_database'
            if mutation == 'prefix': table['indexes'][0]['prefixLengths'][1] = 16
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): self.helper.build_plan([bad])

    def test_missing_column_inventory_and_mixed_databases_are_rejected(self):
        data = fixture(); data['results'] = [row for row in data['results'] if row.get('table') != 'shopping_request_log']
        with self.assertRaisesRegex(ValueError, 'shopping_request_log'): self.helper.build_plan([data])
        second = fixture(); second['database'] = 'eatwhat_release_test_1234'
        with self.assertRaisesRegex(ValueError, 'different databases'): self.helper.build_plan([fixture(), second])

    def test_connection_capture_uses_only_selects_and_preserves_metadata_without_business_rows(self):
        queries = []
        class Cursor:
            description = []
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql):
                queries.append(sql)
                if sql.startswith('SELECT DATABASE()'): self.rows = [{'name': 'food', 'collation': 'utf8mb4_0900_ai_ci'}]
                elif 'information_schema.TABLES' in sql: self.rows = [{'name': 'dish_quality_profile', 'engine': 'InnoDB', 'collation': 'utf8mb4_unicode_ci'}]
                elif 'information_schema.COLUMNS' in sql:
                    self.rows = [{'t': 'dish_quality_profile', 'n': name, 'ct': value['columnType'], 'nl': 'YES' if value['nullable'] else 'NO', 'df': value['default'], 'ex': value['extra'], 'co': value['collation']} for name, value in quality_shapes()['dish_quality_profile']['columns'].items()]
                elif 'information_schema.STATISTICS' in sql:
                    self.rows = [{'t': 'dish_quality_profile', 'n': row['name'], 'nu': 0 if row['unique'] else 1, 'c': name, 'seq': i + 1, 'prefix': row['prefixLengths'][i], 'ord': row['orders'][i], 'ty': row['type']} for row in quality_shapes()['dish_quality_profile']['indexes'] for i, name in enumerate(row['columns'])]
                elif 'information_schema.KEY_COLUMN_USAGE' in sql: self.rows = []
                elif 'FROM schema_migrations' in sql: self.rows = [{'version': row['version']} for row in fixture()['results'] if row['kind'] == 'migration']
                elif 'COUNT(*)' in sql: self.rows = [{'n': 50}]
                else: raise AssertionError('Unexpected query')
            def fetchall(self): return self.rows
        class Connection:
            def cursor(self): return Cursor()
        snapshot = self.helper.snapshot_from_connection(Connection())
        self.assertEqual(7, len(queries)); self.assertTrue(all(sql.startswith('SELECT ') for sql in queries))
        self.assertEqual(quality_shapes()['dish_quality_profile'], snapshot['schemaContracts']['dish_quality_profile'])
        self.assertEqual(50, snapshot['results'][-1]['calculatedWithUnknownBase'])


if __name__ == '__main__': unittest.main()
