import importlib.util
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('local_maturity_under_test', ROOT / 'scripts/local_maturity.py')
maturity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(maturity)


class MaturityRuntimeTest(unittest.TestCase):
    def test_restart_and_serve_choose_override_then_saved_java_then_default(self):
        # Exercise the real CLI; process, database, and readiness boundaries are mocked.
        cases = [
            ([], 'C:/saved-jdk/bin/java.exe', 'C:/saved-jdk/bin/java.exe'),
            (['--java', 'C:/override-jdk/bin/java.exe'], 'C:/saved-jdk/bin/java.exe', 'C:/override-jdk/bin/java.exe'),
            ([], None, 'D:/Java/bin/java.exe'),
        ]
        for action in ('restart', 'serve'):
            for extra, saved, expected in cases:
                with self.subTest(action=action, extra=extra, saved=saved):
                    state = {'javaPid': 123, 'dbPort': 12345, 'password': 'synthetic'}
                    if saved is not None:
                        state['javaExecutable'] = saved
                    order = []
                    with patch.object(sys, 'argv', ['local_maturity.py', action, *extra]), \
                         patch.object(maturity.runtime, 'read_state', return_value=state), \
                         patch.object(maturity.runtime, 'executable_path', side_effect=lambda value: order.append(('validate', value)) or value), \
                         patch.object(maturity.runtime, 'stop_owned', side_effect=lambda *args: order.append(('stop', None))), \
                         patch.object(maturity.runtime.pymysql, 'connect', return_value=Mock()), \
                         patch.object(maturity.runtime, 'start_java', side_effect=lambda state, value: order.append(('start', value))), \
                         patch.object(maturity.runtime, 'wait_for_basic_api'), \
                         patch.object(maturity.time, 'sleep', side_effect=RuntimeError('stop synthetic serve loop')), \
                         patch.object(sys, 'stdout', io.StringIO()):
                        if action == 'serve':
                            with self.assertRaisesRegex(RuntimeError, 'stop synthetic serve loop'):
                                maturity.main()
                        else:
                            maturity.main()
                    self.assertEqual(order, [('validate', expected), ('stop', None), ('start', expected)])

    def test_invalid_selected_java_does_not_stop_existing_backend(self):
        with patch.object(sys, 'argv', ['local_maturity.py', 'restart']), \
             patch.object(maturity.runtime, 'read_state', return_value={'javaPid': 123, 'javaExecutable': 'C:/missing/java.exe'}), \
             patch.object(maturity.runtime, 'executable_path', side_effect=RuntimeError('missing executable')), \
             patch.object(maturity.runtime, 'stop_owned') as stop, \
             patch.object(maturity.runtime, 'start_java') as start:
            with self.assertRaisesRegex(RuntimeError, 'missing executable'):
                maturity.main()
        stop.assert_not_called()
        start.assert_not_called()

    def test_start_retains_default_java_when_no_override_is_given(self):
        for extra, expected in [([], 'D:/Java/bin/java.exe'), (['--java', 'C:/custom/java.exe'], 'C:/custom/java.exe')]:
            with self.subTest(extra=extra), \
                 patch.object(sys, 'argv', ['local_maturity.py', 'start', '--backup-zip', 'synthetic.zip', '--quality-bundle', 'synthetic-bundle', *extra]), \
                 patch('bridge_legacy_local.prepare_source', return_value={'sourceSha256': 'synthetic'}), \
                 patch.object(maturity.runtime, 'start') as start, \
                 patch.object(maturity.runtime, 'wait_for_basic_api'), \
                 patch.object(sys, 'stdout', io.StringIO()):
                maturity.main()
                self.assertEqual(start.call_args.args[0].java, expected)


if __name__ == '__main__':
    unittest.main()
