import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import legacy_dump


class LegacyDumpTest(unittest.TestCase):
    def read(self, definition, values):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'fixture.zip'
            with zipfile.ZipFile(archive, 'w') as output:
                output.writestr('fixture.sql', f'CREATE TABLE `history` ({definition}) ENGINE=InnoDB;\nINSERT INTO `history` VALUES {values};')
            with patch.object(legacy_dump, 'KNOWN_DUMP_SHA', hashlib.sha256(archive.read_bytes()).hexdigest()):
                return legacy_dump.read_dump(archive)

    def test_table_without_primary_key_preserves_repeated_rows(self):
        result = self.read('`id` int NOT NULL', '(1),(1),(2)')
        self.assertEqual(len(result['records']['history']), 3)

    def test_declared_primary_key_duplicates_still_fail(self):
        with self.assertRaisesRegex(legacy_dump.UnsupportedSQL, 'primary key'):
            self.read('`ID` int NOT NULL, PRIMARY KEY (`ID`)', '(1),(1)')

    def test_unique_index_duplicates_fail_but_nullable_keys_are_allowed(self):
        definition = '`ID` int, UNIQUE KEY `unique_id` (`ID`)'
        with self.assertRaisesRegex(legacy_dump.UnsupportedSQL, 'unique key'):
            self.read(definition, '(1),(1)')
        self.assertEqual(len(self.read(definition, '(NULL),(NULL),(1)')['records']['history']), 3)

    def test_empty_key_is_not_a_uniqueness_claim(self):
        self.assertEqual(legacy_dump.key_check([{'id': 1}, {'id': 2}], [])['groups'], 0)


if __name__ == '__main__':
    unittest.main()
