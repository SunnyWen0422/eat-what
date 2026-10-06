import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('local_v4', Path(__file__).resolve().parents[1] / 'scripts/local_v4.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

class LocalRuntimeTest(unittest.TestCase):
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
