import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('maturity_packager_under_test', ROOT / 'scripts/package_maturity_release.py')
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class MaturityReleasePackageTest(unittest.TestCase):
    def test_package_contains_required_prompt_and_hash_without_unlisted_private_assets(self):
        # Read the graph and prompt as inert bytes, never import recommendation modules.
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source, bundle, output = base / 'source', base / 'bundle', base / 'release'
            source.mkdir()
            bundle.mkdir()
            files = [
                'app.js', 'backend/src/main/resources/application.yml.example',
                'recommend-service/.env.example', 'recommend-service/requirements.txt',
                'backend/db/migration-manifest.json',
                *['scripts/' + name for name in ['catalog_quality.py', 'catalog-quality-rules.json', 'build_catalog_quality.py', 'validate_catalog_reviews.py', 'legacy_dump.py', 'bridge_legacy_local.py', 'run_mysql_integration.py', 'check_test_environment.py']],
                'docs/release/local-maturity-cutover.md', 'docs/testing/2026-10-08-local-maturity-results.md',
                'docs/testing/local-maturity-page-matrix.md', 'docs/database/legacy-to-v4-local-bridge.md',
                'DEVELOPER.md', 'docs/testing/local-verification.md', 'docs/database/legacy-v4-release-preflight.md',
                'scripts/prepare_legacy_v4_release.py', 'scripts/quality_sidecar.py', 'scripts/build_assistant_index.py',
                *['docs/assistant/' + name for name in ['agent-policy.json', 'agent.md', 'spec.md', 'data-policy.md']],
            ]
            for name in files:
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('synthetic fixture', encoding='utf-8')
            for name in ['graph/nodes.py', 'prompts/recommendation.txt']:
                path = source / 'recommend-service' / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes((ROOT / 'recommend-service' / name).read_bytes())
            (source / 'recommend-service/.env').write_text('synthetic private setting')
            (source / 'utils').mkdir()
            (source / 'utils/config.js').write_text("const API_BASE_URL = 'https://chishenme.icu/api'\n", encoding='utf-8')
            (source / 'recommend-service/prompts/private.txt').write_text('synthetic private prompt')
            jar = source / 'backend/target/eatwhat-backend-1.0.0.jar'
            jar.parent.mkdir(parents=True)
            with zipfile.ZipFile(jar, 'w') as archive:
                archive.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\n')
                for controller in ('PublicCatalogController', 'MealWorkspaceController'):
                    archive.writestr('BOOT-INF/classes/com/eatwhat/controller/' + controller + '.class', b'\xca\xfe\xba\xbe\x00\x00\x00\x34')
            members = ['recipes.csv', 'quality.jsonl', 'issues.csv', 'changes.jsonl', 'source-recipes.jsonl', 'review-candidates.csv', 'profile.json', 'audit.md']
            for name in members:
                (bundle / name).write_text('synthetic public fixture', encoding='utf-8')
            (bundle / 'manifest.json').write_text(json.dumps({
                'datasetVersion': 'synthetic-v1',
                'files': {name: hashlib.sha256((bundle / name).read_bytes()).hexdigest() for name in members},
            }), encoding='utf-8')
            with patch.object(packager, 'ROOT', source), \
                 patch.object(packager.subprocess, 'check_output', side_effect=['synthetic-commit\n', '']):
                result = packager.package(bundle, output)
            prompt = output / 'recommend-service/prompts/recommendation.txt'
            self.assertTrue((output / 'recommend-service/graph/nodes.py').is_file())
            self.assertTrue(prompt.is_file(), 'The graph requires its package-relative recommendation prompt')
            self.assertEqual(prompt.read_bytes(), (ROOT / 'recommend-service/prompts/recommendation.txt').read_bytes())
            record = json.loads((output / 'release-manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(record['files']['recommend-service/prompts/recommendation.txt'], hashlib.sha256(prompt.read_bytes()).hexdigest())
            self.assertEqual(result['status'], 'DRAFT')
            self.assertFalse(record['deploymentAllowed'])
            self.assertFalse((output / 'recommend-service/.env').exists())
            self.assertFalse((output / 'recommend-service/prompts/private.txt').exists())


if __name__ == '__main__':
    unittest.main()
