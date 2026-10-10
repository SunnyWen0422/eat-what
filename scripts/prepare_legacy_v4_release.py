"""Prepare an immutable legacy-food to V4 SQL plan from explicit schema files.

No credentials, connection creation, production apply, or model requests exist here.
snapshot_from_connection only reads an already supplied connection for an offline rehearsal.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
LEGACY_VERSIONS = frozenset({'V1__production_hardening', 'V2__admin_console', 'V3__calendar_sync',
                            'V4__custom_dish_receipts', 'V5__assistant_recipe_provenance'})
NEW_TABLES = ('meal_consumption', 'meal_mutation_log', 'shopping_mutation_log', 'user_avatar',
              'meal_workspace', 'workspace_task', 'workspace_request_log', 'behavior_event',
              'shopping_expense', 'ingredient_price_batch', 'ingredient_price', 'ingredient_price_mapping',
              'ingredient_price_collection', 'custom_recipes', 'controlled_tool_task')
QUALITY_TABLES = ('dish_quality_profile', 'dish_quality_revision')
ADDITIONS = (('recipe_records', 'revision', 'BIGINT NOT NULL DEFAULT 1'),
             ('recipe_records', 'record_origin', "VARCHAR(16) NOT NULL DEFAULT 'legacy'"),
             ('recipe_records', 'target_people', 'INT NOT NULL DEFAULT 2'),
             ('recipe_records', 'is_deleted', 'BOOLEAN NOT NULL DEFAULT FALSE'),
             ('shopping_request_log', 'request_hash', 'VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL'),
             ('user_preference', 'default_people', 'INT NOT NULL DEFAULT 2'))
BASE_TABLES = frozenset({'food', 'users', 'recipe_records', 'shopping_list', 'shopping_dish',
                         'shopping_item', 'shopping_request_log', 'user_preference', 'schema_migrations'})
IDENTIFIER = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _hash(data): return hashlib.sha256(data).hexdigest()


def _identifier(value):
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value): raise ValueError('Invalid schema identifier')
    return value.lower()


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result: raise ValueError('Duplicate JSON key')
        result[key] = value
    return result


def _read(path):
    return _loads(Path(path).read_bytes())


def _loads(data):
    return json.loads(data.decode('utf-8-sig'), object_pairs_hook=_unique_object,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError('Invalid JSON number')))


def _split(text):
    parts = []; start = depth = 0; quote = None; position = 0
    while position < len(text):
        char = text[position]
        if quote:
            if char == quote:
                if position + 1 < len(text) and text[position + 1] == quote: position += 1
                else: quote = None
        elif char in "'`": quote = char
        elif char == '(': depth += 1
        elif char == ')':
            depth -= 1
            if depth < 0: raise ValueError('Unsupported DDL parentheses')
        elif char == ',' and depth == 0: parts.append(text[start:position].strip()); start = position + 1
        position += 1
    if depth or quote: raise ValueError('Unsupported DDL quoting')
    return parts + [text[start:].strip()]


def _type(value):
    if not isinstance(value, str): raise ValueError('Column type evidence missing')
    value = re.sub(r'\s+', ' ', value.lower().strip())
    value = {'boolean': 'tinyint(1)', 'bool': 'tinyint(1)', 'integer': 'int'}.get(value, value)
    value = re.sub(r'\b(bigint|int|smallint|mediumint)\(\d+\)', r'\1', value)
    if not re.fullmatch(r'[a-z]+(?:\([0-9]+(?:,[0-9]+)?\))?(?: unsigned)?', value): raise ValueError('Unsupported column type')
    return value


def _default(value):
    if value is None: return None
    if isinstance(value, bool): return '1' if value else '0'
    text = str(value)
    if text.upper() in ('CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP()'): return 'CURRENT_TIMESTAMP'
    return text


def _extra(value):
    if not isinstance(value, str): raise ValueError('Column EXTRA evidence missing')
    return re.sub(r'\s+', ' ', value.lower().replace('default_generated', '').replace('current_timestamp()', 'current_timestamp').strip())


def _column(definition, table_collation):
    match = re.fullmatch(r'([A-Za-z_]\w*)\s+([A-Z]+(?:\([0-9,]+\))?)(.*)', definition, re.I | re.S)
    if not match: raise ValueError('Unsupported column DDL')
    name, kind, attributes = match.groups(); name = _identifier(name); kind = _type(kind)
    default = re.search(r"\bDEFAULT\s+('(?:''|[^'])*'|CURRENT_TIMESTAMP(?:\(\))?|NULL|TRUE|FALSE|-?\d+)", attributes, re.I)
    value = default.group(1) if default else None
    if value is not None:
        if value.upper() == 'NULL': value = None
        elif value.upper() in ('TRUE', 'FALSE'): value = '1' if value.upper() == 'TRUE' else '0'
        elif value.startswith("'"): value = value[1:-1].replace("''", "'")
    collation = re.search(r'\bCOLLATE\s+(\w+)', attributes, re.I)
    text_kind = kind.startswith(('varchar', 'char', 'text', 'mediumtext'))
    collation = collation.group(1).lower() if collation else table_collation if text_kind else None
    primary = bool(re.search(r'\bPRIMARY KEY\b', attributes, re.I))
    nullable = not bool(re.search(r'\bNOT NULL\b', attributes, re.I)) and not primary
    extra = 'auto_increment' if re.search(r'\bAUTO_INCREMENT\b', attributes, re.I) else ''
    if re.search(r'\bON UPDATE CURRENT_TIMESTAMP\b', attributes, re.I): extra = 'on update current_timestamp'
    rest = re.sub(r"\bDEFAULT\s+('(?:''|[^'])*'|CURRENT_TIMESTAMP(?:\(\))?|NULL|TRUE|FALSE|-?\d+)", '', attributes, flags=re.I)
    rest = re.sub(r'\b(?:NOT NULL|NULL|PRIMARY KEY|AUTO_INCREMENT|ON UPDATE CURRENT_TIMESTAMP(?:\(\))?|CHARACTER SET \w+|COLLATE \w+)\b', '', rest, flags=re.I)
    if rest.strip(): raise ValueError('Unsupported column attributes: ' + name)
    return name, {'columnType': kind, 'nullable': nullable, 'default': _default(value), 'extra': extra, 'collation': collation}, primary


def _index(name, columns, unique=False):
    names = [_identifier(value.strip()) for value in columns.split(',')]
    return {'name': 'PRIMARY' if name == 'PRIMARY' else _identifier(name), 'unique': unique,
            'columns': names, 'prefixLengths': [None] * len(names), 'orders': ['A'] * len(names), 'type': 'BTREE'}


def _parse_table(sql, database_collation):
    match = re.fullmatch(r'CREATE TABLE(?: IF NOT EXISTS)?\s+(\w+)\s*\((.*)\)\s*ENGINE=InnoDB DEFAULT CHARSET=utf8mb4(?: COLLATE=(\w+))?', sql, re.I | re.S)
    if not match: raise ValueError('Unsupported CREATE TABLE contract')
    name, body, explicit_collation = match.groups(); name = _identifier(name)
    collation = (explicit_collation or database_collation).lower()
    columns = {}; indexes = []; foreign = []
    for part in _split(body):
        key = re.fullmatch(r'(PRIMARY KEY|UNIQUE KEY\s+\w+|KEY\s+\w+)\s*\(([^()]*)\)', part, re.I)
        fk = re.fullmatch(r'CONSTRAINT\s+(\w+)\s+FOREIGN KEY\s*\(([^()]*)\)\s+REFERENCES\s+(\w+)\s*\(([^()]*)\)(?: ON DELETE (CASCADE|RESTRICT))?', part, re.I)
        if key:
            label = key.group(1).split(); indexes.append(_index('PRIMARY' if label[0].upper() == 'PRIMARY' else label[-1], key.group(2), label[0].upper() != 'KEY'))
        elif fk:
            foreign.append({'name': _identifier(fk.group(1)), 'columns': [_identifier(c.strip()) for c in fk.group(2).split(',')],
                            'targetTable': _identifier(fk.group(3)), 'targetColumns': [_identifier(c.strip()) for c in fk.group(4).split(',')],
                            'targetSchema': 'CURRENT_DATABASE', 'onDelete': (fk.group(5) or 'RESTRICT').upper(), 'onUpdate': 'RESTRICT'})
        else:
            col, value, primary = _column(part, collation)
            if col in columns: raise ValueError('Duplicate DDL column')
            columns[col] = value
            if primary: indexes.append(_index('PRIMARY', col, True))
    for idx in indexes:
        if not set(idx['columns']).issubset(columns): raise ValueError('Index references missing column')
        if idx['name'] == 'PRIMARY':
            for col in idx['columns']: columns[col]['nullable'] = False
    return name, {'engine': 'InnoDB', 'collation': collation, 'columns': columns,
                  'indexes': sorted(indexes, key=lambda row: row['name']), 'foreignKeys': sorted(foreign, key=lambda row: row['name'])}


def _contracts(database_collation):
    manifest_path = ROOT / 'backend/db/migration-manifest.json'; manifest = _read(manifest_path)
    creates = {}; contracts = {}; sources = []
    for row in manifest['migrations']:
        if row['version'] in ('V1__production_hardening', 'V2__admin_console'): continue
        file = row['file']
        if Path(file).name != file or not re.fullmatch(r'V[\w]+\.sql', file): raise ValueError('Invalid migration filename')
        data = (ROOT / 'backend/db/migrations' / file).read_bytes().replace(b'\r\n', b'\n')
        if _hash(data) != row['checksumSha256']: raise ValueError('Migration checksum differs: ' + file)
        sources.append({'file': file, 'sha256': _hash(data)})
        text = re.sub(r'(?m)^--.*$', '', data.decode('utf-8'))
        # Only explicit CREATE TABLE fragments are selected. Procedure, demo INSERT, and ledger SQL never enter a plan.
        for match in re.finditer(r'CREATE TABLE(?: IF NOT EXISTS)?\s+\w+\s*\([^;]+?\)\s*ENGINE=InnoDB DEFAULT CHARSET=utf8mb4(?: COLLATE=\w+)?\s*;', text, re.I):
            sql = match.group(0).strip().removesuffix(';'); name, contract = _parse_table(sql, database_collation)
            if name in creates: raise ValueError('Duplicate migration table')
            creates[name] = re.sub(r'^CREATE TABLE (?!IF NOT EXISTS)', 'CREATE TABLE IF NOT EXISTS ', sql, flags=re.I); contracts[name] = contract
    if set(creates) != set(NEW_TABLES + QUALITY_TABLES): raise ValueError('Reviewed target table inventory differs')
    return creates, contracts, sources


def _normalize_column(value):
    required = {'columnType', 'nullable', 'default', 'extra', 'collation'}
    if not isinstance(value, dict) or not required.issubset(value): raise ValueError('Complete column shape evidence required')
    if not isinstance(value['nullable'], bool): raise ValueError('Invalid column nullability')
    collation = value['collation']
    if collation is not None and (not isinstance(collation, str) or not IDENTIFIER.fullmatch(collation)): raise ValueError('Invalid column collation')
    return {'columnType': _type(value['columnType']), 'nullable': value['nullable'], 'default': _default(value['default']),
            'extra': _extra(value['extra']), 'collation': collation.lower() if collation else None}


def _normalize_table(value):
    if not isinstance(value, dict) or not {'engine', 'collation', 'columns', 'indexes', 'foreignKeys'}.issubset(value): raise ValueError('Complete table shape evidence required')
    if not isinstance(value['columns'], dict) or not isinstance(value['indexes'], list) or not isinstance(value['foreignKeys'], list): raise ValueError('Invalid table shape')
    indexes = []
    for row in value['indexes']:
        if set(row) != {'name', 'unique', 'columns', 'prefixLengths', 'orders', 'type'} or not isinstance(row['unique'], bool): raise ValueError('Complete index shape evidence required')
        if len(row['columns']) != len(row['prefixLengths']) or len(row['columns']) != len(row['orders']): raise ValueError('Index shape mismatch')
        indexes.append({**row, 'name': 'PRIMARY' if row['name'].upper() == 'PRIMARY' else _identifier(row['name']),
                        'columns': [_identifier(col) for col in row['columns']], 'type': row['type'].upper()})
    foreign = []
    for row in value['foreignKeys']:
        if set(row) != {'name', 'columns', 'targetTable', 'targetColumns', 'targetSchema', 'onDelete', 'onUpdate'} or row['targetSchema'] != 'CURRENT_DATABASE': raise ValueError('Complete same-database FK shape evidence required')
        foreign.append({'name': _identifier(row['name']), 'columns': [_identifier(c) for c in row['columns']],
                        'targetTable': _identifier(row['targetTable']), 'targetColumns': [_identifier(c) for c in row['targetColumns']],
                        'targetSchema': 'CURRENT_DATABASE', 'onDelete': row['onDelete'].upper().replace('NO ACTION', 'RESTRICT'), 'onUpdate': row['onUpdate'].upper().replace('NO ACTION', 'RESTRICT')})
    if len({row['name'] for row in indexes}) != len(indexes) or len({row['name'] for row in foreign}) != len(foreign): raise ValueError('Duplicate index or FK')
    return {'engine': str(value['engine']).lower(), 'collation': str(value['collation']).lower(),
            'columns': {_identifier(name): _normalize_column(col) for name, col in value['columns'].items()},
            'indexes': sorted(indexes, key=lambda row: row['name']), 'foreignKeys': sorted(foreign, key=lambda row: row['name'])}


def build_plan(snapshots):
    if not snapshots: raise ValueError('Explicit schema snapshot required')
    tables = set(); shapes = {}; observed_columns = {}; count = None; collation = None; dates = []; database = None
    for snapshot in snapshots:
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get('results'), list) or not isinstance(snapshot.get('tables'), list): raise ValueError('Invalid schema snapshot')
        source_database = snapshot.get('database')
        if source_database is None:
            sessions = [row.get('database') for row in snapshot['results'] if row.get('kind') == 'session']
            if len(sessions) == 1: source_database = sessions[0]
        if not isinstance(source_database, str) or not (source_database == 'food' or re.fullmatch(r'eatwhat_(?:release|v4|quality)_test_[a-z0-9]+', source_database)):
            raise ValueError('Explicit food or owned rehearsal database identity required')
        if database is not None and database != source_database: raise ValueError('Schema snapshots belong to different databases')
        database = source_database
        versions = [row['version'] for row in snapshot['results'] if row.get('kind') == 'migration']
        if versions and (len(versions) != 5 or set(versions) != LEGACY_VERSIONS): raise ValueError('Unexpected legacy migration lineage')
        if not versions and not shapes and len(snapshots) == 1: raise ValueError('Legacy migration lineage missing')
        if snapshot.get('databaseCollation') is not None:
            value = snapshot['databaseCollation']
            if not isinstance(value, str) or not value.startswith('utf8mb4_') or not IDENTIFIER.fullmatch(value): raise ValueError('Database collation evidence required')
            if collation is not None and collation != value: raise ValueError('Conflicting database collation snapshots')
            collation = value
        if not snapshot.get('checkedAtUtc'): raise ValueError('Snapshot capture time required')
        try:
            captured = datetime.fromisoformat(snapshot['checkedAtUtc'].replace('Z', '+00:00'))
            if captured.tzinfo is None: raise ValueError()
        except (ValueError, TypeError, AttributeError): raise ValueError('Snapshot capture time must include a timezone')
        dates.append(snapshot['checkedAtUtc'])
        tables.update(_identifier(row['table']) for row in snapshot['tables'])
        for name, value in snapshot.get('schemaContracts', {}).items():
            name = _identifier(name)
            if name in shapes and shapes[name] != value: raise ValueError('Conflicting table shape evidence: ' + name)
            shapes[name] = value; tables.add(name)
        for row in snapshot['results']:
            if row.get('kind') == 'column': observed_columns.setdefault(_identifier(row['table']), {})[_identifier(row['name'])] = _type(row['type'])
            if row.get('kind') == 'shoppingPreflight':
                value = row.get('calculatedWithUnknownBase')
                if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 2147483647: raise ValueError('Explicit unknown-base row count required')
                if count is not None and count != value: raise ValueError('Conflicting unknown-base counts')
                count = value
    if not any([row for row in snapshot['results'] if row.get('kind') == 'migration'] for snapshot in snapshots): raise ValueError('Legacy migration lineage missing')
    if not BASE_TABLES.issubset(tables): raise ValueError('Legacy business tables missing')
    if collation is None: raise ValueError('Database collation evidence required')
    if count is None: raise ValueError('Unknown-base shopping preflight missing')
    creates, expected, sources = _contracts(collation)
    for name in QUALITY_TABLES:
        if name not in tables or name not in shapes: raise ValueError('Full quality table evidence required: ' + name)
        if _normalize_table(shapes[name]) != _normalize_table(expected[name]): raise ValueError('Existing quality table shape differs: ' + name)
    last_login = shapes.get('users', {}).get('columns', {}).get('last_login_time')
    last_type = _normalize_column(last_login)['columnType'] if last_login is not None else observed_columns.get('users', {}).get('last_login_time')
    if last_type != 'datetime': raise ValueError('Existing users.last_login_time must be attested; it is never added implicitly')
    steps = []; added = []; skipped_columns = []; skipped_tables = []; new_tables = []
    for table, name, definition in ADDITIONS:
        if not shapes.get(table, {}).get('columns') and not observed_columns.get(table): raise ValueError('Column inventory evidence required: ' + table)
        table_collation = shapes.get(table, {}).get('collation', collation)
        _, target, _ = _column(name + ' ' + definition, table_collation)
        existing = shapes.get(table, {}).get('columns', {}).get(name)
        if existing is not None:
            if _normalize_column(existing) != _normalize_column(target): raise ValueError('Existing target column shape differs: ' + table + '.' + name)
            skipped_columns.append(table + '.' + name)
        elif name in observed_columns.get(table, {}): raise ValueError('Complete target column shape evidence required: ' + table + '.' + name)
        else:
            steps.append({'name': table + '.' + name, 'sql': 'ALTER TABLE `' + table + '` ADD COLUMN `' + name + '` ' + definition}); added.append(table + '.' + name)
    for name in NEW_TABLES:
        if name in tables:
            if name not in shapes or _normalize_table(shapes[name]) != _normalize_table(expected[name]): raise ValueError('Existing target table shape differs or cannot be attested: ' + name)
            skipped_tables.append(name)
        else:
            steps.append({'name': name, 'sql': creates[name]}); new_tables.append(name)
    if count:
        steps.append({'name': 'shopping_item.unknown-portion-status', 'sql': "UPDATE shopping_item SET calculation_status='NEEDS_ADJUSTMENT',updated_at=updated_at WHERE source_base_people IS NULL AND calculation_status='CALCULATED'",
                      'expectedAffected': count, 'changesQuantityOrMoney': False, 'preservesUpdatedAt': True})
    return {'formatVersion': 1, 'mode': 'prepare-only', 'productionApproved': False, 'sourceDatabase': database, 'snapshotTimes': dates,
            'legacyVersions': sorted(LEGACY_VERSIONS), 'newTables': new_tables, 'addedColumns': added,
            'skippedTables': skipped_tables, 'skippedColumns': skipped_columns, 'shoppingStatusCorrectionRows': count,
            'changesOriginalRecipesOrIdentity': False, 'inventsActualMeals': False, 'migrationRegistryWrites': 0,
            'steps': steps, 'contracts': expected, 'migrationSources': sources}


def prepare(snapshot_paths, output):
    paths = [Path(path) for path in snapshot_paths]; inputs = [path.read_bytes() for path in paths]
    plan = build_plan([_loads(data) for data in inputs]); output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    sql = '-- PREPARE ONLY: not approved for production. Re-snapshot and rehearse before a future release.\n-- Preserve food/user/history IDs and the legacy migration ledger. Execute reviewed steps individually; DDL autocommits.\n\n'
    sql += '\n\n'.join('-- ' + row['name'] + '\n' + row['sql'] + ';' for row in plan['steps']) + '\n'
    files = {'legacy-to-v4.sql': sql, 'steps.json': json.dumps(plan['steps'], ensure_ascii=False, indent=2) + '\n',
             'contracts.json': json.dumps(plan['contracts'], ensure_ascii=False, indent=2) + '\n'}
    for name, text in files.items():
        with (output / name).open('x', encoding='utf-8', newline='\n') as stream: stream.write(text)
    receipt = {key: value for key, value in plan.items() if key not in ('steps', 'contracts')}
    receipt['schemaInputs'] = [{'sha256': _hash(data), 'bytes': len(data)} for data in inputs]
    receipt['files'] = {name: {'sha256': _hash((output / name).read_bytes()), 'bytes': (output / name).stat().st_size} for name in files}
    with (output / 'preflight.json').open('x', encoding='utf-8', newline='\n') as stream: json.dump(receipt, stream, ensure_ascii=False, indent=2); stream.write('\n')
    return receipt


def snapshot_from_connection(connection):
    """SELECT-only metadata capture from a caller-owned connection. Never opens/commits a connection."""
    def query(sql):
        with connection.cursor() as cursor:
            cursor.execute(sql); names = [value[0] for value in cursor.description]
            return [dict(row) if isinstance(row, dict) else dict(zip(names, row)) for row in cursor.fetchall()]
    identity = query('SELECT DATABASE() AS name, @@collation_database AS collation')[0]
    tables = query('SELECT TABLE_NAME AS name,ENGINE AS engine,TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE=\'BASE TABLE\' ORDER BY TABLE_NAME')
    shapes = {row['name']: {'engine': row['engine'], 'collation': row['collation'], 'columns': {}, 'indexes': [], 'foreignKeys': []} for row in tables}
    for row in query('SELECT TABLE_NAME AS t,COLUMN_NAME AS n,COLUMN_TYPE AS ct,IS_NULLABLE AS nl,COLUMN_DEFAULT AS df,EXTRA AS ex,COLLATION_NAME AS co FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION'):
        shapes[row['t']]['columns'][row['n'].lower()] = {'columnType': row['ct'], 'nullable': row['nl'] == 'YES', 'default': row['df'], 'extra': row['ex'], 'collation': row['co']}
    groups = {}
    for row in query('SELECT TABLE_NAME AS t,INDEX_NAME AS n,NON_UNIQUE AS nu,COLUMN_NAME AS c,SEQ_IN_INDEX AS seq,SUB_PART AS prefix,COLLATION AS ord,INDEX_TYPE AS ty FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX'):
        key = (row['t'], row['n']); value = groups.setdefault(key, {'name': row['n'], 'unique': row['nu'] == 0, 'columns': [], 'prefixLengths': [], 'orders': [], 'type': row['ty']})
        value['columns'].append(row['c']); value['prefixLengths'].append(row['prefix']); value['orders'].append(row['ord'])
    for (table, _), value in groups.items(): shapes[table]['indexes'].append(value)
    groups = {}
    for row in query('SELECT k.TABLE_NAME AS t,k.CONSTRAINT_NAME AS n,k.COLUMN_NAME AS c,k.REFERENCED_TABLE_SCHEMA AS rs,k.REFERENCED_TABLE_NAME AS rt,k.REFERENCED_COLUMN_NAME AS rc,k.ORDINAL_POSITION AS seq,r.DELETE_RULE AS dr,r.UPDATE_RULE AS ur FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION'):
        if row['rs'] != identity['name']: raise ValueError('Cross-database foreign keys require separate review')
        value = groups.setdefault((row['t'], row['n']), {'name': row['n'], 'columns': [], 'targetTable': row['rt'], 'targetColumns': [], 'targetSchema': 'CURRENT_DATABASE', 'onDelete': row['dr'], 'onUpdate': row['ur']})
        value['columns'].append(row['c']); value['targetColumns'].append(row['rc'])
    for (table, _), value in groups.items(): shapes[table]['foreignKeys'].append(value)
    versions = query('SELECT version FROM schema_migrations ORDER BY version')
    count = query("SELECT COUNT(*) AS n FROM shopping_item WHERE source_base_people IS NULL AND calculation_status='CALCULATED'")[0]['n']
    return {'checkedAtUtc': datetime.now(timezone.utc).isoformat(), 'database': identity['name'], 'databaseCollation': identity['collation'],
            'tables': [{'table': row['name'], 'engine': row['engine']} for row in tables], 'schemaContracts': shapes,
            'results': [{'kind': 'migration', 'version': row['version']} for row in versions] + [{'kind': 'shoppingPreflight', 'calculatedWithUnknownBase': count}]}


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--schema-snapshot', action='append', required=True, help='Explicit JSON metadata input; may be repeated')
    parser.add_argument('--output', required=True, help='New immutable output directory; an existing path is refused')
    args = parser.parse_args(); receipt = prepare(args.schema_snapshot, args.output)
    print(json.dumps({key: receipt[key] for key in ('mode', 'newTables', 'addedColumns', 'skippedTables', 'skippedColumns', 'shoppingStatusCorrectionRows')}, ensure_ascii=False))


if __name__ == '__main__': main()
