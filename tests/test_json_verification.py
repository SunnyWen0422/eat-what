import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / '.test-artifacts/json-verification'
SCRATCH.mkdir(parents=True, exist_ok=True)


class JsonVerificationTest(unittest.TestCase):
    def helper(self):
        spec = importlib.util.spec_from_file_location('check_json_files', ROOT / 'scripts/check_json_files.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_accepts_npm_empty_package_key_and_case_sensitive_keys(self):
        helper = self.helper()
        with tempfile.TemporaryDirectory(dir=SCRATCH) as directory:
            root = Path(directory)
            (root / 'package-lock.json').write_text('{"packages":{"":{}},"$C":1,"$c":2}', encoding='utf-8')
            self.assertEqual(helper.check(root), (1, []))

    def test_rejects_invalid_source_json_without_echoing_contents(self):
        helper = self.helper()
        with tempfile.TemporaryDirectory(dir=SCRATCH) as directory:
            root = Path(directory)
            for index, content in enumerate(['{"secret": PRIVATE}', '{"x":1,"x":2}', '{"x":NaN}']):
                (root / f'bad-{index}.json').write_text(content, encoding='utf-8')
            count, errors = helper.check(root)
            self.assertEqual(count, 3)
            self.assertEqual(len(errors), 3)
            self.assertNotIn('PRIVATE', str(errors))

    def test_prunes_dependencies_generated_outputs_and_private_runtime(self):
        helper = self.helper()
        with tempfile.TemporaryDirectory(dir=SCRATCH) as directory:
            root = Path(directory)
            for name in ['node_modules', 'dist', 'target', 'release', '.local-maturity-123', '.local-v4', 'test-results']:
                folder = root / 'web' / name
                folder.mkdir(parents=True)
                (folder / 'private.json').write_text('invalid', encoding='utf-8')
            source = root / 'web/src'
            source.mkdir()
            (source / 'config.json').write_text('{}', encoding='utf-8')
            self.assertEqual(helper.check(root), (1, []))

    def test_miniprogram_package_explicitly_excludes_web(self):
        config = json.loads((ROOT / 'project.config.json').read_text(encoding='utf-8'))
        self.assertIn({'type': 'folder', 'value': 'web'}, config['packOptions']['ignore'])

    def test_plan_evidence_is_excluded_but_invalid_source_still_fails(self):
        helper = self.helper()
        with tempfile.TemporaryDirectory(dir=SCRATCH) as directory:
            root = Path(directory)
            evidence = root / '.superpowers/sdd/plan/native-compile'
            evidence.mkdir(parents=True)
            (evidence / 'compiler-output.json').write_text('generated non-JSON diagnostic', encoding='utf-8')
            source = root / 'contracts'
            source.mkdir()
            (source / 'valid.json').write_text('{}', encoding='utf-8')
            self.assertEqual((1, []), helper.check(root))
            (source / 'invalid.json').write_text('{broken', encoding='utf-8')
            count, errors = helper.check(root)
            self.assertEqual(2, count)
            self.assertEqual(['contracts/invalid.json: JSONDecodeError'], errors)


if __name__ == '__main__':
    unittest.main()
