"""Offline release preparation contracts; never opens a database connection."""
import copy
import importlib.util
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

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
    shapes['food']={'engine':'InnoDB','collation':'utf8mb4_0900_ai_ci','columns':{'id':column('int'),'user_id':column('bigint',True),'is_published':column('tinyint',True,1)},'indexes':[index('PRIMARY',['id'],True)],'foreignKeys':[]}
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

    def test_legacy_plan_is_only_nineteen_reviewed_additive_tables_six_fields_and_counted_status(self):
        plan = self.helper.build_plan([fixture()])
        self.assertEqual(19, len(plan['newTables'])); self.assertEqual(6, len(plan['addedColumns']))
        self.assertEqual({'meal_consumption', 'meal_mutation_log', 'shopping_mutation_log', 'user_avatar',
            'meal_workspace', 'workspace_task', 'workspace_request_log', 'behavior_event', 'shopping_expense',
            'ingredient_price_batch', 'ingredient_price', 'ingredient_price_mapping', 'ingredient_price_collection',
            'custom_recipes', 'controlled_tool_task', 'assistant_v4_session', 'assistant_v4_turn',
            'assistant_v4_message', 'shopping_scope_aliases'}, set(plan['newTables']))
        sql = '\n'.join(step['sql'] for step in plan['steps'])
        self.assertNotIn('INSERT INTO food', sql); self.assertNotIn('schema_migrations', sql)
        self.assertNotIn('last_login_time', sql); self.assertNotIn('DROP ', sql)
        correction = plan['steps'][-1]
        self.assertEqual(50, correction['expectedAffected']); self.assertFalse(correction['changesQuantityOrMoney'])
        self.assertIn('updated_at=updated_at', correction['sql']); self.assertNotIn('quantity_value=', correction['sql'])

    def test_reviewed_additive_indexes_are_prepared_resumable_and_shape_checked(self):
        data=fixture();data['schemaContracts']['food']={'engine':'InnoDB','collation':'utf8mb4_0900_ai_ci','columns':{'id':column('int'),'user_id':column('bigint',True),'is_published':column('tinyint',True,1)},'indexes':[index('PRIMARY',['id'],True)],'foreignKeys':[]}
        plan=self.helper.build_plan([data]);names={s['name'] for s in plan['steps']}
        required={'food.ix_food_visibility','assistant_v4_session.ix_av4_session_owner_updated','assistant_v4_turn.ix_av4_turn_session_updated'}
        self.assertTrue(required<=names)
        resumed=copy.deepcopy(data)
        for table in ('food','assistant_v4_session','assistant_v4_turn'):resumed['schemaContracts'][table]=copy.deepcopy(plan['contracts'][table])
        again=self.helper.build_plan([resumed]);self.assertFalse(required&{s['name'] for s in again['steps']});self.assertEqual(required,set(again['skippedIndexes']))
        bad=copy.deepcopy(resumed);next(i for i in bad['schemaContracts']['food']['indexes'] if i['name']=='ix_food_visibility')['columns']=['id','user_id','is_published']
        with self.assertRaises(ValueError):self.helper.build_plan([bad])

    def test_quality_schema_requires_full_shape_and_rejects_same_name_wrong_lengths(self):
        for mutation in ['length', 'missing-metadata', 'wrong-index', 'foreign-key']:
            data = fixture()
            if mutation == 'length': data['schemaContracts']['dish_quality_profile']['columns']['dataset_version']['columnType'] = 'varchar(8)'
            if mutation == 'missing-metadata': del data['schemaContracts']['dish_quality_profile']
            if mutation == 'wrong-index': data['schemaContracts']['dish_quality_profile']['indexes'][0]['columns'] = ['review_status']
            if mutation == 'foreign-key': data['schemaContracts']['dish_quality_profile']['foreignKeys'] = [{'name': 'unexpected', 'columns': ['dish_id'], 'targetTable': 'food', 'targetColumns': ['id'], 'onDelete': 'CASCADE', 'onUpdate': 'RESTRICT'}]
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): self.helper.build_plan([data])

    def test_create_pins_legacy_collation_even_when_mysql_charset_default_differs(self):
        data = fixture(); data['databaseCollation'] = 'utf8mb4_general_ci'
        plan = self.helper.build_plan([data])
        sql = next(step['sql'] for step in plan['steps'] if step['name'] == 'shopping_expense')
        self.assertRegex(sql, r'DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci$')
        self.assertIn('CHARACTER SET ascii COLLATE ascii_bin', sql)
        explicit = next(step['sql'] for step in plan['steps'] if step['name'] == 'meal_workspace')
        self.assertRegex(explicit, r'COLLATE=utf8mb4_unicode_ci$')

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
        self.assertEqual(18, len(plan['newTables'])); self.assertEqual(5, len(plan['addedColumns']))
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

    def test_assistant_tables_keep_owner_foreign_keys_order_and_independent_scope_aliases(self):
        plan = self.helper.build_plan([fixture()]); names = [step['name'] for step in plan['steps']]
        sources = {row['file'] for row in plan['migrationSources']}
        self.assertTrue({'V8__assistant_v4_conversations.sql', 'V8_10__assistant_shopping_scope_aliases.sql'}.issubset(sources))
        for name in ('assistant_v4_turn', 'assistant_v4_message'):
            self.assertLess(names.index('assistant_v4_session'), names.index(name))
            foreign = plan['contracts'][name]['foreignKeys']
            self.assertEqual(1, len(foreign)); self.assertEqual(['user_id', 'session_id'], foreign[0]['columns'])
            self.assertEqual('assistant_v4_session', foreign[0]['targetTable'])
            self.assertEqual(['user_id', 'id'], foreign[0]['targetColumns'])
            self.assertEqual('CURRENT_DATABASE', foreign[0]['targetSchema']); self.assertEqual('CASCADE', foreign[0]['onDelete'])
        scope = plan['contracts']['shopping_scope_aliases']
        self.assertEqual([], scope['foreignKeys'], 'procurement scope must survive assistant session deletion')
        self.assertEqual(['user_id', 'alias_key'], next(row for row in scope['indexes'] if row['name'] == 'PRIMARY')['columns'])
        self.assertEqual('char(64)', scope['columns']['alias_key']['columnType'])
        self.assertEqual('ascii_bin', plan['contracts']['assistant_v4_session']['columns']['id']['collation'])
        for name in ('assistant_v4_session', 'assistant_v4_turn', 'assistant_v4_message', 'shopping_scope_aliases'):
            self.assertTrue(next(step['sql'] for step in plan['steps'] if step['name'] == name).startswith('CREATE TABLE IF NOT EXISTS '))

    def test_existing_assistant_or_alias_tables_need_exact_full_shapes(self):
        original = fixture(); contracts = self.helper.build_plan([original])['contracts']
        additions = ('assistant_v4_session', 'assistant_v4_turn', 'assistant_v4_message', 'shopping_scope_aliases')
        for name in additions:
            collision = copy.deepcopy(original); collision['tables'].append({'table': name, 'engine': 'InnoDB'})
            with self.subTest(unattested=name), self.assertRaisesRegex(ValueError, name): self.helper.build_plan([collision])
        data = copy.deepcopy(original)
        for name in additions: data['schemaContracts'][name] = copy.deepcopy(contracts[name])
        resumed = self.helper.build_plan([data]); self.assertEqual(15, len(resumed['newTables'])); self.assertEqual(set(additions), set(resumed['skippedTables']))
        for mutation in ('column', 'owner-fk', 'target', 'delete-rule', 'unique-index', 'index-prefix'):
            bad = copy.deepcopy(data)
            if mutation == 'column': bad['schemaContracts']['shopping_scope_aliases']['columns']['alias_key']['columnType'] = 'char(8)'
            if mutation == 'owner-fk': bad['schemaContracts']['assistant_v4_turn']['foreignKeys'][0]['columns'] = ['session_id']
            if mutation == 'target': bad['schemaContracts']['assistant_v4_message']['foreignKeys'][0]['targetTable'] = 'controlled_tool_task'
            if mutation == 'delete-rule': bad['schemaContracts']['assistant_v4_turn']['foreignKeys'][0]['onDelete'] = 'RESTRICT'
            if mutation == 'unique-index': next(i for i in bad['schemaContracts']['assistant_v4_session']['indexes'] if i['name'] == 'uk_av4_session_request')['unique'] = False
            if mutation == 'index-prefix': next(i for i in bad['schemaContracts']['shopping_scope_aliases']['indexes'] if i['name'] == 'PRIMARY')['prefixLengths'][1] = 8
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): self.helper.build_plan([bad])

    def test_a_checksummed_but_unreviewed_future_table_is_still_rejected(self):
        with tempfile.TemporaryDirectory(dir=SCRATCH) as directory:
            root = Path(directory); database = root / 'backend/db'; database.mkdir(parents=True)
            shutil.copytree(ROOT / 'backend/db/migrations', database / 'migrations')
            manifest = json.loads((ROOT / 'backend/db/migration-manifest.json').read_text(encoding='utf-8'))
            ddl = b'CREATE TABLE IF NOT EXISTS unreviewed_release_table (id BIGINT NOT NULL PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n'
            (database / 'migrations/V99__unreviewed_table.sql').write_bytes(ddl)
            manifest['migrations'].append({'version': 'V99__unreviewed_table', 'file': 'V99__unreviewed_table.sql', 'checksumSha256': hashlib.sha256(ddl).hexdigest()})
            (database / 'migration-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            with mock.patch.object(self.helper, 'ROOT', root), self.assertRaisesRegex(ValueError, 'Reviewed target table inventory differs'):
                self.helper.build_plan([fixture()])

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
