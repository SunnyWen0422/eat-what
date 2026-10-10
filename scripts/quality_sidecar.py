"""Additive quality metadata import. Never changes recipes, accounts or business records."""
import hashlib
import json
from pathlib import Path
import re

SOURCE_FIELDS = ['name', 'type', 'cl', 'fl', 'step', 'tags', 'image', 'difficulty', 'cook_time',
                 'ingredients_amounts', 'steps', 'step_images', 'tips', 'methods', 'kcal', 'is_custom']
VERSION_FIELDS = ['name', 'type', 'cl', 'fl', 'step', 'ingredients_amounts', 'steps', 'step_images', 'tips',
                  'tags', 'cuisine_code', 'tag_codes', 'cook_minutes', 'metadata_version', 'image',
                  'difficulty', 'cook_time', 'methods', 'kcal']
TABLES = ('dish_quality_profile', 'dish_quality_revision')


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'),
                                     allow_nan=False, default=str).encode()).hexdigest()


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def raw_recipe_version(row):
    return hashlib.sha256(json.dumps([row.get(field) for field in VERSION_FIELDS],
                                     ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def canonical_source(row):
    return {field: '' if row.get(field) is None else str(row.get(field)) for field in SOURCE_FIELDS}


def lines(path):
    with Path(path).open(encoding='utf-8') as stream:
        for line in stream:
            if len(line.encode()) > 1024 * 1024:
                raise ValueError('Quality line exceeds limit')
            value = json.loads(line)
            if not isinstance(value, dict): raise ValueError('Quality row must be an object')
            yield value


def prepare(bundle, live_rows, output):
    """Complete immutable-source validation before callers perform any DDL or inserts."""
    bundle, output = Path(bundle), Path(output)
    manifest = json.loads((bundle / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('formatVersion') != 1 or not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', manifest.get('datasetVersion', '')):
        raise ValueError('Unsupported quality manifest')
    for name in ['quality.jsonl', 'source-recipes.jsonl']:
        if file_hash(bundle / name) != manifest.get('files', {}).get(name): raise ValueError('Quality input checksum mismatch')
    sources = {}
    for original in lines(bundle / 'source-recipes.jsonl'):
        identifier = int(original['id'])
        if identifier <= 0 or identifier in sources or original.get('user_id') not in [None, ''] or str(original.get('is_custom', 0)) != '0':
            raise ValueError('Duplicate or non-public quality source')
        sources[identifier] = (digest(original), digest(canonical_source(original)))
    if len(sources) != manifest.get('recipeCount') or not 0 < len(sources) <= 100000: raise ValueError('Source coverage mismatch')
    versions, seen = {}, set()
    raw_hash = hashlib.sha256()
    for row in live_rows:
        raw_hash.update((digest(row) + '\n').encode())
        identifier = int(row['id'])
        if identifier in seen: raise ValueError('Duplicate database recipe')
        seen.add(identifier)
        if row.get('user_id') is not None or row.get('is_custom') != 0:
            if identifier in sources: raise ValueError('Quality source now belongs to a private/custom recipe')
            continue
        if identifier not in sources or digest(canonical_source(row)) != sources[identifier][1]:
            raise ValueError('Quality source differs from live recipe: ' + str(identifier))
        versions[identifier] = raw_recipe_version(row)
    if set(versions) != set(sources): raise ValueError('Live recipe coverage mismatch')
    profile_ids, states = set(), {}
    with output.open('x', encoding='utf-8') as stream:
        for profile in lines(bundle / 'quality.jsonl'):
            identifier = profile.get('dishId')
            if identifier not in sources or identifier in profile_ids or profile.get('sourceHash') != sources[identifier][0]:
                raise ValueError('Quality profile source mismatch')
            if profile.get('datasetVersion') != manifest['datasetVersion'] or profile.get('contentHash') != digest({k: v for k, v in profile.items() if k != 'contentHash'}):
                raise ValueError('Quality profile version/hash mismatch')
            # This operation stores the existing unreviewed evidence; it cannot create or rebind verified claims.
            if profile.get('reviewStatus') != 'UNREVIEWED' or not isinstance(profile.get('ingredients'), list) or not profile['ingredients']:
                raise ValueError('This import accepts existing unreviewed profiles only')
            if profile.get('basePeople') is not None or any(fact.get('quantityValue') is not None for fact in profile['ingredients']):
                raise ValueError('Unreviewed quantities must remain unknown')
            profile_ids.add(identifier)
            profile['sourceRecipeVersion'] = versions[identifier]
            profile.pop('contentHash', None)
            profile['contentHash'] = digest(profile)
            states[profile['reviewStatus']] = states.get(profile['reviewStatus'], 0) + 1
            stream.write(json.dumps(profile, ensure_ascii=False, separators=(',', ':')) + '\n')
    if profile_ids != set(sources): raise ValueError('Profile coverage mismatch')
    return {'datasetVersion': manifest['datasetVersion'], 'recipeCount': len(sources), 'reviewStates': states,
            'sourceFoodFingerprint': raw_hash.hexdigest(), 'preparedSha256': file_hash(output)}


def schema_sql(path):
    text = Path(path).read_text(encoding='utf-8').split('INSERT INTO schema_migrations', 1)[0]
    text = re.sub(r'(?m)^--.*$', '', text)
    statements = [part.strip() for part in text.split(';') if part.strip()]
    if len(statements) != 2 or any(not statement.startswith('CREATE TABLE IF NOT EXISTS ' + table + ' (')
                                    for statement, table in zip(statements, TABLES)):
        raise ValueError('Only the two approved additive quality tables may be created')
    if re.search(r'\b(?:DROP|ALTER|TRUNCATE|INSERT|UPDATE|DELETE)\b', text, re.I):
        raise ValueError('Unexpected statement in quality schema')
    return statements


def validate_schema(cursor):
    expected = {
        'dish_quality_profile': {'dish_id': 'int', 'dataset_version': 'varchar', 'source_hash': 'char', 'content_hash': 'char', 'review_status': 'varchar', 'profile_json': 'json', 'updated_at': 'datetime'},
        'dish_quality_revision': {'id': 'char', 'dish_id': 'int', 'dataset_version': 'varchar', 'source_hash': 'char', 'profile_json': 'json', 'created_at': 'datetime'},
    }
    for table in TABLES:
        cursor.execute('SELECT COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s', (table,))
        if dict(cursor.fetchall()) != expected[table]: raise ValueError('Existing quality table schema differs: ' + table)
        cursor.execute("SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX", (table,))
        if [row[0] for row in cursor.fetchall()] != (['dish_id'] if table == TABLES[0] else ['id']):
            raise ValueError('Quality table primary key differs')


def stored_profile_valid(profile):
    return profile.get('contentHash') == digest({k: v for k, v in profile.items() if k != 'contentHash'})


def apply(connection, prepared, report, schema_path, expected_database):
    """Insert only; exact replays are harmless, any existing conflicting evidence aborts."""
    if getattr(connection, 'host', None) != '127.0.0.1' or not (expected_database == 'food' or re.fullmatch(r'eatwhat_quality_test_[a-z0-9]+', expected_database)):
        raise ValueError('Unexpected quality import target')
    if file_hash(prepared) != report['preparedSha256']: raise ValueError('Prepared data changed')
    with connection.cursor() as cursor:
        cursor.execute('SELECT DATABASE()')
        if cursor.fetchone()[0] != expected_database: raise ValueError('Selected database differs from approved target')
        # DDL is additive and autocommits in MySQL. Never touch the legacy migration registry.
        for statement in schema_sql(schema_path): cursor.execute(statement)
        validate_schema(cursor)
    connection.begin()
    try:
        with connection.cursor() as cursor:
            # Recheck under shared locks: a live recipe edited after preflight cannot receive stale evidence.
            cursor.execute('SELECT * FROM food ORDER BY id FOR SHARE')
            columns = [column[0] for column in cursor.description]
            fingerprint = hashlib.sha256()
            for row in cursor.fetchall():
                fingerprint.update((digest(dict(zip(columns, row))) + '\n').encode())
            if fingerprint.hexdigest() != report['sourceFoodFingerprint']:
                raise ValueError('Recipes changed after quality preflight; no evidence inserted')
            cursor.execute('SELECT dish_id,content_hash,profile_json FROM dish_quality_profile')
            current = {row[0]: (row[1], digest(json.loads(row[2]))) for row in cursor.fetchall()}
            cursor.execute('SELECT id,dish_id,source_hash,profile_json FROM dish_quality_revision')
            history = {row[0]: (row[1], row[2], digest(json.loads(row[3]))) for row in cursor.fetchall()}
            inserted_current = inserted_history = 0
            for profile in lines(prepared):
                if not stored_profile_valid(profile): raise ValueError('Prepared profile hash changed')
                identifier, key = profile['dishId'], profile['contentHash']
                content = json.dumps(profile, ensure_ascii=False, separators=(',', ':'))
                if identifier in current:
                    if current[identifier] != (key, digest(profile)): raise ValueError('Existing current quality evidence conflicts')
                else:
                    cursor.execute('INSERT INTO dish_quality_profile(dish_id,dataset_version,source_hash,content_hash,review_status,profile_json) VALUES(%s,%s,%s,%s,%s,%s)',
                                   (identifier, profile['datasetVersion'], profile['sourceHash'], key, profile['reviewStatus'], content))
                    inserted_current += 1
                if key in history:
                    if history[key] != (identifier, profile['sourceHash'], digest(profile)): raise ValueError('Existing quality revision conflicts')
                else:
                    cursor.execute('INSERT INTO dish_quality_revision(id,dish_id,dataset_version,source_hash,profile_json) VALUES(%s,%s,%s,%s,%s)',
                                   (key, identifier, profile['datasetVersion'], profile['sourceHash'], content))
                    inserted_history += 1
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    return {**report, 'insertedCurrent': inserted_current, 'insertedRevisions': inserted_history,
            'businessTableWrites': 0, 'migrationRegistryWrites': 0}
