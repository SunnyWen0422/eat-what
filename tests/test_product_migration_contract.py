"""Static release contract only; does not execute SQL or connect to a database."""
import hashlib
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = ('V6_10__personal_menus', 'V6_20__controlled_harness')


class ProductMigrationContractTest(unittest.TestCase):
    def test_new_migrations_are_listed_with_verified_checksums(self):
        rows = json.loads((ROOT/'backend/db/migration-manifest.json').read_text())['migrations']
        by_version = {row['version']: row for row in rows}
        for version in VERSIONS:
            with self.subTest(version=version):
                self.assertIn(version, by_version)
                row = by_version[version]
                content = (ROOT/'backend/db/migrations'/row['file']).read_bytes().replace(b'\r\n',b'\n')
                self.assertEqual(row['checksumSha256'], hashlib.sha256(content).hexdigest())

    def test_new_migrations_record_lineage_and_do_not_destroy_live_tables(self):
        for version in VERSIONS:
            with self.subTest(version=version):
                text = (ROOT/'backend/db/migrations'/(version+'.sql')).read_text()
                self.assertRegex(text, r'INSERT\s+INTO\s+schema_migrations')
                self.assertIn("'"+version+"'", text)
                self.assertFalse(re.search(r'^\s*(?:DROP\s+TABLE|TRUNCATE\s+TABLE|USE\s+food)\b', text, re.I|re.M))


if __name__ == '__main__':
    unittest.main()
