import sys,unittest,tempfile,json
from pathlib import Path
from unittest.mock import Mock,MagicMock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import maturity_runtime as runtime

class RuntimeCleanupTest(unittest.TestCase):
    def test_shutdown_owned_mysql_before_closing_connection_and_waiting(self):
        events=[];connection=MagicMock();cursor=connection.cursor.return_value.__enter__.return_value
        cursor.execute.side_effect=lambda sql:events.append(sql)
        cursor.fetchone.return_value=('/owned/mysql',1234,'owned')
        connection.close.side_effect=lambda:events.append('close')
        mysql=Mock(pid=101);mysql.wait.side_effect=lambda timeout:events.append('wait')
        result=runtime.shutdown_owned_mysql(connection,mysql,('/owned/mysql',1234,'owned'))
        self.assertEqual(events,['SELECT @@datadir, @@port, DATABASE()','SHUTDOWN','close','wait'])
        self.assertTrue(result['requested']);self.assertIsNone(result['error'])
        mysql.terminate.assert_not_called()

    def test_shutdown_error_is_recorded_and_connection_still_closed(self):
        connection=MagicMock();connection.cursor.return_value.__enter__.return_value.execute.side_effect=RuntimeError('private detail')
        result=runtime.shutdown_owned_mysql(connection,Mock(),('/owned/mysql',1234,'owned'))
        self.assertEqual(result['error'],'RuntimeError');connection.close.assert_called_once()
        self.assertNotIn('private detail',str(result))

    def test_exited_launcher_does_not_hide_surviving_child(self):
        observed=[{'pid':101,'parentPid':1,'created':'a'},{'pid':202,'parentPid':101,'created':'b'}]
        with patch.object(runtime,'process_snapshot',return_value=[observed[1]]):
            self.assertEqual(runtime.remaining_owned_processes(observed),[observed[1]])

    def test_reused_pid_is_not_adopted_as_owned(self):
        observed=[{'pid':202,'parentPid':101,'created':'b'}]
        with patch.object(runtime,'process_snapshot',return_value=[{'pid':202,'parentPid':5,'created':'later'}]):
            self.assertEqual(runtime.remaining_owned_processes(observed),[])

    def test_missing_connection_never_claims_shutdown_requested(self):
        self.assertEqual(runtime.shutdown_owned_mysql(None,None,('/owned/mysql',1234,'owned')),{'requested':False,'error':None})

    def test_wrong_database_identity_never_receives_shutdown(self):
        connection=MagicMock();cursor=connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value=('/other/mysql',1234,'owned')
        result=runtime.shutdown_owned_mysql(connection,Mock(),('/owned/mysql',1234,'owned'))
        self.assertFalse(result['requested']);self.assertEqual(result['error'],'ValueError')
        cursor.execute.assert_called_once_with('SELECT @@datadir, @@port, DATABASE()')

    def test_surviving_child_fails_cleanup_even_with_dead_direct_handle(self):
        row={'pid':202,'parentPid':101,'created':'b'}
        process=Mock(pid=101);process.poll.return_value=1
        with tempfile.TemporaryDirectory() as directory,patch.object(runtime,'process_snapshot',return_value=[row]),patch.object(runtime.time,'monotonic',side_effect=[0,10]):
            with self.assertRaisesRegex(RuntimeError,'cleanup failed'):
                runtime.cleanup_runtime([process],None,None,('/owned/mysql',1234,'owned'),None,directory)
            record=json.loads((Path(directory)/'cleanup.json').read_text())
            self.assertEqual(record['residualProcesses'],1);self.assertFalse(record['cleanupVerified'])

    def test_cleanup_failure_records_but_does_not_mask_original_exception(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(runtime,'process_snapshot',side_effect=RuntimeError('audit unavailable')):
            result=runtime.cleanup_runtime([],None,None,('/owned/mysql',1234,'owned'),None,directory,'ImportError')
            self.assertFalse(result['cleanupVerified']);self.assertEqual(result['originalFailureType'],'ImportError')
            self.assertTrue(result['errors'])

if __name__=='__main__':unittest.main()
