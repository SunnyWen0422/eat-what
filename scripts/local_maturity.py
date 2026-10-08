"""Owned local runtime, full governed catalog, no model adapter or production access."""
import argparse,json,time
from pathlib import Path
import local_v4 as runtime
ROOT=Path(__file__).resolve().parents[1]
runtime.DATA=ROOT/'.local-maturity-active'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['start','restart','serve','status','stop'])
    parser.add_argument('--keep-alive',action='store_true');parser.add_argument('--backup-zip');parser.add_argument('--quality-bundle');parser.add_argument('--java',default='D:/Java/bin/java.exe');parser.add_argument('--mysqld',default='C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe');args=parser.parse_args()
    if args.action=='start':
        if not args.backup_zip or not args.quality_bundle:raise ValueError('Explicit audited backup and governed bundle required')
        from bridge_legacy_local import prepare_source
        args.prepared_source=prepare_source(args.backup_zip,args.quality_bundle)
        print('Backup, quality bundle and migration preflight passed.',flush=True)
        args.legacy_backup=args.backup_zip;runtime.start(args);runtime.wait_for_basic_api();print('Local full-data V4 ready; no external model requests.',flush=True)
        if args.keep_alive:
            while True:time.sleep(1)
        return
    if args.action in ['restart','serve']:
        state=runtime.read_state();java=runtime.executable_path(args.java)
        runtime.stop_owned(state['javaPid'],[str(ROOT/'backend/target/eatwhat-backend-1.0.0.jar').replace('\\','/'),'local-v4','application-local.yml'])
        try:
            connection=runtime.pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password']);connection.close()
        except runtime.pymysql.OperationalError:
            runtime.available(state['dbPort']);binary=runtime.executable_path(state['mysqlExecutable'])
            process=runtime.subprocess.Popen([binary,'--no-defaults',f'--datadir={runtime.DATA/"mysql"}','--bind-address=127.0.0.1',f'--port={state["dbPort"]}',f'--log-error={runtime.DATA/"mysql.log"}','--mysqlx=OFF','--default-time-zone=+08:00'],creationflags=runtime.FLAGS)
            state['mysqlPid']=process.pid;deadline=time.monotonic()+35
            while True:
                try:
                    conn=runtime.pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password']);conn.close();break
                except runtime.pymysql.OperationalError:
                    if process.poll() is not None or time.monotonic()>deadline:raise RuntimeError('Owned local database did not start')
                    time.sleep(.25)
        runtime.start_java(state,java);runtime.wait_for_basic_api()
        print('Local governed V4 ready at http://127.0.0.1:18780/api; external models and voice remain disabled.',flush=True)
        if args.action=='serve':
            while True:time.sleep(1)
        return
    state=runtime.read_state()
    if args.action=='status':print(json.dumps({k:v for k,v in state.items() if k not in ['password','tokenSecret']},ensure_ascii=False));return
    runtime.stop_owned(state['javaPid'],[str(ROOT/'backend/target/eatwhat-backend-1.0.0.jar').replace('\\','/'),'local-v4','application-local.yml'])
    runtime.stop_owned(state['mysqlPid'],[str(runtime.DATA/'mysql').replace('\\','/')]);print('Only owned maturity processes stopped; data retained.')
if __name__=='__main__':main()
