import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'configure_wechat_voice.py'
spec = importlib.util.spec_from_file_location('configure_wechat_voice', SCRIPT)
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


class ConfigureWechatVoiceTest(unittest.TestCase):
    def setUp(self):
        # Use the writable checkout instead of the restricted Windows app-container TEMP.
        self.temp = tempfile.TemporaryDirectory(prefix='wechat-voice-test-', dir=SCRIPT.parent.parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'utils').mkdir()
        self.app = self.root / 'app.json'
        self.loader = self.root / 'utils' / 'wechat-voice-plugin.js'
        self.original = {'pages': ['pages/chat/chat'], 'window': {'navigationBarTitleText': '吃什么'},
                         'plugins': {'OtherPlugin': {'provider': 'wxOther', 'version': '9.9.9'}}}
        self.app.write_text(json.dumps(self.original, ensure_ascii=False), encoding='utf-8')
        self.loader.write_text(config.DISABLED_LOADER, encoding='utf-8')

    def test_enable_preserves_other_manifest_fields_and_plugins_and_disable_is_reversible(self):
        config.configure(self.root, True, '1.2.3', admin_enabled=True)
        enabled = json.loads(self.app.read_text(encoding='utf-8'))
        self.assertEqual(enabled['plugins']['WechatSI'], {'provider': config.PROVIDER, 'version': '1.2.3'})
        enabled['plugins'].pop('WechatSI')
        self.assertEqual(enabled, self.original)
        self.assertEqual(self.loader.read_text(encoding='utf-8'), config.enabled_loader('1.2.3'))
        config.configure(self.root, False, '1.2.3')
        self.assertEqual(json.loads(self.app.read_text(encoding='utf-8')), self.original)
        self.assertEqual(self.loader.read_text(encoding='utf-8'), config.DISABLED_LOADER)

    def test_explicit_admin_activation_and_published_version_are_required(self):
        before = (self.app.read_bytes(), self.loader.read_bytes())
        for version, admin in [('latest', True), ('', True), ('1.2', True), ('1.2.3\n', True), ('1.2.3', False)]:
            with self.assertRaises(ValueError):
                config.configure(self.root, True, version, admin_enabled=admin)
        with self.assertRaises(ValueError):
            config.configure(self.root, True, '1.2.3', admin_enabled=True, provider='wxWrong')
        self.assertEqual((self.app.read_bytes(), self.loader.read_bytes()), before)

    def test_manually_modified_loader_or_declaration_is_not_overwritten(self):
        self.loader.write_text('// my custom code\n', encoding='utf-8')
        with self.assertRaises(ValueError):
            config.configure(self.root, True, '1.2.3', admin_enabled=True)
        self.assertEqual(self.loader.read_text(encoding='utf-8'), '// my custom code\n')
        self.loader.write_text(config.DISABLED_LOADER, encoding='utf-8')
        app = dict(self.original, plugins={'WechatSI': {'provider': config.PROVIDER, 'version': '2.0.0'}})
        self.app.write_text(json.dumps(app), encoding='utf-8')
        with self.assertRaises(ValueError):
            config.configure(self.root, True, '1.2.3', admin_enabled=True)

    def test_disable_requires_expected_active_version_and_rejects_modified_loader(self):
        config.configure(self.root, True, '1.2.3', admin_enabled=True)
        before = (self.app.read_bytes(), self.loader.read_bytes())
        with self.assertRaises(ValueError):
            config.configure(self.root, False, '2.0.0')
        self.assertEqual((self.app.read_bytes(), self.loader.read_bytes()), before)

    def test_second_replace_failure_restores_both_original_files(self):
        before = (self.app.read_bytes(), self.loader.read_bytes())
        real_replace = config.os.replace
        count = 0

        def replace(source, target):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError('simulated second-file failure')
            return real_replace(source, target)

        with patch.object(config.os, 'replace', side_effect=replace):
            with self.assertRaises(OSError):
                config.configure(self.root, True, '1.2.3', admin_enabled=True)
        self.assertEqual((self.app.read_bytes(), self.loader.read_bytes()), before)
        self.assertEqual(list(self.root.rglob('.wechat-voice-*')), [])

    def test_idempotent_enable_does_not_rewrite_existing_valid_files(self):
        config.configure(self.root, True, '1.2.3', admin_enabled=True)
        before = (self.app.read_bytes(), self.loader.read_bytes())
        with patch.object(config.os, 'replace', side_effect=AssertionError('must not rewrite')):
            config.configure(self.root, True, '1.2.3', admin_enabled=True)
        self.assertEqual((self.app.read_bytes(), self.loader.read_bytes()), before)

    def test_shipped_default_loader_matches_generated_safe_disabled_template(self):
        shipped = SCRIPT.parent.parent / 'utils' / 'wechat-voice-plugin.js'
        self.assertEqual(shipped.read_text(encoding='utf-8'), config.DISABLED_LOADER)
        self.assertNotIn('requirePlugin', config.DISABLED_LOADER)

    def test_disable_switches_loader_off_before_removing_manifest_declaration(self):
        config.configure(self.root, True, '1.2.3', admin_enabled=True)
        real_replace = config.os.replace
        destinations = []

        def replace(source, target):
            destinations.append(target)
            return real_replace(source, target)

        with patch.object(config.os, 'replace', side_effect=replace):
            config.configure(self.root, False, '1.2.3')
        self.assertEqual(destinations, [self.loader, self.app])


if __name__ == '__main__':
    unittest.main()
