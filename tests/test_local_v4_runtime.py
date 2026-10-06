import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
from unittest.mock import Mock
import io
import urllib.error

spec = importlib.util.spec_from_file_location('local_v4', Path(__file__).resolve().parents[1] / 'scripts/local_v4.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

class LocalRuntimeTest(unittest.TestCase):
    def test_model_can_be_reused_and_provider_failure_keeps_basic_api_available(self):
        response=io.BytesIO(b'{"status":"ok","local":true,"modelBudget":{"limit":20,"used":15}}')
        with patch.object(runtime.urllib.request,'urlopen',return_value=response),patch.object(runtime.subprocess,'run') as run:
            self.assertTrue(runtime.start_optional_model())
            run.assert_not_called()
        with patch.object(runtime.urllib.request,'urlopen',side_effect=urllib.error.URLError('offline')),patch.object(runtime.subprocess,'run',side_effect=subprocess.CalledProcessError(1,['model'])):
            self.assertFalse(runtime.start_optional_model())
    def test_basic_readiness_does_not_require_recommendation_health(self):
        response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False);response.status=200
        with patch.object(runtime.urllib.request,'urlopen',return_value=response) as request:
            runtime.wait_for_basic_api()
        self.assertTrue(request.call_args.args[0].endswith('/actuator/health/local-ready'))
    def test_dead_recorded_pid_does_not_require_cim_or_kill(self):
        with patch.object(runtime.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '', '')) as run:
            runtime.stop_owned(1234, ['local-v4'])
        self.assertEqual(run.call_count, 1)
        self.assertIn('Get-Process', run.call_args.args[0][-1])
        self.assertNotIn('Get-CimInstance', run.call_args.args[0][-1])

    def test_live_pid_with_unreadable_identity_is_never_killed(self):
        with patch.object(runtime.subprocess, 'run', side_effect=[subprocess.CompletedProcess([], 0, '1234', ''), subprocess.CalledProcessError(1, ['powershell'])]) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                runtime.stop_owned(1234, ['local-v4'])
        self.assertEqual(run.call_count, 2)
        self.assertNotIn('taskkill.exe', str(run.call_args))
