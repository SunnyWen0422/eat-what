"""Restore the audited legacy dump into a new owned local DB, then bridge it to V4."""
from pathlib import Path
import datetime,hashlib,importlib.util,json,re
ROOT=Path(__file__).resolve().parents[1]
OLD_VERSIONS={'V1__production_hardening','V2__admin_console','V3__calendar_sync','V4__custom_dish_receipts','V5__assistant_recipe_provenance'}

def validate_target(value):
    if value.get('environment')!='local' or value.get('dbHost')!='127.0.0.1' or not re.fullmatch(r'eatwhat_maturity_(?:local|test)_[a-z0-9]+',value.get('database','')):
        raise ValueError('Only a newly owned loopback maturity database is allowed')

def anonymize_user(row,salt):
    result=dict(row);identity=str(row['id']);result['open_id']='local-anon-'+hashlib.sha256((salt+identity).encode()).hexdigest()
    for field in ['session_key','phone','avatar']:
        if field in result:result[field]=None
    if 'nickname' in result:result['nickname']='本地匿名账户'
    return result

def validate_lineage(versions):
    if set(versions)!=OLD_VERSIONS:raise ValueError('Unknown or mixed legacy migration lineage')

def validate_source_date(value):
    if value is None or value=='':return None
    if not isinstance(value,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',value):raise ValueError('Source date is not safely convertible')
    try:datetime.date.fromisoformat(value)
    except ValueError:raise ValueError('Source date is not safely convertible') from None
    return value


def restoration_order(ddl):
    """Order source rows by their FK graph, regardless of already-created tables."""
    pending=dict(ddl);ordered=[];ready_tables=set()
    while pending:
        ready=[name for name,sql in pending.items() if set(re.findall(r'REFERENCES\s+`([^`]+)`',sql,re.I))-ready_tables-{name}==set()]
        if not ready:raise ValueError('Unsupported cyclic or external foreign keys')
        for name in sorted(ready):
            ordered.append(name);ready_tables.add(name);pending.pop(name)
    return ordered


def validate_profile_sources(profiles, originals, rows, dataset_version):
    from catalog_quality import digest
    fields=['name','type','cl','fl','step','tags','image','difficulty','cook_time','ingredients_amounts','steps','step_images','tips','methods','kcal','is_custom']
    source_by_id={int(row['id']):row for row in originals}
    if len(source_by_id)!=len(originals):raise ValueError('Duplicate quality source recipe')
    sql_by_id={row['id']:row for row in rows if row.get('user_id') is None}
    ids=[q['dishId'] for q in profiles]
    if len(ids)!=len(set(ids)) or set(ids)!=set(sql_by_id) or set(source_by_id)!=set(sql_by_id):
        raise ValueError('Quality profiles must cover each public recipe exactly once')
    def canonical(value):return '' if value is None else str(value)
    for profile in profiles:
        original=source_by_id[profile['dishId']];sql=sql_by_id[profile['dishId']]
        if any(canonical(original.get(field))!=canonical(sql.get(field)) for field in fields):
            raise ValueError('Quality source differs from backup recipe: '+str(profile['dishId']))
        if profile['sourceHash']!=digest(original) or profile['datasetVersion']!=dataset_version:
            raise ValueError('Quality evidence belongs to a different source version')
        payload={k:v for k,v in profile.items() if k!='contentHash'}
        if profile['contentHash']!=digest(payload):raise ValueError('Quality content hash mismatch')

def prepare_source(zip_path, quality_bundle):
    """Validate immutable inputs before initializing or modifying a local database."""
    from legacy_dump import read_dump
    source=read_dump(zip_path);data=source['records']
    validate_lineage([r['version'] for r in data['schema_migrations']])
    for row in data['shopping_dish']:
        row['source_date']=validate_source_date(row.get('source_date'))
        if row.get('source_meal_type') not in [None,'','breakfast','lunch','dinner']:raise ValueError('Unknown legacy source meal')
    if quality_bundle:
        bundle=Path(quality_bundle).resolve()
        manifest=json.loads((bundle/'manifest.json').read_text(encoding='utf-8'))
        if not {'quality.jsonl','source-recipes.jsonl'}.issubset(manifest['files']):raise ValueError('Quality manifest does not cover profiles and sources')
        for name,expected in manifest['files'].items():
            path=(bundle/name).resolve()
            if not path.is_relative_to(bundle) or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
                raise ValueError('Quality bundle checksum mismatch')
        profiles=[json.loads(line) for line in (bundle/'quality.jsonl').read_text(encoding='utf-8').splitlines()]
        originals=[json.loads(line) for line in (bundle/'source-recipes.jsonl').read_text(encoding='utf-8').splitlines()]
        validate_profile_sources(profiles,originals,data['food'],manifest['datasetVersion'])
        source['qualityManifestHash']=hashlib.sha256((bundle/'manifest.json').read_bytes()).hexdigest()
    manifest=json.loads((ROOT/'backend/db/migration-manifest.json').read_text(encoding='utf-8'))
    for item in manifest['migrations']:
        sql=(ROOT/'backend/db/migrations'/item['file']).read_text(encoding='utf-8')
        if hashlib.sha256(sql.replace('\r\n','\n').encode()).hexdigest()!=item['checksumSha256']:
            raise ValueError('Migration checksum changed')
    return source


def restore_and_bridge(connection,zip_path,target,quality_bundle=None,prepared_source=None):
    validate_target(target)
    if getattr(connection,'host',None)!='127.0.0.1':raise ValueError('Connection is not loopback')
    from catalog_quality import digest
    source=prepared_source or prepare_source(zip_path,quality_bundle)
    schemas=source['schemas'];data=source['records']
    salt=target['anonymizationSalt']
    data['users']=[anonymize_user(row,salt) for row in data['users']]
    with connection.cursor() as cur:
        cur.execute('SELECT DATABASE()');selected=cur.fetchone()[0]
        if selected!=target['database']:raise ValueError('Selected database differs from the owned target')
        cur.execute('SHOW TABLES');existing={r[0] for r in cur.fetchall()}
        if existing and 'local_maturity_bridge' not in existing:raise ValueError('Refusing to overwrite an existing DB without the local bridge marker')
        cur.execute('CREATE TABLE IF NOT EXISTS local_maturity_bridge(id INT PRIMARY KEY, source_hash CHAR(64) NOT NULL, state_json JSON NOT NULL)')
        cur.execute('SELECT source_hash,state_json FROM local_maturity_bridge WHERE id=1');marker=cur.fetchone()
        state=json.loads(marker[1]) if marker else {'restoredTables':[],'completedMigrations':[],'completed':False}
        if marker and marker[0]!=source['sourceSha256']:raise ValueError('Resume source hash differs')
        def save():
            cur.execute('INSERT INTO local_maturity_bridge VALUES(1,%s,%s) ON DUPLICATE KEY UPDATE state_json=VALUES(state_json)',(source['sourceSha256'],json.dumps(state)));connection.commit()
        save();order=restoration_order(source['ddl'])
        for name in order:
            if name not in existing:cur.execute(source['ddl'][name])
        for name in order:
            if name in state['restoredTables']:continue
            cur.execute('SELECT COUNT(*) FROM `'+name+'`')
            if cur.fetchone()[0]!=0:raise ValueError('A partially restored table has uncheckpointed rows')
            rows=data[name];columns=[c['name'] for c in schemas[name]['columns']]
            sql='INSERT INTO `'+name+'` ('+','.join('`'+c+'`' for c in columns)+') VALUES('+','.join(['%s']*len(columns))+')'
            # Transactions are per table, followed by a committed checkpoint. DDL is separate.
            connection.autocommit(False)
            try:
                for offset in range(0,len(rows),500):cur.executemany(sql,[tuple(r[c] for c in columns) for r in rows[offset:offset+500]])
                state['restoredTables'].append(name);save()
            except BaseException:connection.rollback();raise
            finally:connection.autocommit(True)
        # Reviewed type conversions, preserving the values and original archive.
        cur.execute('ALTER TABLE shopping_dish MODIFY COLUMN source_date DATE NULL, MODIFY COLUMN source_meal_type VARCHAR(16) NULL')
        spec=importlib.util.spec_from_file_location('private_statements',ROOT/'scripts/run_mysql_integration.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        manifest=json.loads((ROOT/'backend/db/migration-manifest.json').read_text(encoding='utf-8'))
        for item in manifest['migrations']:
            if item['version'] in OLD_VERSIONS or item['version'] in state['completedMigrations']:continue
            path=ROOT/'backend/db/migrations'/item['file'];text=path.read_text(encoding='utf-8')
            if hashlib.sha256(text.replace('\r\n','\n').encode()).hexdigest()!=item['checksumSha256']:raise ValueError('Migration checksum changed')
            for sql in module.statements(text):
                # V4's original empty-database migration contains six demo breakfasts.
                # A full-data bridge retains the source catalog; demos have no reviewed evidence.
                if item['version']=='V4__meal_workspace' and re.match(r'^INSERT INTO food\(',sql,re.I):
                    if not re.search(r"SELECT 'V4 早餐·(?:燕麦粥|蒸玉米|烤吐司|水煮鸡蛋|清炒小白菜|黄瓜小菜)'",sql):
                        raise ValueError('Unreviewed catalog insertion in V4 migration')
                    continue
                alter=re.match(r'^ALTER TABLE\s+(\w+)\s+(.*)$',sql,re.I|re.S)
                create=re.match(r'^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?',sql,re.I)
                if alter:
                    from legacy_dump import split_top
                    table=alter[1];pieces=split_top(alter[2]);missing=[]
                    for piece in pieces:
                        column=re.match(r'ADD COLUMN\s+`?(\w+)`?',piece,re.I)
                        if not column:raise ValueError('Unreviewed ALTER operation')
                        cur.execute('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s AND COLUMN_NAME=%s',(table,column[1]))
                        if not cur.fetchone()[0]:missing.append(piece)
                    if not missing:continue
                    sql='ALTER TABLE '+table+' '+','.join(missing)
                elif create:
                    cur.execute('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s',(create[1],))
                    if cur.fetchone()[0]:continue
                procedure=re.match(r'^CREATE PROCEDURE\s+(\w+)\s*\(',sql,re.I)
                if procedure:
                    if item['version']!='V6_10__personal_menus' or procedure[1]!='apply_v6_10_personal_menus':
                        raise ValueError('Unreviewed migration procedure')
                    # This helper only performs guarded additive changes. Recreate it after
                    # interruption so its existing body cannot block or alter a resumed run.
                    cur.execute('DROP PROCEDURE IF EXISTS apply_v6_10_personal_menus')
                cur.execute(sql)
                while cur.nextset():pass
            state['completedMigrations'].append(item['version']);save()
        # Never infer actual consumption from legacy plans. Historical calculated flags need evidence.
        cur.execute("UPDATE shopping_item SET calculation_status='NEEDS_ADJUSTMENT' WHERE source_base_people IS NULL AND calculation_status='CALCULATED'")
        cur.execute("SELECT COUNT(*) FROM meal_consumption")
        if not state['completed'] and cur.fetchone()[0]!=0:raise ValueError('Restoration must not invent actual meals')
        if quality_bundle:
            bundle=Path(quality_bundle);manifest_q=json.loads((bundle/'manifest.json').read_text(encoding='utf-8'))
            for name,expected in manifest_q['files'].items():
                path=bundle/name
                if not path.resolve().is_relative_to(bundle.resolve()) or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise ValueError('Quality bundle checksum mismatch')
            connection.autocommit(False)
            for line in (bundle/'quality.jsonl').read_text(encoding='utf-8').splitlines():
                q=json.loads(line);cur.execute('SELECT user_id FROM food WHERE id=%s',(q['dishId'],));owner=cur.fetchone()
                if owner is None or owner[0] is not None:raise ValueError('Quality package targets non-public recipe')
                # Match Java's raw recipe fingerprint, including actual normalized metadata in this DB.
                fields=['name','type','cl','fl','step','ingredients_amounts','steps','step_images','tips','tags','cuisine_code','tag_codes','cook_minutes','metadata_version','image','difficulty','cook_time','methods','kcal']
                cur.execute('SELECT '+','.join('`'+field+'`' for field in fields)+' FROM food WHERE id=%s',(q['dishId'],))
                values=list(cur.fetchone());q['sourceRecipeVersion']=hashlib.sha256(json.dumps(values,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
                q.pop('contentHash',None);q['contentHash']=digest(q)
                payload=json.dumps(q,ensure_ascii=False)
                cur.execute('INSERT INTO dish_quality_profile(dish_id,dataset_version,source_hash,content_hash,review_status,profile_json) VALUES(%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE dataset_version=VALUES(dataset_version),source_hash=VALUES(source_hash),content_hash=VALUES(content_hash),review_status=VALUES(review_status),profile_json=VALUES(profile_json)',(q['dishId'],q['datasetVersion'],q['sourceHash'],q['contentHash'],q['reviewStatus'],payload))
                cur.execute('INSERT IGNORE INTO dish_quality_revision(id,dish_id,dataset_version,source_hash,profile_json) VALUES(%s,%s,%s,%s,%s)',(q['contentHash'],q['dishId'],q['datasetVersion'],q['sourceHash'],payload))
            connection.commit();connection.autocommit(True)
        counts={}
        for name in schemas:
            cur.execute('SELECT COUNT(*) FROM `'+name+'`');counts[name]=cur.fetchone()[0]
            if counts[name]!=len(data[name]) and name!='schema_migrations':raise ValueError('Legacy object count changed during bridge')
        state['completed']=True;save()
    return {'sourceSha256':source['sourceSha256'],'restoredCounts':counts,'newMigrations':state['completedMigrations'],'actualMealsInvented':0,'anonymousAccounts':len(data['users']),'sourcePreserved':True}
