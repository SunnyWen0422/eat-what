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
    def test_powershell_wrapper_only_forwards_explicit_java(self):
        # Source contract only: native PowerShell execution is a separate check.
        wrapper=(Path(__file__).resolve().parents[1]/'scripts/start_local_v4.ps1').read_text(encoding='utf-8')
        self.assertRegex(wrapper, r'\[string\]\$JavaExecutable\s*\n')
        self.assertIn("$runtimeArgs=@('serve')",wrapper)
        self.assertIn("if ($JavaExecutable) { $runtimeArgs+=@('--java',$JavaExecutable) }",wrapper)
        self.assertIn("'local_v4.py') @runtimeArgs",wrapper)

    def test_serve_preserves_omitted_and_explicit_java_override(self):
        # Stop at the subprocess boundary; do not launch or contact services.
        for extra in ([], ['--java','C:/custom-jdk/bin/java.exe']):
            with self.subTest(extra=extra),patch.object(runtime.sys,'argv',['local_v4.py','serve',*extra]),patch.object(runtime.subprocess,'run',side_effect=RuntimeError('stop before restart')) as run:
                with self.assertRaisesRegex(RuntimeError,'stop before restart'):runtime.main()
            command=run.call_args.args[0]
            self.assertEqual('restart',command[2])
            if extra:self.assertEqual(extra,command[-2:])
            else:self.assertNotIn('--java',command)

    def test_restart_reuses_saved_java_and_validates_before_stopping(self):
        state={'javaPid': 123, 'javaExecutable':'C:/custom-jdk/bin/java.exe','dbPort':12345,'password':'synthetic'}
        order=[]
        connection=Mock()
        with patch.object(runtime.sys,'argv',['local_v4.py','restart']),patch.object(runtime,'read_state',return_value=state),patch.object(runtime,'executable_path',side_effect=lambda value:order.append(('validate',value)) or value),patch.object(runtime,'stop_owned',side_effect=lambda *args:order.append(('stop',None))),patch.object(runtime.pymysql,'connect',return_value=connection),patch.object(runtime,'start_java',side_effect=lambda state,value:order.append(('start',value))):
            runtime.main()
        self.assertEqual(('validate','C:/custom-jdk/bin/java.exe'),order[0])
        self.assertEqual(('start','C:/custom-jdk/bin/java.exe'),order[-1])

    def test_invalid_java_override_does_not_stop_existing_backend(self):
        with patch.object(runtime.sys,'argv',['local_v4.py','restart','--java','C:/missing/java.exe']),patch.object(runtime,'read_state',return_value={'javaPid':123,'dbPort':12345,'password':'synthetic'}),patch.object(runtime.pymysql,'connect',return_value=Mock()),patch.object(runtime,'executable_path',side_effect=RuntimeError('missing')),patch.object(runtime,'stop_owned') as stop,patch.object(runtime,'start_java') as start:
            with self.assertRaisesRegex(RuntimeError,'missing'):runtime.main()
        stop.assert_not_called();start.assert_not_called()
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
