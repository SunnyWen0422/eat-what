"""Inject two local migration interruptions and verify resume against real MySQL."""
import argparse,json,secrets
from pathlib import Path
import local_maturity
from bridge_legacy_local import prepare_source,restore_and_bridge,validate_target

runtime=local_maturity.runtime


class InterruptedCursor:
    def __init__(self,cursor,owner):self.cursor=cursor;self.owner=owner
    def __enter__(self):self.cursor.__enter__();return self
    def __exit__(self,*args):return self.cursor.__exit__(*args)
    def __getattr__(self,key):return getattr(self.cursor,key)
    def execute(self,sql,*args):
        if self.owner.interrupt and self.owner.interrupt in sql:
            self.owner.interrupt=None
            raise RuntimeError('REHEARSAL_INTERRUPTION')
        return self.cursor.execute(sql,*args)


class InterruptedConnection:
    def __init__(self,connection):self.connection=connection;self.interrupt=None
    def __getattr__(self,key):return getattr(self.connection,key)
    def cursor(self):return InterruptedCursor(self.connection.cursor(),self)


def rehearse(backup,bundle):
    state=runtime.read_state()  # owned path, loopback and isolated database guard
    source=prepare_source(backup,bundle)
    database='eatwhat_maturity_test_'+secrets.token_hex(6)
    target={'environment':'local','dbHost':'127.0.0.1','database':database,'anonymizationSalt':secrets.token_hex(32)}
    validate_target(target)
    raw=runtime.pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password'],autocommit=True,charset='utf8mb4',connect_timeout=3)
    conn=InterruptedConnection(raw);checks=[]
    try:
        with raw.cursor() as cursor:cursor.execute(f'CREATE DATABASE `{database}` CHARACTER SET utf8mb4');cursor.execute(f'USE `{database}`')
        for point in ['SELECT COUNT(*) FROM `users`','CALL apply_v6_10_personal_menus()']:
            conn.interrupt=point
            try:restore_and_bridge(conn,backup,target,bundle,source)
            except RuntimeError as error:
                if str(error)!='REHEARSAL_INTERRUPTION':raise
                checks.append({'case':point,'status':'interruption-injected'})
            else:raise AssertionError('Rehearsal did not reach the interruption point')
        first=restore_and_bridge(conn,backup,target,bundle,source)
        repeated=restore_and_bridge(conn,backup,target,bundle,source)
        if first!=repeated:raise AssertionError('Repeated bridge changed its result')
        with raw.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM users WHERE session_key IS NOT NULL OR phone IS NOT NULL OR avatar IS NOT NULL')
            if cursor.fetchone()[0]:raise AssertionError('Authentication or profile identifiers survived anonymization')
            cursor.execute('SELECT COUNT(*) FROM dish_quality_profile')
            if cursor.fetchone()[0]!=6665:raise AssertionError('Quality coverage mismatch')
            cursor.execute("SELECT COUNT(*) FROM shopping_item WHERE source_base_people IS NULL AND calculation_status='CALCULATED'")
            if cursor.fetchone()[0]:raise AssertionError('Legacy unbased quantities still claim calculated')
        checks.append({'case':'resume-repeat-anonymization-and-quality','status':'PASS'})
        result={'status':'PASS','database':database,'checks':checks,'restoredCounts':first['restoredCounts'],'modelRequests':0,'productionTouched':False,'rollbackRestoration':'not tested'}
    finally:raw.close()
    output=runtime.DATA/'bridge-rehearsal.json';output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--backup-zip',required=True);p.add_argument('--quality-bundle',required=True);args=p.parse_args()
    print(json.dumps(rehearse(args.backup_zip,args.quality_bundle),ensure_ascii=False,indent=2))
