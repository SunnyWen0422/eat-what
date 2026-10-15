"""Restore a checksum-pinned prior anonymized backup into a NEW owned DB only.

The importing account has privileges on that new schema alone. Raw backup text,
private rows and credentials are never included in the evidence report.
"""
import hashlib
import json
from pathlib import Path
import re
import secrets
import subprocess
from maturity_runtime import digest,load


def validate_backup(backup,receipt):
    backup=Path(backup).absolute();receipt=Path(receipt).absolute()
    value=json.loads(receipt.read_text(encoding='utf-8'))
    if value.get('status')!='PASS' or value.get('backupFile')!=backup.name or backup.parent!=receipt.parent or backup.is_symlink() or digest(backup)!=value.get('backupSha256'):
        raise ValueError('Pinned anonymized rehearsal backup/receipt mismatch')
    if not isinstance(value.get('tables'),dict) or any(not re.fullmatch('[a-zA-Z_][a-zA-Z0-9_]*',t) for t in value['tables']):raise ValueError('Unsupported backup table identifiers')
    return value


def table_hashes(connection):
    result={}
    with connection.cursor() as c:
        c.execute('SHOW TABLES');names=[r[0] for r in c.fetchall()]
        for table in names:
            if not re.fullmatch('[a-zA-Z_][a-zA-Z0-9_]*',table):raise ValueError('Unsupported restored table identifier')
            c.execute('SELECT * FROM `'+table+'`')
            rows=sorted(hashlib.sha256(json.dumps(row,ensure_ascii=False,default=str,separators=(',',':')).encode()).hexdigest() for row in c.fetchall())
            result[table]={'rows':len(rows),'rowMultisetSha256':hashlib.sha256(''.join(rows).encode()).hexdigest()}
    return result


def rehearse(runtime,backup,receipt):
    expected=validate_backup(backup,receipt);a=runtime.api;cfg=runtime.config
    # No supplied target identifier, host, port or credential is accepted here.
    destination='eatwhat_maturity_test_'+secrets.token_hex(6);user='restore_'+secrets.token_hex(5);password=secrets.token_urlsafe(32)
    a.sql('CREATE DATABASE `'+destination+'` CHARACTER SET utf8mb4')
    a.sql("CREATE USER '"+user+"'@'localhost' IDENTIFIED BY %s",(password,))
    a.sql("GRANT ALL ON `"+destination+"`.* TO '"+user+"'@'localhost'")
    client=runtime.data/'restore-client.cnf'
    client.write_text('[client]\nhost=127.0.0.1\nport='+str(runtime.state['dbPort'])+'\nuser='+user+'\npassword='+password+'\nprotocol=TCP\n',encoding='utf-8')
    mysql=Path(cfg['mysqld']).parent/'mysql.exe'
    if not mysql.is_file():raise ValueError('Explicit installed MySQL client required')
    try:
        with Path(backup).open('rb') as source,(runtime.data/'restore-client.log').open('wb') as log:
            result=subprocess.run([str(mysql),'--defaults-extra-file='+str(client),'--default-character-set=utf8mb4','--database='+destination],stdin=source,stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),timeout=120)
        if result.returncode:raise RuntimeError('Owned restore failed; restricted account and private diagnostic retained')
    finally:client.unlink(missing_ok=True)
    import pymysql
    with pymysql.connect(host='127.0.0.1',port=runtime.state['dbPort'],user=user,password=password,database=destination,charset='utf8mb4',autocommit=True) as restored:
        actual=table_hashes(restored)
        if actual!=expected['tables']:raise AssertionError('Restored row multisets differ from pinned backup receipt')
        sql=load('candidate_restore_sql','scripts/run_mysql_integration.py')
        script=Path(__file__).resolve().parents[1]/'backend/db/migrations/V8_20__assistant_session_history_index.sql'
        with restored.cursor() as c:
            # The pinned older rehearsal predates the new assistant. Add its
            # independent tables before exercising the later additive indexes.
            for name in ('V8__assistant_v4_conversations.sql','V8_10__assistant_shopping_scope_aliases.sql'):
                for statement in sql.statements((script.parent/name).read_text(encoding='utf-8')):
                    c.execute(statement)
                    while c.nextset():pass
            # Simulate pre-index schema and an interrupted additive upgrade on the
            # NEW restoration. No original database or business row is modified.
            for table,index in [('assistant_v4_session','ix_av4_session_owner_updated'),('assistant_v4_turn','ix_av4_turn_session_updated')]:
                c.execute('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s AND INDEX_NAME=%s',(table,index))
                if c.fetchone()[0]:c.execute('ALTER TABLE '+table+' DROP INDEX '+index)
            statements=list(sql.statements(script.read_text(encoding='utf-8')))
            for statement in statements[:4]:
                c.execute(statement)
                while c.nextset():pass
            # Resume after the first independent index; then rerun the whole DDL.
            for _ in range(2):
                for statement in statements:
                    c.execute(statement)
                    while c.nextset():pass
            c.execute("SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND INDEX_NAME IN ('ix_av4_session_owner_updated','ix_av4_turn_session_updated')")
            if c.fetchone()[0]!=2:raise AssertionError('Resumed indexes absent')
            # The catalog count index is also additive and must survive replay.
            visibility=list(sql.statements((script.parent/'V8_30__catalog_visibility_index.sql').read_text(encoding='utf-8')))
            for _ in range(2):
                for statement in visibility:
                    c.execute(statement)
                    while c.nextset():pass
            c.execute("SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='food' AND INDEX_NAME='ix_food_visibility' ORDER BY SEQ_IN_INDEX")
            if [r[0].lower() for r in c.fetchall()]!=['user_id','is_published','id']:raise AssertionError('Visibility index differs')
        final=table_hashes(restored)
        if any(final.get(name)!=value for name,value in actual.items()) or any(value['rows'] for name,value in final.items() if name not in actual):raise AssertionError('Additive replay changed business rows')
    if digest(backup)!=expected['backupSha256']:raise AssertionError('Original backup changed')
    return {'status':'PASS','backupSha256':expected['backupSha256'],'tables':len(actual),'rows':sum(v['rows'] for v in actual.values()),'allRowMultisetsMatched':True,
            'freshRestrictedRestoreSchema':True,'newEmptyTables':len(final)-len(actual),'indexInterruptedResumeAndReplay':True,'visibilityIndexReplayed':True,'businessRowsUnchanged':True,'originalBackupUnchanged':True,'productionTouched':False,
            'scope':'Prior anonymized local rehearsal backup; this is not a fresh production export or a production cutover'}
