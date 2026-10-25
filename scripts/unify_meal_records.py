"""One-time, offline merge into recipe_records. Never connects without CLI options.

Run on a stopped application against an explicitly selected database. Original
rows are backed up before writes; the retired table is renamed to an archive.
The pure merge is also used by isolated acceptance tests.
"""
import argparse
import copy
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re

VERSION = 'calendar-records-v1'
ARCHIVE = 'meal_consumption_archive_v1'
JOURNAL_DDL = "CREATE TABLE IF NOT EXISTS meal_record_migration_state (version VARCHAR(40) PRIMARY KEY, status VARCHAR(20) NOT NULL, backup_hash CHAR(64) NOT NULL, merged_hash CHAR(64) NOT NULL) ENGINE=InnoDB"


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)


def decoded(value, fallback):
    return copy.deepcopy(fallback) if value is None else json.loads(value) if isinstance(value, str) else copy.deepcopy(value)


def slot(row, actual=False):
    return (int(row['user_id']), str(row['meal_date' if actual else 'record_date'])[:10], row['meal_type'])


def timestamp(row, actual=False):
    return str(row.get('updated_at' if actual else 'update_time') or row.get('created_at' if actual else 'create_time') or '')


def merge_records(records, consumptions):
    current = {slot(row): copy.deepcopy(row) for row in records}
    if len(current) != len(records):
        raise ValueError('Duplicate calendar slots; resolve before migration')
    seen = set()
    audit = []
    for actual in consumptions:
        key = slot(actual, True)
        if key in seen:
            raise ValueError('Duplicate retired meal slots')
        seen.add(key)
        plan = current.get(key)
        status = actual['status']
        if status not in ('eaten', 'skipped', 'unrecorded'):
            raise ValueError('Unknown retired meal state')
        reason = 'keep_calendar'
        # An explicit later calendar save/deletion wins over an earlier correction.
        if status == 'unrecorded':
            reason = 'withdrawn_actual_keep_calendar'
        elif plan and timestamp(plan) > timestamp(actual, True):
            reason = 'newer_calendar'
        elif status == 'skipped':
            if plan:
                plan['is_deleted'] = 1
                plan['revision'] = int(plan.get('revision') or 0) + 1
            reason = 'explicit_skip_remove_record'
        else:
            dishes = decoded(actual.get('actual_dishes_json'), [])
            if not dishes or any(not isinstance(d, dict) or not str(d.get('name') or '').strip() for d in dishes):
                raise ValueError('Recorded meal lacks dish names; review without inventing content')
            saved = decoded(plan.get('dish_details') if plan else None, [])
            snapshots = {str(d.get('id')): d for d in saved if d.get('id') is not None}
            details = []
            for dish in dishes:
                identity = dish.get('dishId')
                detail = copy.deepcopy(snapshots.get(str(identity), {}))
                detail['name'] = dish['name']
                if dish.get('type') is not None:
                    detail['type'] = dish['type']
                if identity is not None:
                    if not str(identity).isdigit() or int(identity) < 1:
                        raise ValueError('Invalid historical dish identity')
                    detail['id'] = int(identity)
                # Historical recorded nutrition takes precedence over a plan snapshot.
                nutrition = dish.get('nutritionSnapshot')
                if nutrition is not None:
                    if nutrition.get('basis') != 'recipe_baseline':
                        raise ValueError('Unknown historical nutrition basis')
                    recipe = detail.setdefault('recipe', {})
                    recipe['baseServings'] = nutrition.get('baseServings')
                    recipe['calculatedNutrition'] = {'completeness': nutrition.get('completeness', 'partial'), 'total': nutrition.get('total') if nutrition.get('completeness') == 'complete' else None}
                else:
                    # Never borrow a nutrition total from a different snapshot.
                    if detail.get('recipe') is not None:
                        detail['recipe']['calculatedNutrition'] = {'completeness':'partial','total':None}
                details.append(detail)
            merged = copy.deepcopy(plan or {'user_id': key[0], 'record_date': key[1], 'meal_type': key[2], 'target_people': 2})
            if not plan:
                original = decoded(actual.get('planned_snapshot_json'), {})
                people = original.get('targetPeople')
                if isinstance(people, int) and 1 <= people <= 50:
                    merged['target_people'] = people
            name = '、'.join(d['name'] for d in details)[:255]
            if plan and saved and plan.get('recipe_name') and plan['recipe_name'] != '、'.join(str(d.get('name') or '') for d in saved):
                name = plan['recipe_name']
            merged.update(recipe_name=name, dish_ids=encoded(list(dict.fromkeys(d['id'] for d in details if d.get('id') is not None))), dish_details=encoded(details), is_manual=0 if any(d.get('id') for d in details) else 1, record_origin='manual', is_deleted=0, revision=int(merged.get('revision') or 0)+1)
            current[key] = merged
            reason = 'preserve_actual_correction'
        audit.append({'slot': list(key), 'reason': reason, 'recordBefore': next((r for r in records if slot(r) == key), None), 'consumptionBefore': actual, 'recordAfter': current.get(key)})
    return list(current.values()), audit


def migrate(connection, backup_dir, execute=False):
    """Caller owns the connection and confirms maintenance mode. No ambient config."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='meal_record_migration_state'")
        has_journal = bool(cursor.fetchall())
        journal = None
        if has_journal:
            cursor.execute('SELECT * FROM meal_record_migration_state WHERE version=%s',(VERSION,))
            journal = cursor.fetchone()
        cursor.execute("SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('meal_consumption','meal_consumption_archive_v1')")
        names = {next(iter(r.values())) for r in cursor.fetchall()}
        if ARCHIVE in names and 'meal_consumption' not in names:
            if not journal or journal['status'] not in ('merged','complete'):
                raise ValueError('Archive without verified migration journal')
            if execute and journal['status']=='merged':
                cursor.execute("UPDATE meal_record_migration_state SET status='complete' WHERE version=%s",(VERSION,))
            return {'version': VERSION, 'status': 'already_complete'}
        if names != {'meal_consumption'}:
            raise ValueError('Unexpected migration state; inspect before continuing')
        cursor.execute('SELECT * FROM recipe_records ORDER BY USER_ID,RECORD_DATE,MEAL_TYPE')
        original = [{k.lower(): v for k, v in r.items()} for r in cursor.fetchall()]
        if journal:
            if journal['status']!='merged' or hashlib.sha256(encoded(original).encode()).hexdigest()!=journal['merged_hash']:
                raise ValueError('Interrupted merge changed; inspect backup before continuing')
            if execute:
                cursor.execute('RENAME TABLE meal_consumption TO meal_consumption_archive_v1')
                cursor.execute("UPDATE meal_record_migration_state SET status='complete' WHERE version=%s",(VERSION,))
            return {'version':VERSION,'status':'complete' if execute else 'resume_archive_only'}
        cursor.execute('SELECT * FROM meal_consumption ORDER BY user_id,meal_date,meal_type')
        actual = cursor.fetchall()
    records, audit = merge_records(original, actual)
    out = Path(backup_dir)
    out.mkdir(parents=True, exist_ok=False)
    backup = encoded({'recipe_records': original, 'meal_consumption': actual})
    (out / 'original-records.json').write_text(backup, encoding='utf-8')
    (out / 'merge-audit.json').write_text(encoded(audit), encoding='utf-8')
    receipt = {'version': VERSION, 'status': 'dry_run', 'originalRecords': len(original), 'retiredRows': len(actual), 'finalRecords': len(records), 'backupSha256': hashlib.sha256(backup.encode()).hexdigest()}
    if execute:
        with connection.cursor() as cursor:
            cursor.execute(JOURNAL_DDL)
        connection.begin()
        try:
            with connection.cursor() as cursor:
                # Lock every affected account, then recheck the snapshot to refuse races.
                for user in sorted({r['user_id'] for r in original} | {r['user_id'] for r in actual}):
                    cursor.execute('SELECT id FROM users WHERE id=%s FOR UPDATE', (user,))
                    if not cursor.fetchone():
                        raise ValueError('Meal record owner is missing; no merge applied')
                cursor.execute('SELECT * FROM recipe_records ORDER BY USER_ID,RECORD_DATE,MEAL_TYPE FOR UPDATE')
                now = [{k.lower(): v for k, v in r.items()} for r in cursor.fetchall()]
                cursor.execute('SELECT * FROM meal_consumption ORDER BY user_id,meal_date,meal_type FOR UPDATE')
                if encoded({'recipe_records': now, 'meal_consumption': cursor.fetchall()}) != backup:
                    raise ValueError('Source changed after backup; no merge applied')
                old = {slot(r): r for r in original}
                for row in records:
                    if encoded(old.get(slot(row))) == encoded(row):
                        continue
                    cursor.execute('INSERT INTO recipe_records (USER_ID,RECORD_DATE,MEAL_TYPE,RECIPE_NAME,DISH_IDS,DISH_DETAILS,IS_MANUAL,target_people,record_origin,is_deleted,revision,CREATE_TIME,UPDATE_TIME) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW()) ON DUPLICATE KEY UPDATE RECIPE_NAME=VALUES(RECIPE_NAME),DISH_IDS=VALUES(DISH_IDS),DISH_DETAILS=VALUES(DISH_DETAILS),IS_MANUAL=VALUES(IS_MANUAL),target_people=VALUES(target_people),record_origin=VALUES(record_origin),is_deleted=VALUES(is_deleted),revision=VALUES(revision),UPDATE_TIME=NOW()', tuple(row.get(k) for k in ['user_id','record_date','meal_type','recipe_name','dish_ids','dish_details','is_manual','target_people','record_origin','is_deleted','revision']))
                cursor.execute('SELECT * FROM recipe_records ORDER BY USER_ID,RECORD_DATE,MEAL_TYPE')
                merged = [{k.lower():v for k,v in r.items()} for r in cursor.fetchall()]
                cursor.execute("INSERT INTO meal_record_migration_state VALUES (%s,'merged',%s,%s)",(VERSION,receipt['backupSha256'],hashlib.sha256(encoded(merged).encode()).hexdigest()))
            connection.commit()
            with connection.cursor() as cursor:
                cursor.execute('RENAME TABLE meal_consumption TO meal_consumption_archive_v1')
                cursor.execute("UPDATE meal_record_migration_state SET status='complete' WHERE version=%s",(VERSION,))
            receipt['status'] = 'complete'
        except Exception:
            connection.rollback()
            # A failure after commit needs operator review, never an automatic re-merge.
            (out / 'failure.json').write_text(encoded({'status':'inspect_before_retry','backupSha256':receipt['backupSha256']}),encoding='utf-8')
            raise
    (out / 'receipt.json').write_text(encoded(receipt),encoding='utf-8')
    return receipt


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',required=True);parser.add_argument('--port',required=True,type=int)
    parser.add_argument('--backup-dir',required=True);parser.add_argument('--execute',action='store_true')
    parser.add_argument('--application-stopped',action='store_true')
    args=parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_]+',args.database):parser.error('Invalid explicit database')
    if args.execute and not args.application_stopped:parser.error('Stop writers before executing migration')
    import pymysql
    connection=pymysql.connect(host='127.0.0.1',port=args.port,user=os.environ['MEAL_MIGRATION_USER'],password=os.environ['MEAL_MIGRATION_PASSWORD'],database=args.database,charset='utf8mb4',autocommit=True,cursorclass=pymysql.cursors.DictCursor)
    try:print(encoded(migrate(connection,args.backup_dir,args.execute)))
    finally:connection.close()

if __name__=='__main__':main()
