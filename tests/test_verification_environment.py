import importlib.util
from pathlib import Path
import unittest

class VerificationEnvironmentTest(unittest.TestCase):
    def validate(self, **changes):
        path = Path(__file__).resolve().parents[1] / 'scripts/check_test_environment.py'
        spec = importlib.util.spec_from_file_location('test_environment', path)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        value = dict(environment='local', api='http://127.0.0.1:18780/api', dbHost='127.0.0.1', database='eatwhat_v4_local_test', dataDir='local-data', root='.')
        value.update(changes)
        return module.validate(value)
    def test_local_isolated_configuration_is_accepted(self):
        self.assertTrue(self.validate()['safe'])
    def test_production_and_unknown_targets_are_rejected(self):
        for changes in ({'api':'https://chishenme.icu/api'}, {'dbHost':'localhost'}, {'database':'food'}, {'dataDir':'../outside'}, {'environment':'production'}):
            self.assertFalse(self.validate(**changes)['safe'], changes)
