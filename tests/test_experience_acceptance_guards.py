"""No network/process/DB is needed to reject an unsafe experience run."""
import copy
import importlib
import json
from pathlib import Path
import socket
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))


class ExperienceAcceptanceGuards(unittest.TestCase):
    def setUp(self):
        self.runner = importlib.import_module('run_experience_acceptance')
        self.config = {'purpose':'product-maturity-isolated','sourceSha':'a'*40,
            'datasetHash':'b'*64,'loopbackApi':'http://127.0.0.1:18780/api',
            'privateDb':'eatwhat_maturity_local_01234567','providerMode':'mock',
            'newInstance':True,'ownedProcessManifest':'runtime.json','modelBudgetLedger':None,
            'jarSha256':'c'*64,'buildSourceFingerprint':'d'*64}

    def test_production_like_config_is_rejected_before_any_write(self):
        for field, value in [('loopbackApi','https://chishenme.icu/api'),
                ('privateDb','food'),('ownedProcessManifest','../runtime.json'),
                ('newInstance',False),('providerMode','live'),('port',3306)]:
            bad = dict(self.config, **{field:value})
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp) / 'untouched'
                with patch.object(self.runner, 'owned_runtime') as start:
                    with self.assertRaises(ValueError):
                        self.runner.run(bad, ROOT/'scripts/acceptance/experience-continuity-cases.json', out, 'journey')
                    start.assert_not_called()
                    self.assertFalse(out.exists())

    def test_case_contract_requires_all_journeys_and_every_fault(self):
        source = ROOT/'scripts/acceptance/experience-continuity-cases.json'
        cases = self.runner.load_cases(source)
        self.assertEqual(['J%02d'%i for i in range(1,13)], [c['id'] for c in cases['journeys']])
        self.assertEqual(20, len(cases['faults']))
        for section, mutation in [('journeys',lambda rows:rows.pop()),
                                  ('faults',lambda rows:rows.pop())]:
            bad = copy.deepcopy(cases); mutation(bad[section])
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp)/'bad.json';path.write_text(json.dumps(bad))
                with self.assertRaises(ValueError):self.runner.load_cases(path)

    def runtime_fixture(self, directory):
        config=dict(self.config)
        jar=directory/'candidate.jar'
        with zipfile.ZipFile(jar,'w') as archive:
            archive.writestr('META-INF/MANIFEST.MF','Main-Class: org.springframework.boot.loader.JarLauncher\nStart-Class: com.eatwhat.EatWhatApplication\n')
            archive.writestr('BOOT-INF/classes/com/eatwhat/EatWhatApplication.class',b'fixture')
        config.update(jar=str(jar),jarSha256=self.runner.digest(jar))
        build=directory/'build.json'
        build.write_text(json.dumps({'jarSha256':config['jarSha256'],'backendFingerprint':config['buildSourceFingerprint']}))
        catalog=directory/'catalog.jsonl';catalog.write_text('fixed public data fixture')
        java=directory/'java.exe';java.write_bytes(b'executable fixture')
        mysql=directory/'mysqld.exe';mysql.write_bytes(b'executable fixture')
        config.update(buildManifest=str(build),catalog=str(catalog),datasetHash=self.runner.digest(catalog),java=str(java),mysqld=str(mysql))
        return config

    def assert_preflight_rejection(self, config, out, stage, *, head=None, source=None):
        import maturity_runtime as runtime
        def readonly_git(command,**kwargs):
            self.assertEqual('git',command[0],'Owned initialization must not run')
            return SimpleNamespace(returncode=0)
        with patch.object(runtime.subprocess,'check_output',return_value=head or config['sourceSha']), \
             patch.object(runtime.subprocess,'run',side_effect=readonly_git) as commands, \
             patch.object(runtime.subprocess,'Popen') as process, \
             patch.object(runtime,'backend_fingerprint',return_value=source or config['buildSourceFingerprint']):
            with self.assertRaises((ValueError,OSError,RuntimeError)):
                self.runner.run(config,ROOT/'scripts/acceptance/experience-continuity-cases.json',out,stage)
            process.assert_not_called()
            self.assertTrue(all(c.args[0][0]=='git' for c in commands.call_args_list))
            self.assertFalse(out.exists(),'Complete inherited rejection must precede the outer output directory')

    def test_valid_shape_bad_head_artifact_source_data_or_executable_leaves_no_output_in_both_stages(self):
        for stage in ('journey','database'):
            for fault in ('head','artifact','source','data','executable'):
                with self.subTest(stage=stage,fault=fault),tempfile.TemporaryDirectory() as tmp:
                    directory=Path(tmp);config=self.runtime_fixture(directory)
                    if fault=='artifact':Path(config['jar']).write_bytes(b'changed artifact')
                    if fault=='data':Path(config['catalog']).write_text('changed data')
                    if fault=='executable':config['java']=str(directory/'missing-java.exe')
                    self.assert_preflight_rejection(config,directory/'untouched',stage,
                        head='e'*40 if fault=='head' else None,source='f'*64 if fault=='source' else None)

    def test_occupied_foreign_runtime_port_leaves_no_output_or_owned_process_in_both_stages(self):
        for port in (18780,18781):
            with socket.socket() as foreign:
                if hasattr(socket,'SO_EXCLUSIVEADDRUSE'):foreign.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
                try:foreign.bind(('127.0.0.1',port))
                except OSError:pass  # An already occupied foreign port must also reject.
                for stage in ('journey','database'):
                    with self.subTest(port=port,stage=stage),tempfile.TemporaryDirectory() as tmp:
                        directory=Path(tmp);config=self.runtime_fixture(directory)
                        self.assert_preflight_rejection(config,directory/'untouched',stage)

    def test_result_never_promotes_missing_evidence_or_native_proof(self):
        case={'id':'J11','steps':['restart'],'assertions':['persist'], 'limits':[]}
        fp={'sourceSha':'a'*40}
        with self.assertRaises(ValueError):self.runner.result(case,'passed',[],fp,[])
        row=self.runner.result(case,'blocked',[],fp,['Browser unavailable'])
        for field in ('id','steps','assertions','sourceFingerprint','status','evidence','limits'):
            self.assertIn(field,row)
        self.assertEqual('blocked',row['status'])
        with self.assertRaises(ValueError):self.runner.result(case,'green',[],fp,[])

    def test_outputs_are_fresh_external_and_fingerprints_are_redacted(self):
        with self.assertRaises(ValueError):self.runner.new_output(ROOT/'outputs'/'e17')
        fp=self.runner.fingerprints(dict(self.config,jar='C:/private.jar'), 'f'*64)
        self.assertNotIn('jar',fp)
        self.assertEqual('mock',fp['providerMode'])
        self.assertEqual('f'*64,fp['configSha256'])

    def test_lost_response_requires_exact_object_count_and_no_unrelated_write(self):
        before={'plans':0,'actual':0,'copies':0}
        self.runner.assert_delta(before,dict(before,plans=1),{'plans':1})
        for after in (dict(before,plans=2),dict(before,plans=1,actual=1),before):
            with self.assertRaises(AssertionError):self.runner.assert_delta(before,after,{'plans':1})

    def test_database_adapter_preserves_missing_rehearsal_as_not_run(self):
        old={'passed':21,'total':22,'limits':['no native proof'],'datasets':[{'rows':0,'cases':[
            {'id':'IT01','passed':True},{'id':'R01','passed':False,'notRun':True}]}]}
        with tempfile.TemporaryDirectory() as tmp, patch.object(self.runner,'run_database',return_value=old),patch.object(self.runner,'preflight'):
            receipt=self.runner.run(self.config,ROOT/'scripts/acceptance/experience-continuity-cases.json',Path(tmp)/'new','database')
        self.assertEqual('failed',receipt['status'])
        self.assertEqual('not-run',receipt['cases'][1]['status'])
        self.assertEqual('0-R01',receipt['cases'][1]['id'])


if __name__=='__main__':unittest.main()
