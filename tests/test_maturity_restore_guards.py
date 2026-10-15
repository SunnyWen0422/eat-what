import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]

class MaturityRestoreGuardsTest(unittest.TestCase):
    def test_missing_changed_or_foreign_backup_rejected_without_database(self):
        sys.path.insert(0,str(ROOT/'scripts'))
        try:
            import rehearse_maturity_candidate as m
            with tempfile.TemporaryDirectory() as folder:
                root=Path(folder);backup=root/'backup.sql';backup.write_bytes(b'synthetic only');receipt=root/'receipt.json'
                value={'status':'PASS','backupFile':backup.name,'backupSha256':hashlib.sha256(backup.read_bytes()).hexdigest(),'tables':{'food':{'rows':0}}}
                receipt.write_text(json.dumps(value));self.assertEqual(value,m.validate_backup(backup,receipt))
                for change in ({'status':'FAIL'},{'backupFile':'other.sql'},{'backupSha256':'0'*64},{'tables':{'food`;DROP DATABASE food;--':{}}}):
                    receipt.write_text(json.dumps(dict(value,**change)))
                    with self.assertRaises(ValueError):m.validate_backup(backup,receipt)
                receipt.write_text(json.dumps(value));backup.write_bytes(b'changed')
                with self.assertRaises(ValueError):m.validate_backup(backup,receipt)
        finally:sys.path.remove(str(ROOT/'scripts'))

if __name__=='__main__':unittest.main()
