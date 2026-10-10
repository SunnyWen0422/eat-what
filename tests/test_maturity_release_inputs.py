import importlib.util
from pathlib import Path
import hashlib,json,sys,tempfile,unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('maturity_release',ROOT/'scripts/package_maturity_release.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

class ReleaseInputsTest(unittest.TestCase):
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
