import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('regression_runner_under_test', ROOT / 'scripts/run_regression_tests.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RegressionRunnerTest(unittest.TestCase):
    def test_skip_flag_never_imports_paused_modules_or_runs_paused_adapter_method(self):
        # All modules here are synthetic sentinels, with no model imports or adapters.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tests = root / 'tests'
            tests.mkdir()
            paused = ['test_local_agent_routes', 'test_workspace_model_transport', 'test_workspace_agent', 'test_workspace_evaluation', 'test_authorized_catalog']
            for name in paused:
                (tests / (name + '.py')).write_text("raise AssertionError('paused module must not be imported')\n")
            log = root / 'executed.txt'
            (tests / 'test_local_v4_runtime.py').write_text(
                'from pathlib import Path\nimport unittest\n'
                'class LocalRuntimeTest(unittest.TestCase):\n'
                '    def test_nonmodel_still_runs(self):\n'
                f'        Path({str(log)!r}).write_text("nonmodel ran")\n'
                '    def test_model_can_be_reused_and_provider_failure_keeps_basic_api_available(self):\n'
                '        raise AssertionError("paused adapter test must not run")\n'
            )
            stdout, stderr = io.StringIO(), io.StringIO()
            with patch.object(runner, 'ROOT', root), \
                 patch.object(sys, 'argv', ['run_regression_tests.py', '--skip-model-service']), \
                 patch.object(sys, 'path', sys.path[:]), \
                 patch.object(sys, 'stdout', stdout), patch.object(sys, 'stderr', stderr), \
                 patch.dict(sys.modules):
                for name in [*paused, 'test_local_v4_runtime']:
                    sys.modules.pop(name, None)
                status = runner.main()
            self.assertEqual(status, 0, stderr.getvalue())
            self.assertEqual(log.read_text(), 'nonmodel ran')
            self.assertIn('test_authorized_catalog.py', stdout.getvalue())
            self.assertIn('test_local_v4_runtime.LocalRuntimeTest.test_model_can_be_reused_and_provider_failure_keeps_basic_api_available', stdout.getvalue())


if __name__ == '__main__':
    unittest.main()
