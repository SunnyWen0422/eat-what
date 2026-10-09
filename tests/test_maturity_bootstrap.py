import argparse
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('maturity_bootstrap_under_test',ROOT/'scripts/local_v4.py')
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)


class MaturityBootstrapTest(unittest.TestCase):
    def test_bridge_failure_preserves_credentials_and_resume_does_not_initialize_again(self):
        # Fake process/database boundaries: no database or external provider is contacted.
        with tempfile.TemporaryDirectory(dir=ROOT/'.test-artifacts') as directory:
            args=argparse.Namespace(legacy_backup='fixture.zip',quality_bundle='fixture-bundle',mysqld='fixture-mysqld',java='fixture-java',prepared_source={'sourceSha256':'source','qualityManifestHash':'quality'})
            connection=Mock();connection.cursor.return_value.__enter__=Mock(return_value=Mock());connection.cursor.return_value.__exit__=Mock(return_value=False)
            process=Mock();process.poll.return_value=None
            with patch.object(runtime,'DATA',Path(directory)),patch.object(runtime,'available'),patch.object(runtime,'executable_path',return_value='fixture-mysqld'),patch.object(runtime.subprocess,'run') as run,patch.object(runtime.subprocess,'Popen',return_value=process),patch.object(runtime.pymysql,'connect',return_value=connection) as connect,patch('bridge_legacy_local.restore_and_bridge',side_effect=RuntimeError('simulated interruption')):
                with self.assertRaisesRegex(RuntimeError,'simulated interruption'):runtime.start(args)
                checkpoint=json.loads((Path(directory)/'bootstrap.json').read_text(encoding='utf-8'))
                self.assertTrue(checkpoint['password']);self.assertFalse(checkpoint['bridgeComplete'])
                with self.assertRaisesRegex(RuntimeError,'simulated interruption'):runtime.start(args)
                self.assertEqual(run.call_count,1)
                self.assertEqual(connect.call_args.kwargs['password'],checkpoint['password'])
                self.assertEqual(json.loads((Path(directory)/'bootstrap.json').read_text(encoding='utf-8'))['anonymizationSalt'],checkpoint['anonymizationSalt'])
                process.terminate.assert_called();process.wait.assert_called()


if __name__=='__main__':unittest.main()
