import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import assistant_v4_acceptance as runner
class MenuAcceptanceSettings(unittest.TestCase):
 def test_legacy_is_unchanged(self):
  self.assertEqual(([],8),runner.reply_execution_settings(None))
 def test_opt_in_enables_only_owned_current_features(self):
  class Execution:natural_replies=True
  flags,count=runner.reply_execution_settings(Execution())
  self.assertEqual(11,count)
  self.assertEqual(['--assistant-v4.natural-reply-enabled=true','--assistant-v4.extensions-enabled=true'],flags)
  class Bad:natural_replies='true'
  with self.assertRaises(AssertionError):runner.reply_execution_settings(Bad())
