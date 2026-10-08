import sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'recommend-service'))
from assistant_store import AssistantStore

class AssistantHistoryTest(unittest.TestCase):
 def setUp(self):
  base=ROOT/'.test-artifacts/history';base.mkdir(parents=True,exist_ok=True)
  self.temp=tempfile.TemporaryDirectory(dir=base);self.addCleanup(self.temp.cleanup)
  self.store=AssistantStore(Path(self.temp.name)/'history.sqlite3')
  with patch('assistant_store.time.time',return_value=2000000000):
   for name in ['a','b','c']:self.store.create('user:1',name)
   self.store.create('user:2','foreign')
 def test_paging_ties_and_owner_scope(self):
  first=self.store.list_sessions('user:1',limit=2)
  self.assertEqual(['c','b'],[s['sessionId'] for s in first['sessions']])
  second=self.store.list_sessions('user:1',first['nextCursor'],2)
  self.assertEqual(['a'],[s['sessionId'] for s in second['sessions']]);self.assertIsNone(second['nextCursor'])
  with self.assertRaises(ValueError):self.store.list_sessions('user:2',first['nextCursor'],2)
  self.assertIsNone(self.store.get('foreign','user:1'))
 def test_invalid_limits_and_cursor_fail_closed(self):
  for limit in [0,51,True,'20']:
   with self.assertRaises(ValueError):self.store.list_sessions('user:1',limit=limit)
  with self.assertRaises(ValueError):self.store.list_sessions('user:1','malformed')
