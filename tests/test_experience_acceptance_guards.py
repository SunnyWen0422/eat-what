"""No network/process/DB is needed to reject an unsafe experience run."""
import copy
import importlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

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
        with tempfile.TemporaryDirectory() as tmp, patch.object(self.runner,'run_database',return_value=old):
            receipt=self.runner.run(self.config,ROOT/'scripts/acceptance/experience-continuity-cases.json',Path(tmp)/'new','database')
        self.assertEqual('failed',receipt['status'])
        self.assertEqual('not-run',receipt['cases'][1]['status'])
        self.assertEqual('0-R01',receipt['cases'][1]['id'])


if __name__=='__main__':unittest.main()
