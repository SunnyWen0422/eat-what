"""Disposable MySQL acceptance, including migration and the real Java mapper.
Never adopts existing databases/processes; no real model or production calls.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time
import pymysql
from unify_meal_records import migrate, encoded

ROOT=Path(__file__).resolve().parents[1]


class ArchiveInterruption:
    """Only the final rename is fault-injected; preceding SQL is real MySQL."""
    def __init__(self, connection): self.connection=connection
    def __getattr__(self, name): return getattr(self.connection,name)
    def cursor(self):
        raw=self.connection.cursor()
        class Cursor:
            def __enter__(self): raw.__enter__(); return self
            def __exit__(self,*args): return raw.__exit__(*args)
            def __getattr__(self,name): return getattr(raw,name)
            def execute(self,statement,*args):
                if statement.startswith('RENAME TABLE'): raise RuntimeError('synthetic archive interruption')
                return raw.execute(statement,*args)
        return Cursor()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--mysqld',required=True);parser.add_argument('--maven',required=True);parser.add_argument('--repository',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args();out=Path(args.output).absolute();out.mkdir(parents=True,exist_ok=False)
    binary=Path(args.mysqld).absolute()
    if not binary.is_file() or binary.is_symlink():raise ValueError('Explicit MySQL binary required')
    data=out/'mysql';data.mkdir();flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
    subprocess.run([str(binary),'--no-defaults','--initialize-insecure',f'--datadir={data}',f'--log-error={out / "mysql.log"}'],check=True,creationflags=flags)
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    process=subprocess.Popen([str(binary),'--no-defaults',f'--datadir={data}','--bind-address=127.0.0.1',f'--port={port}',f'--log-error={out / "mysql.log"}','--mysqlx=OFF','--default-time-zone=+08:00'],creationflags=flags)
    connection=None
    try:
        last_error=None
        for _ in range(100):
            if process.poll() is not None:break
            try:connection=pymysql.connect(host='127.0.0.1',port=port,user='root',password='',connect_timeout=1,charset='utf8mb4',autocommit=True,cursorclass=pymysql.cursors.DictCursor);break
            except pymysql.Error as error:last_error=error;time.sleep(.2)
        if not connection:raise RuntimeError(f'Owned MySQL unavailable (process exit={process.poll()}, connection={last_error})')
        password=secrets.token_urlsafe(24);database='eatwhat_v4_test_'+secrets.token_hex(5)
        with connection.cursor() as c:
            c.execute("ALTER USER 'root'@'localhost' IDENTIFIED BY %s",(password,));c.execute(f'CREATE DATABASE `{database}` CHARACTER SET utf8mb4');c.execute(f'USE `{database}`')
            c.execute('CREATE TABLE users(id BIGINT PRIMARY KEY)');c.execute('INSERT INTO users VALUES (1),(2)')
            c.execute('CREATE TABLE recipe_records(ID BIGINT PRIMARY KEY AUTO_INCREMENT,USER_ID BIGINT,RECORD_DATE DATE,MEAL_TYPE VARCHAR(16),RECIPE_NAME VARCHAR(255),DISH_IDS JSON,DISH_DETAILS JSON,IS_MANUAL INT,target_people INT,record_origin VARCHAR(16),is_deleted BOOLEAN DEFAULT FALSE,revision BIGINT DEFAULT 1,CREATE_TIME DATETIME,UPDATE_TIME DATETIME,UNIQUE KEY slot(USER_ID,RECORD_DATE,MEAL_TYPE))')
            c.execute('CREATE TABLE meal_consumption(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT,meal_date DATE,meal_type VARCHAR(16),status VARCHAR(16),revision BIGINT DEFAULT 1,source_record_id BIGINT,planned_snapshot_json JSON,actual_dishes_json JSON,created_at DATETIME,updated_at DATETIME)')
            c.execute('CREATE TABLE favorites(user_id BIGINT,dish_id BIGINT)');c.execute('INSERT INTO favorites VALUES(1,9)')
            c.execute('CREATE TABLE shopping(id BIGINT,quantity VARCHAR(30),checked BOOLEAN)');c.execute("INSERT INTO shopping VALUES (1,'适量',TRUE)")
            for user,day,meal in [(1,'2026-10-25','dinner'),(1,'2026-10-26','dinner'),(1,'2026-10-25','lunch'),(2,'2026-10-25','dinner')]:
                c.execute("INSERT INTO recipe_records(USER_ID,RECORD_DATE,MEAL_TYPE,RECIPE_NAME,DISH_IDS,DISH_DETAILS,IS_MANUAL,target_people,record_origin,CREATE_TIME,UPDATE_TIME) VALUES (%s,%s,%s,'旧菜单','[9]',%s,0,2,'manual','2026-10-25 10:00:00','2026-10-25 10:00:00')",(user,day,meal,encoded([{'id':9,'name':'青菜','type':'veg'}])))
            for meal,status in [('dinner','eaten'),('lunch','skipped')]:
                c.execute("INSERT INTO meal_consumption(user_id,meal_date,meal_type,status,actual_dishes_json,updated_at) VALUES (1,'2026-10-25',%s,%s,%s,'2026-10-25 11:00:00')",(meal,status,encoded([{'name':'修改后的面条'}]) if status=='eaten' else '[]'))
            c.execute('SELECT * FROM favorites');favorites=c.fetchall();c.execute('SELECT * FROM shopping');shopping=c.fetchall()
        assert migrate(connection,out/'dry-run',False)['status']=='dry_run'
        try:
            migrate(ArchiveInterruption(connection),out/'backup',True)
            raise AssertionError('Fault injection did not run')
        except RuntimeError as error:
            assert str(error)=='synthetic archive interruption'
        receipt=migrate(connection,out/'resume',True);assert receipt['status']=='complete'
        assert migrate(connection,out/'unused',True)['status']=='already_complete'
        with connection.cursor() as c:
            c.execute('SELECT * FROM favorites');assert c.fetchall()==favorites
            c.execute('SELECT * FROM shopping');assert c.fetchall()==shopping
            c.execute("SELECT RECIPE_NAME,is_deleted FROM recipe_records WHERE USER_ID=1 AND RECORD_DATE='2026-10-25' AND MEAL_TYPE='dinner'");assert c.fetchone()['RECIPE_NAME']=='旧菜单'
            c.execute("SELECT is_deleted FROM recipe_records WHERE USER_ID=1 AND RECORD_DATE='2026-10-25' AND MEAL_TYPE='lunch'");assert c.fetchone()['is_deleted']==1
        env=os.environ.copy();env.update(V4_TEST_JDBC=f'jdbc:mysql://127.0.0.1:{port}/{database}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8',V4_TEST_PASSWORD=password,MEAL_RECORD_CONTRACT_OUTPUT=str(out/'java-record-contract.json'))
        cmd=[args.maven,'-q','-o','-f',str(ROOT/'backend/pom.xml'),'-Dmaven.repo.local='+str(Path(args.repository).absolute()),'-Deatwhat.build.directory='+str(out/'java'),'-Dtest=UnifiedMealRecordMysqlIT','test']
        result=subprocess.run(cmd,env=env,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,creationflags=flags);(out/'java.log').write_bytes(result.stdout)
        if result.returncode:raise RuntimeError('Java real database acceptance failed; inspect java.log')
        # Validate the exact serialized Java context row using the production Python schema.
        import sys
        sys.path.insert(0,str(ROOT/'recommend-service'))
        from assistant_v4_schema import ACTUAL, validate
        validate(json.loads((out/'java-record-contract.json').read_text(encoding='utf-8')),ACTUAL)
        (out/'result.json').write_text(encoded({'migration':receipt,'mapper':'passed','javaPythonContract':'passed','favoritesPreserved':True,'shoppingPreserved':True,'realModelCalls':0,'interruptedArchiveRecovery':True}),encoding='utf-8')
        print('PASS: migration, rerun, owned SQL reads, date boundary, Java/Python serialization, preserved shopping/favorites')
    finally:
        if connection:
            try:
                with connection.cursor() as c:c.execute('SHUTDOWN')
            except pymysql.Error:pass
            connection.close()
        try:process.wait(timeout=12)
        except subprocess.TimeoutExpired:process.terminate();process.wait(timeout=12)
        (out/'cleanup.json').write_text(encoded({'ownedPid':process.pid,'exited':process.poll() is not None}),encoding='utf-8')

if __name__=='__main__':main()
