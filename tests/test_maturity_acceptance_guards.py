"""Guard checks run without starting any process, network or database."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]


class MaturityAcceptanceGuardsTest(unittest.TestCase):
    def service(self):
        spec=importlib.util.spec_from_file_location('maturity_runtime',ROOT/'scripts/maturity_runtime.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

    def value(self):
        return {'purpose':'product-maturity-isolated','sourceSha':'a'*40,'datasetHash':'b'*64,
                'loopbackApi':'http://127.0.0.1:18780/api','privateDb':'eatwhat_maturity_local_01234567',
                'providerMode':'mock','newInstance':True,'ownedProcessManifest':'runtime.json',
                'modelBudgetLedger':None,'jarSha256':'c'*64,'buildSourceFingerprint':'d'*64}

    def test_accepts_only_new_owned_literal_loopback_targets(self):
        m=self.service();m.validate_config(self.value())
        for key,value in [('loopbackApi','https://chishenme.icu/api'),('loopbackApi','http://localhost:18780/api'),
                          ('privateDb','food'),('privateDb','eatwhat_maturity_local_shared'),
                          ('providerMode','live'),('newInstance',False),('ownedProcessManifest','../runtime.json'),
                          ('sourceSha','old'),('datasetHash',''),('skipNetworkCheck',True),('password','source-secret')]:
            bad=copy.deepcopy(self.value());bad[key]=value
            with self.subTest(key=key,value=value), self.assertRaises(ValueError):m.validate_config(bad)

    def test_missing_attestation_or_stale_build_rejected_before_launch(self):
        m=self.service()
        for key in self.value():
            bad=self.value();bad.pop(key)
            with self.subTest(key=key),self.assertRaises(ValueError):m.validate_config(bad)
        with tempfile.TemporaryDirectory() as directory:
            build=Path(directory)/'build.json';build.write_text('{"jarSha256":"wrong","backendFingerprint":"wrong"}')
            with self.assertRaises(ValueError):m.validate_build(self.value(),build,Path(directory)/'missing.jar')

    def test_output_never_reuses_existing_or_repository_directory(self):
        m=self.service()
        with self.assertRaises(ValueError):m.new_output(ROOT/'outputs'/'unsafe')
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):m.new_output(Path(directory))
            target=Path(directory)/'fresh';self.assertEqual(target.resolve(),m.new_output(target))


if __name__=='__main__':unittest.main()
