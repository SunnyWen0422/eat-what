import importlib.util
from pathlib import Path
import hashlib,json,sys,tempfile,unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('maturity_release',ROOT/'scripts/package_maturity_release.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

class ReleaseInputsTest(unittest.TestCase):
    def test_package_excludes_private_configuration_and_owned_catalog_rows(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'source-recipes.jsonl'
            source.write_text('{"id":1,"user_id":null,"is_custom":0}\n')
            release.check_public_catalog(root)
            for row in ({'user_id':7},{'user_id':None,'is_custom':1}):
                source.write_text(json.dumps(row))
                with self.assertRaisesRegex(ValueError,'Private/user'):
                    release.check_public_catalog(root)

    def test_stale_report_cannot_certify_changed_application_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);report=root/'report.json';report.write_text('{"passed":true}')
            subjects={'java':'a'*64,'config:owned':'b'*64,'data:catalog':'c'*64}
            entry={'kind':'performance','status':'verified','sourceSha':'a'*40,
                   'artifactFingerprint':release.fingerprint(subjects),'subjects':subjects,
                   'report':'report.json','reportSha256':release.digest(report),'limits':['Local MOCK only']}
            report.write_text(json.dumps({'evidenceBinding':{key:entry[key] for key in ('kind','status','sourceSha','artifactFingerprint','subjects')}}))
            entry['reportSha256']=release.digest(report)
            manifest=root/'evidence.json';manifest.write_text(json.dumps({'schemaVersion':1,'entries':[entry]}))
            result=release.validate_evidence(manifest,subjects,'b'*40)
            self.assertEqual(result['entries'][0]['reuse'],'identical-subject-bytes')
            self.assertNotIn('report',result['entries'][0])
            changed=dict(subjects,java='d'*64)
            altered=dict(entry,subjects=changed,artifactFingerprint=release.fingerprint(changed))
            manifest.write_text(json.dumps({'schemaVersion':1,'entries':[altered]}))
            with self.assertRaisesRegex(ValueError,'report subject binding'):
                release.validate_evidence(manifest,changed,'b'*40)
            manifest.write_text(json.dumps({'schemaVersion':1,'entries':[entry]}))
            with self.assertRaisesRegex(ValueError,'subject'):
                release.validate_evidence(manifest,dict(subjects,java='d'*64),'b'*40)
            report.write_text('{"passed":false}')
            with self.assertRaisesRegex(ValueError,'report'):
                release.validate_evidence(manifest,subjects,'b'*40)

    def test_missing_evidence_yields_draft_not_deployable(self):
        result=release.validate_evidence(None,{},'a'*40)
        self.assertEqual(result['evidenceStatus'],'missing')
        self.assertFalse(result['deploymentAllowed'])
        self.assertEqual(result['status'],'DRAFT')

    def test_blocked_not_run_and_performance_miss_remain_visible(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);report=root/'report';report.write_text('limited')
            subjects={'java':'a'*64,'config:owned':'b'*64,'data:catalog':'c'*64}
            for status in ('blocked','not-run','failed','performance-miss'):
                entry={'kind':'performance','status':status,'sourceSha':'a'*40,'subjects':subjects,
                       'artifactFingerprint':release.fingerprint(subjects),'report':'report',
                       'reportSha256':release.digest(report),'limits':['Gate not met']}
                report.write_text(json.dumps({'evidenceBinding':{key:entry[key] for key in ('kind','status','sourceSha','artifactFingerprint','subjects')}}))
                entry['reportSha256']=release.digest(report)
                manifest=root/'manifest';manifest.write_text(json.dumps({'schemaVersion':1,'entries':[entry]}))
                result=release.validate_evidence(manifest,subjects,'a'*40)
                self.assertEqual(result['evidenceStatus'],'partial')
                self.assertEqual(result['entries'][0]['status'],status)
                self.assertFalse(result['deploymentAllowed'])

    def test_candidate_metadata_never_converts_partial_evidence_to_release_approval(self):
        value=release.candidate_metadata('a'*40,[],{'steps':[]})
        self.assertEqual('a'*40,value['sourceSha'])
        self.assertEqual(11,value['capabilities']['assistantReads'])
        self.assertEqual(3,value['capabilities']['assistantDirectWrites'])
        self.assertTrue(value['openGates'])
        self.assertIn('restore',value['rollback'])
        with self.assertRaises(ValueError):release.candidate_metadata('not-a-sha',[],None)

    def test_project_relative_output_normalizes_parent_segments(self):
        source=ROOT/'..'/'work'/'independent-web-fixes-20261010'/'release-local-final'
        result=release.release_path(source)
        self.assertNotIn('..',result.parts)
        self.assertEqual(result,ROOT.parent/'work/independent-web-fixes-20261010/release-local-final')
        self.assertFalse(result.is_relative_to(ROOT))

    def test_receipt_reads_actual_api_and_rejects_ambiguous_or_private_urls(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);(root/'utils').mkdir();config=root/'utils/config.js'
            for url in ['https://chishenme.icu/api','http://127.0.0.1:18780/api']:
                config.write_text("const API_BASE_URL = '"+url+"'\n")
                self.assertEqual(release.frontend_api(root),url)
            for text in ["const API_BASE_URL = getSecret()", "const API_BASE_URL = 'https://user:pass@example.com/api'", "const API_BASE_URL = 'http://example.com/api'", "const API_BASE_URL = 'https://example.com/api?token=x'", "const API_BASE_URL = 'https://example.com/api'\nconst API_BASE_URL = 'https://other.com/api'"]:
                config.write_text(text)
                with self.assertRaises(ValueError):release.frontend_api(root)

    def test_production_python_inputs_include_prompts_and_policy_without_runtime_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            files=['recommend-service/main.py','recommend-service/requirements.txt','recommend-service/prompts/recommendation.txt',
                   'docs/assistant/agent-policy.json','docs/assistant/agent.md','docs/assistant/spec.md','docs/assistant/data-policy.md',
                   'recommend-service/.env','recommend-service/chat_memory.json','recommend-service/dish_meta.json']
            for name in files:
                target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text('fixture')
            names={relative.as_posix() for _,relative in release.python_inputs(root)}
            self.assertIn('recommend-service/prompts/recommendation.txt',names)
            self.assertIn('docs/assistant/agent-policy.json',names)
            self.assertNotIn('recommend-service/.env',names)
            self.assertNotIn('recommend-service/dish_meta.json',names)
            self.assertNotIn('recommend-service/chat_memory.json',names)

    def test_modified_or_approved_migration_receipt_cannot_enter_local_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);files={}
            for name in ['legacy-to-v4.sql','steps.json','contracts.json']:
                data=b'fixture';(root/name).write_bytes(data)
                files[name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
            receipt={'mode':'prepare-only','productionApproved':False,'migrationRegistryWrites':0,'files':files}
            (root/'preflight.json').write_text(json.dumps(receipt))
            self.assertEqual(release.check_prepared_migration(root)['mode'],'prepare-only')
            (root/'steps.json').write_text('changed')
            with self.assertRaises(ValueError):release.check_prepared_migration(root)
            (root/'steps.json').write_text('fixture');receipt['productionApproved']=True
            (root/'preflight.json').write_text(json.dumps(receipt))
            with self.assertRaises(ValueError):release.check_prepared_migration(root)
