import importlib.util,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('catalog_media',Path(__file__).resolve().parents[1]/'scripts/audit_catalog_media.py')
media=importlib.util.module_from_spec(spec);spec.loader.exec_module(media)
class CatalogMediaTest(unittest.TestCase):
    def test_default_is_read_only_without_network_or_fake_rights(self):
        with patch.object(media,'probe',side_effect=AssertionError('unexpected network')):
            report=media.audit([{'id':1,'image':'http://cp2.douguo.net/a'},{'id':2,'image':''}])
        self.assertEqual(report['probeAttempts'],0)
        self.assertEqual(report['rows'][0]['displayUrl'],'https://cp1.douguo.com/a')
        self.assertEqual(report['rows'][0]['imageRightsStatus'],'UNKNOWN')
    def test_rejects_credentials_and_limits_probe_scope(self):
        self.assertIsNone(media.normalize('https://private:secret@cp1.douguo.com/a'))
        self.assertEqual(media.probe('https://example.invalid/a')['state'],'not_probed_source')
        with self.assertRaises(ValueError):media.audit([],True,21)
if __name__=='__main__':unittest.main()
