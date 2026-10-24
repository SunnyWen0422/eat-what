import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from build_canonical_catalog import verify_build


class BuildReceiptTest(unittest.TestCase):
    def test_receipt_rejects_old_archive_changed_source_and_changes_during_build(self):
        with tempfile.TemporaryDirectory() as directory:
            jar, manifest = Path(directory)/'candidate.jar', Path(directory)/'build.json'
            jar.write_bytes(b'candidate')
            receipt = {'purpose':'canonical-catalog-isolated-build','sourceBefore':'same','sourceAfter':'same',
                       'jarSha256':hashlib.sha256(jar.read_bytes()).hexdigest()}
            manifest.write_text(json.dumps(receipt),encoding='utf-8')
            with patch('build_canonical_catalog.backend_fingerprint',return_value='same'), patch('build_canonical_catalog.validate_jar') as archive_check:
                verify_build(jar,manifest)
                archive_check.assert_called_once_with(jar)
                jar.write_bytes(b'older-package')
                with self.assertRaises(ValueError):verify_build(jar,manifest)
                jar.write_bytes(b'candidate')
                manifest.write_text(json.dumps({**receipt,'sourceBefore':'different'}),encoding='utf-8')
                with self.assertRaises(ValueError):verify_build(jar,manifest)
            manifest.write_text(json.dumps(receipt),encoding='utf-8')
            with patch('build_canonical_catalog.backend_fingerprint',return_value='edited'):
                with self.assertRaises(ValueError):verify_build(jar,manifest)


if __name__ == '__main__':unittest.main()
