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
                'docs/testing/experience-continuity-final.md',
                'docs/testing/experience-usability-findings.md',
                'docs/testing/experience-usability-protocol.md',
                'docs/history-not-bundled.md',
            ]
            for name in files:
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('synthetic fixture', encoding='utf-8')
            (source/'docs/testing/experience-continuity-final.md').write_text('[findings](experience-usability-findings.md)')
            (source/'docs/testing/experience-usability-findings.md').write_text('[protocol](experience-usability-protocol.md)')
            source_links='[history](docs/history-not-bundled.md) [private](recommend-service/.env) [local](C:/private/report.json)'
            (source/'DEVELOPER.md').write_text(source_links)
            for name in ['graph/nodes.py', 'prompts/recommendation.txt']:
                path = source / 'recommend-service' / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes((ROOT / 'recommend-service' / name).read_bytes())
            (source / 'recommend-service/.env').write_text('synthetic private setting')
            (source / 'utils').mkdir()
            (source / 'utils/config.js').write_text("const API_BASE_URL = 'https://chishenme.icu/api'\n", encoding='utf-8')
            (source / 'recommend-service/prompts/private.txt').write_text('synthetic private prompt')
            (source / 'recommend-service/private').mkdir()
            (source / 'recommend-service/private/provider_log.py').write_text('private sentinel')
            jar = source / 'backend/target/eatwhat-backend-1.0.0.jar'
            jar.parent.mkdir(parents=True)
            with zipfile.ZipFile(jar, 'w') as archive:
                archive.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\n')
                for controller in ('PublicCatalogController', 'MealWorkspaceController'):
                    archive.writestr('BOOT-INF/classes/com/eatwhat/controller/' + controller + '.class', b'\xca\xfe\xba\xbe\x00\x00\x00\x34')
            members = ['recipes.csv', 'quality.jsonl', 'issues.csv', 'changes.jsonl', 'source-recipes.jsonl', 'review-candidates.csv', 'profile.json', 'audit.md']
            for name in members:
                (bundle / name).write_text('synthetic public fixture', encoding='utf-8')
            (bundle/'source-recipes.jsonl').write_text('{"id":1,"user_id":null,"is_custom":0}\n')
            (bundle / 'manifest.json').write_text(json.dumps({
                'datasetVersion': 'synthetic-v1',
                'files': {name: hashlib.sha256((bundle / name).read_bytes()).hexdigest() for name in members},
            }), encoding='utf-8')
            with patch.object(packager, 'ROOT', source), \
                 patch.object(packager.subprocess, 'check_output', side_effect=['a'*40+'\n', '', '\0'.join(files)]):
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
            self.assertFalse((output / 'recommend-service/private/provider_log.py').exists())
            self.assertEqual(record['evidenceStatus'],'missing')
            self.assertTrue((output/'docs/testing/experience-usability-findings.md').is_file())
            self.assertTrue((output/'docs/testing/experience-usability-protocol.md').is_file())
            self.assertIn('[findings](experience-usability-findings.md)',(output/'docs/testing/experience-continuity-final.md').read_text())
            self.assertIn('repository source reference',(output/'DEVELOPER.md').read_text())
            self.assertFalse((output/'docs/history-not-bundled.md').exists())
            self.assertEqual((source/'DEVELOPER.md').read_text(),source_links)
            self.assertNotIn('C:/private',(output/'DEVELOPER.md').read_text())
            self.assertNotIn('recommend-service/.env',(output/'DEVELOPER.md').read_text())
            reference_index=json.loads((output/'documentation-references.json').read_text())
            self.assertEqual(reference_index['omittedLocalEvidenceCount'],2)
            references=reference_index['references']
            self.assertEqual(references,[{'document':'DEVELOPER.md','sourcePath':'docs/history-not-bundled.md',
                'sourceSha':'a'*40,'sourceFileSha256':hashlib.sha256((source/'docs/history-not-bundled.md').read_bytes()).hexdigest()}])
            report=base/'checks.json';report.write_text('{"result":"not-run"}')
            subjects=packager.component_subjects(output)
            evidence=base/'evidence.json'
            evidence.write_text(json.dumps({'schemaVersion':1,'entries':[{
                'kind':'regression','status':'partial','sourceSha':'b'*40,
                'subjects':subjects,'artifactFingerprint':packager.fingerprint(subjects),
                'report':'checks.json','reportSha256':packager.digest(report),
                'limits':['Synthetic packaging test only'],'privateRecord':'must not leave source'}]}))
            bound=json.loads(evidence.read_text());entry=bound['entries'][0]
            report.write_text(json.dumps({'evidenceBinding':{key:entry[key] for key in ('kind','status','sourceSha','artifactFingerprint','subjects')}}))
            entry['reportSha256']=packager.digest(report);evidence.write_text(json.dumps(bound))
            with patch.object(packager,'ROOT',source),patch.object(packager.subprocess,'check_output',side_effect=['a'*40+'\n','','\0'.join(files)]):
                packager.package(bundle,base/'bound-release',evidence_manifest=evidence)
            index=(base/'bound-release/evidence-index.json').read_text()
            self.assertNotIn('privateRecord',index)
            self.assertNotIn('checks.json',index)
            self.assertIn('identical-subject-bytes',index)
            (source/'app.js').write_text('changed actual application bytes')
            with patch.object(packager,'ROOT',source),patch.object(packager.subprocess,'check_output',side_effect=['a'*40+'\n','','\0'.join(files)]):
                with self.assertRaisesRegex(ValueError,'subject bytes changed'):
                    packager.package(bundle,base/'stale-release',evidence_manifest=evidence)
            self.assertFalse((base/'stale-release/release-manifest.json').exists())

    def test_document_link_cannot_escape_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);output=base/'release';output.mkdir()
            (output/'guide.md').write_text('[escape](../outside.md)')
            with self.assertRaisesRegex(ValueError,'leaves candidate'):
                packager.document_references(output,'a'*40,set())


if __name__ == '__main__':
    unittest.main()
