"""Dump an owned rehearsal DB and restore it into another NEW owned local DB."""
import hashlib,json,secrets,subprocess
from pathlib import Path
import local_maturity
from bridge_legacy_local import validate_target

runtime=local_maturity.runtime


def main():
    state=runtime.read_state()
    rehearsal=json.loads((runtime.DATA/'bridge-rehearsal.json').read_text(encoding='utf-8'))
    source=rehearsal['database'];destination='eatwhat_maturity_test_'+secrets.token_hex(6)
    for database in [source,destination]:validate_target({'environment':'local','dbHost':'127.0.0.1','database':database})
    binaries=Path(state['mysqlExecutable']).parent
    config=runtime.DATA/('restore-client-'+secrets.token_hex(4)+'.cnf')
    backup=runtime.DATA/('rehearsal-backup-'+secrets.token_hex(4)+'.sql')
    config.write_text('[client]\nhost=127.0.0.1\nport='+str(state['dbPort'])+'\nuser=root\npassword='+state['password']+'\nprotocol=TCP\n',encoding='utf-8')
    conn=runtime.pymysql.connect(host='127.0.0.1',port=state['dbPort'],user='root',password=state['password'],autocommit=True,charset='utf8mb4')
    try:
        with backup.open('wb') as output:
            dump=subprocess.run([str(binaries/'mysqldump.exe'),'--defaults-extra-file='+str(config),'--default-character-set=utf8mb4','--single-transaction','--no-tablespaces','--skip-lock-tables',source],stdout=output,stderr=subprocess.PIPE,creationflags=runtime.FLAGS)
        if dump.returncode:raise RuntimeError('Local logical backup failed; source database retained')
        with conn.cursor() as cursor:cursor.execute(f'CREATE DATABASE `{destination}` CHARACTER SET utf8mb4')
        with backup.open('rb') as source_file:
            restored=subprocess.run([str(binaries/'mysql.exe'),'--defaults-extra-file='+str(config),'--default-character-set=utf8mb4','--database='+destination],stdin=source_file,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=runtime.FLAGS)
        if restored.returncode:
            (runtime.DATA/'restore-error.log').write_bytes(restored.stderr)
            raise RuntimeError('Restore into new local database failed; backup and private diagnostic retained')
        # Compare unordered row multisets, not just counts, including every new table.
        hashes={}
        with conn.cursor() as cursor:
            cursor.execute(f'SHOW TABLES FROM `{source}`');tables=[row[0] for row in cursor.fetchall()]
            cursor.execute(f'SHOW TABLES FROM `{destination}`')
            if {r[0] for r in cursor.fetchall()}!=set(tables):raise AssertionError('Restored table set differs')
            for table in tables:
                compared=[]
                for database in [source,destination]:
                    cursor.execute(f'SELECT * FROM `{database}`.`{table}`')
                    rows=sorted(hashlib.sha256(json.dumps(row,ensure_ascii=False,default=str,separators=(',',':')).encode()).hexdigest() for row in cursor.fetchall())
                    compared.append((len(rows),hashlib.sha256(''.join(rows).encode()).hexdigest()))
                if compared[0]!=compared[1]:raise AssertionError('Restored row content differs: '+table)
                hashes[table]={'rows':compared[0][0],'rowMultisetSha256':compared[0][1]}
        report={'status':'PASS','sourceDatabase':source,'restoredDatabase':destination,'backupFile':backup.name,'backupSha256':hashlib.sha256(backup.read_bytes()).hexdigest(),'tables':hashes,'productionTouched':False}
        (runtime.DATA/'restore-rehearsal.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'status':'PASS','tables':len(tables),'rows':sum(x['rows'] for x in hashes.values()),'scope':'owned local backup and restoration; every row compared'}))
    finally:
        conn.close();config.unlink()


if __name__=='__main__':main()
