import importlib.util
from pathlib import Path
import unittest
class LineageTest(unittest.TestCase):
 def test_structural_contract_requires_columns_indexes_and_object_counts(self):
  spec=importlib.util.spec_from_file_location('lineage',Path(__file__).resolve().parents[1]/'scripts/audit_schema_lineage.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  manifest={'migrations':[{'version':'V4__meal_workspace','checksumSha256':'good'}]}
  schema={'migrations':[{'version':'V4__meal_workspace','checksum':'good'}],'columns':{'meal_workspaces':['id','revision']},'indexes':{'meal_workspaces':['PRIMARY']},'objectCounts':{'meal_workspaces':2}}
  contract={'columns':{'meal_workspaces':['id','revision']},'indexes':{'meal_workspaces':['PRIMARY']},'objectCounts':{'meal_workspaces':2}}
  self.assertTrue(m.audit(schema,manifest,contract)['structuralAuditComplete'])
  for field in ('columns','indexes','objectCounts'):
   broken={**schema,field:{}}
   self.assertFalse(m.audit(broken,manifest,contract)['safe'])
  self.assertFalse(m.audit(schema,manifest)['structuralAuditComplete'])
 def test_fresh_current_legacy_mixed_and_checksum_fail_closed(self):
  spec=importlib.util.spec_from_file_location('lineage',Path(__file__).resolve().parents[1]/'scripts/audit_schema_lineage.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  manifest={'migrations':[{'version':'V4__meal_workspace','checksumSha256':'good'}]}
  self.assertTrue(m.audit({},manifest)['safe'])
  self.assertTrue(m.audit({'migrations':[{'version':'V4__meal_workspace','checksum':'good'}]},manifest)['safe'])
  for rows in [[{'version':'V4__meal_workspace','checksum':'wrong'}],[{'version':'V3__calendar_sync'}],[{'version':'V3__calendar_sync'},{'version':'V4__meal_workspace','checksum':'good'}]]:self.assertFalse(m.audit({'migrations':rows},manifest)['safe'])
  self.assertFalse(m.audit({'migrations':[{'version':'V4__meal_workspace','checksum':'good'},{'version':'V99__unknown','checksum':'x'}]},manifest)['safe'])
  self.assertFalse(m.audit({'migrations':[{'version':'V4__meal_workspace','checksum':'good'}],'legacyObjects':['calendar_sync_receipts']},manifest)['safe'])
