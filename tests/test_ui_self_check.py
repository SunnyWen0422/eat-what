import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from ui_source_audit import ROOT, Template, page_audit, rules, styles, declared_hit_bounds


class UiSelfCheckTest(unittest.TestCase):
    def test_result_favorite_and_refresh_keep_44px_through_actual_pressed_ancestors(self):
        route = 'pages/result/result'
        css = rules(ROOT / 'app.wxss') + rules(ROOT / (route + '.wxss'))
        template = Template((ROOT / (route + '.wxml')).read_text(encoding='utf-8'))
        targets = [node for node in template.nodes if node.attrs.get('catchtap') in ('onToggleFavorite', 'onRefreshDish')]
        self.assertEqual(2, len(targets))
        for target in targets:
            with self.subTest(handler=target.attrs['catchtap']):
                bounds = declared_hit_bounds(target, css)
                self.assertEqual([], bounds['unresolvedTransformGeometry'], bounds)
                self.assertGreaterEqual(bounds['minWidthAfterDeclaredScale'], 44, bounds)
                self.assertGreaterEqual(bounds['minHeightAfterDeclaredScale'], 44, bounds)

    def test_all_clickable_nodes_have_fixed_44px_minimum_at_320px(self):
        routes = json.loads((ROOT / 'app.json').read_text(encoding='utf-8'))['pages']
        failures = []
        for route in routes:
            for target in page_audit(route)['clicks']:
                if target['minWidth'] != '44px' or target['minHeight'] != '44px':
                    failures.append((route, target))
        for file in (ROOT / 'components').glob('*/*.wxml'):
            css = rules(file.with_suffix('.wxss'))
            for node in Template(file.read_text(encoding='utf-8')).nodes:
                if node.tag in ('view', 'text', 'picker') and any(key.endswith('tap') for key in node.attrs):
                    style = styles(node, css)
                    if style.get('min-width') != '44px' or style.get('min-height') != '44px':
                        failures.append((str(file.relative_to(ROOT)), node.attrs))
        self.assertEqual([], failures)

    def test_actual_page_text_including_opacity_has_45_contrast_on_declared_backgrounds(self):
        routes = json.loads((ROOT / 'app.json').read_text(encoding='utf-8'))['pages']
        failures = [(route, pair) for route in routes for pair in page_audit(route)['pairs'] if pair['ratio'] < 4.5]
        self.assertEqual([], failures)

    def test_public_component_text_keeps_contrast_in_disabled_and_selected_states(self):
        routes = [str(file.relative_to(ROOT).with_suffix('')).replace('\\', '/') for file in (ROOT / 'components').glob('*/*.wxml')]
        failures = [(route, pair) for route in routes for pair in page_audit(route)['pairs'] if pair['ratio'] < 4.5]
        self.assertEqual([], failures)

    def test_placeholder_text_has_declared_readability(self):
        files = list((ROOT / 'pages').glob('*/*.wxml')) + list((ROOT / 'components').glob('*/*.wxml')) + list((ROOT / 'templates').glob('*.wxml'))
        missing = [(str(file.relative_to(ROOT)), node.line) for file in files for node in Template(file.read_text(encoding='utf-8')).nodes if node.tag in ('input', 'textarea') and 'placeholder' in node.attrs and node.attrs.get('placeholder-class') != 'ew-placeholder']
        self.assertEqual([], missing, 'Placeholder color must be declared instead of depending on a platform default')

    def test_native_checkbox_label_has_touch_bounds(self):
        file = ROOT / 'components/ui-checkbox/ui-checkbox.wxml'
        label = next(node for node in Template(file.read_text(encoding='utf-8')).nodes if node.tag == 'label')
        style = styles(label, rules(file.with_suffix('.wxss')))
        self.assertEqual('44px', style.get('min-width'))
        self.assertEqual('44px', style.get('min-height'))

    def test_primary_buttons_keep_48px_after_click_target_rules(self):
        cases = [('components/ui-button/ui-button', 'button'), ('components/ui-confirm/ui-confirm', 'confirm'), ('pages/recommend-filter/recommend-filter', 'apply-btn'), ('pages/index/index', 'primary-btn'), ('pages/result/result', 'act-save')]
        for route, class_name in cases:
            with self.subTest(route=route):
                node = next(node for node in Template((ROOT / (route + '.wxml')).read_text(encoding='utf-8')).nodes if node.tag == 'button' and class_name in node.classes())
                self.assertEqual('48px', styles(node, rules(ROOT / (route + '.wxss'))).get('min-height'))

    def test_all_dimension_tokens_change_every_matching_generated_consumer_and_restore_identically(self):
        # The generator locates ROOT from its file; copying its complete inputs isolates every mutation.
        temporary_root = ROOT / '.pytest_cache'
        temporary_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='ui-token-', dir=temporary_root) as directory:
            isolated = Path(directory)
            shutil.copytree(ROOT / 'design', isolated / 'design')
            (isolated / 'scripts').mkdir()
            shutil.copy2(ROOT / 'scripts/build_ui_assets.py', isolated / 'scripts/build_ui_assets.py')
            shutil.copy2(ROOT / 'app.json', isolated / 'app.json')
            manifest = json.loads((isolated / 'design/wxss-manifest.json').read_text(encoding='utf-8'))
            for file in ['utils/ui-tokens.js', 'styles/theme.wxss', *[item['output'] for item in manifest]]:
                (isolated / file).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / 'utils/font-scale.js', isolated / 'utils/font-scale.js')
            shutil.copy2(ROOT / 'utils/meal-workspace-page.js', isolated / 'utils/meal-workspace-page.js')
            original = (isolated / 'design/tokens.json').read_text(encoding='utf-8')
            tokens = json.loads(original)

            def build():
                spec = importlib.util.spec_from_file_location('isolated_ui_assets', isolated / 'scripts/build_ui_assets.py')
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                module.build()
                outputs = ['utils/ui-tokens.js', 'styles/theme.wxss', 'app.json', 'design/asset-manifest.json', *[item['output'] for item in manifest]]
                outputs += [str(file.relative_to(isolated)) for file in (isolated / 'assets').rglob('*') if file.is_file()]
                return {file: (isolated / file).read_bytes() for file in outputs}

            baseline = build()
            dimensions = [('font', key) for key in tokens['font']] + [('space', index) for index in range(len(tokens['space']))] + [('radius', index) for index in range(len(tokens['radius']))] + [('controls', key) for key in tokens['controls']]
            sources = [('design/theme.wxss.tpl', 'styles/theme.wxss'), *[(item['source'], item['output']) for item in manifest]]
            for group, key in dimensions:
                with self.subTest(token=f'{group}.{key}'):
                    mutated = json.loads(original)
                    mutated[group][key] += 2
                    (isolated / 'design/tokens.json').write_text(json.dumps(mutated), encoding='utf-8')
                    changed = build()
                    runtime = json.loads(changed['utils/ui-tokens.js'].decode().split('module.exports = ', 1)[1])
                    self.assertEqual(mutated[group], runtime[group])
                    if (group, key) == ('font', 'body'):
                        node = shutil.which('node')
                        self.assertIsNotNone(node, 'Node runtime must be on PATH for the native font contract')
                        values = subprocess.check_output([node, '-e', "global.wx={getAppBaseInfo:()=>({fontSizeScaleFactor:1.5})};const scale=require('./utils/font-scale');process.stdout.write(JSON.stringify([scale.base,scale.base*scale()]));"], cwd=isolated, text=True)
                        self.assertEqual([16, 24], json.loads(values))
                    consumers = [output for source, output in sources if re.search(r'\{\{' + re.escape(f'{group}.{key}.') , (isolated / source).read_text(encoding='utf-8'))]
                    self.assertTrue(consumers, f'{group}.{key} has no WXSS consumers')
                    for file in [*consumers, 'utils/ui-tokens.js']:
                        if baseline[file] == changed[file] and (group, key) == ('font', 'body'):
                            source = next(source for source, output in sources if output == file)
                            bindings = re.findall(r'\{\{(font\.[^{}]+)\}\}', (isolated / source).read_text(encoding='utf-8'))
                            self.assertEqual({'font.body.em'}, set(bindings), 'Only body/body can remain 1em when body changes')
                            self.assertIn('font-size:1em', changed[file].decode())
                            # Effective inherited font changes 14px -> 16px, without squaring the body ratio.
                            self.assertEqual(16, runtime['font']['body'])
                            self.assertEqual(14, json.loads(baseline['utils/ui-tokens.js'].decode().split('module.exports = ', 1)[1])['font']['body'])
                        else:
                            self.assertNotEqual(baseline[file], changed[file], f'{group}.{key} did not reach {file}')
                    # Runtime JS must export all dimensions, rather than just colors/controls.
                    runtime = changed['utils/ui-tokens.js'].decode()
                    self.assertIn(f'"{group}"', runtime)
                    (isolated / 'design/tokens.json').write_text(original, encoding='utf-8')
                    restored = build()
                    self.assertEqual({file: hashlib.sha256(value).hexdigest() for file, value in baseline.items()}, {file: hashlib.sha256(value).hexdigest() for file, value in restored.items()})


if __name__ == '__main__':
    unittest.main()
