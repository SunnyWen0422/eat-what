"""Bounded, read-only mini-program checks. No native/device or model claims.

Run --syntax --templates --copy --assets for static checks. --node-tests is an
explicit opt-in audited UI-only list; never invokes default verification suites.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NODE_TESTS = tuple('''account-boundaries api-account-retry api-identity-success assistant-history calendar-actual-recovery controlled-harness detail-servings diet-report-api diet-report dish-workspace-handoff experience-actions experience-calendar experience-components experience-composition experience-diet-review experience-journeys experience-personal-recipes experience-recipe-selection experience-save-target experience-shopping-list experience-shopping-preview favorite-meal-entry frontend-workflow-regressions history-workspace-target legacy-meal-import login-readiness meal-actual-entry meal-actual-identity meal-cooking meal-dates meal-navigation-hierarchy meal-workflow meal-workspace menu-workspace-handoff page-contracts page-identity-regressions page-purpose-copy personal-recipe-pages personal-recipes preference-scope profile-entry-hierarchy recipe-interaction-hierarchy recipe-quality shopping-capability-race shopping-drafts shopping-edit-intent shopping-view-hierarchy ui-assets ui-components ui-self-check ui-state-presentation v4-business-contracts v4-local-features workspace-controlled-flow workspace-day-boundary workspace-homepage workspace-navigation workspace-page workspace-primary-action workspace-requirements-sheet'''.split())
# These names are recorded for humans, not automatically launched by this script.
PYTHON_TESTS = ('test_ui_structure.py', 'test_ui_self_check.py', 'test_product_migration_contract.py')
LIMITATION = 'Static source contracts only; no native layout, screen-reader, device or model verification.'

def sources():
    paths = [ROOT / 'app.js', ROOT / 'app.json', ROOT / 'app.wxss']
    # Fixed depths and suffixes only. Never scan web, credentials, dependencies or target.
    for folder, patterns in {'pages': ('*/*.js', '*/*.json', '*/*.wxml', '*/*.wxss'), 'utils': ('*.js',), 'components': ('*/*.js', '*/*.json', '*/*.wxml', '*/*.wxss'), 'templates': ('*.wxml', '*.wxss'), 'design': ('tokens.json', 'asset-manifest.json', 'wxss-manifest.json', 'theme.wxss.tpl', 'wxss/*/*.tpl', 'wxss/*/*/*.tpl')}.items():
        for pattern in patterns:
            paths.extend((ROOT / folder).glob(pattern))
    paths.extend(ROOT / 'tests' / (name + '.test.js') for name in NODE_TESTS)
    return sorted(set(paths))

def reachable_js(file, seen=None):
    seen = set() if seen is None else seen
    if file in seen or not file.is_file(): return ''
    seen.add(file)
    text = file.read_text(encoding='utf-8')
    for name in re.findall(r"require\(['\"]([^'\"]+)['\"]\)", text):
        if not name.startswith('.'): continue
        child = (file.parent / (name + ('' if name.endswith('.js') else '.js'))).resolve()
        if child.is_relative_to(ROOT / 'utils'): text += '\n' + reachable_js(child, seen)
    return text

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('syntax', 'templates', 'copy', 'assets', 'node-tests'): parser.add_argument('--' + flag, action='store_true')
    args = parser.parse_args(); results = []
    def record(check, errors, evidence):
        results.append(dict(check=check, kind='static', status='failed' if errors else 'passed', evidence=evidence, limitation=LIMITATION, errors=errors))
    app = json.loads((ROOT / 'app.json').read_text()); files = sources()
    if args.syntax:
        errors = []; checked = 0
        for file in files:
            if file.suffix == '.json':
                try: json.loads(file.read_text())
                except ValueError as error: errors.append(str(file.relative_to(ROOT)) + ': ' + str(error))
                checked += 1
            if file.suffix == '.js':
                result = subprocess.run(['node', '--check', str(file)], cwd=ROOT, capture_output=True, text=True)
                if result.returncode: errors.append(str(file.relative_to(ROOT)) + ': ' + result.stderr)
                checked += 1
        record('G1 syntax', errors, {'files': checked, 'roots': ['app', 'pages', 'utils', 'components', 'templates', 'design', 'explicit tests']})
    if args.templates:
        sys.path.insert(0, str(ROOT / 'tests'))
        from ui_source_audit import Template
        errors = []; count = 0
        for file in files:
            if file.suffix != '.wxml': continue
            count += 1; text = file.read_text(); template = Template(text)
            config = file.with_suffix('.json'); registered = dict(app['usingComponents'])
            if config.exists(): registered.update(json.loads(config.read_text()).get('usingComponents', {}))
            code = reachable_js(file.with_suffix('.js'))
            if file.parent.name == 'templates': code = '\n'.join(reachable_js(ROOT / (route + '.js')) for route in app['pages'])
            for node in template.nodes:
                if '-' in node.tag and node.tag not in {'checkbox-group', 'radio-group', 'scroll-view', 'swiper-item', 'rich-text', 'movable-view', 'movable-area', 'cover-view', 'cover-image', 'web-view', 'camera', 'live-player', 'live-pusher', 'page-container', 'root-portal'} and node.tag not in registered:
                    errors.append(f'{file.relative_to(ROOT)}:{node.line} unregistered {node.tag}')
                for attribute, handler in node.attrs.items():
                    if re.match(r'^(?:bind|catch)(?::|[a-z])', attribute) and handler and '{{' not in handler and not re.search(r'\b' + re.escape(handler) + r'\b', code): errors.append(f'{file.relative_to(ROOT)}:{node.line} missing handler {handler}')
                # A nested bubbling tap would invoke two commands. catchtap is safe.
                if 'bindtap' in node.attrs or 'bind:tap' in node.attrs:
                    parent = node.parent
                    while parent:
                        if 'catchtap' in parent.attrs or 'catch:tap' in parent.attrs: break
                        if 'bindtap' in parent.attrs or 'bind:tap' in parent.attrs: errors.append(f'{file.relative_to(ROOT)}:{node.line} nested bubbling tap'); break
                        parent = parent.parent
            if template.stack: errors.append(str(file.relative_to(ROOT)) + ': unclosed structure')
        record('G1 template registration, handler references and nested taps', errors, {'templates': count, 'handlerScope': 'page and imported utility source; not dynamic execution'})
    if args.copy:
        ordinary = [ROOT / (p + '.wxml') for p in app['pages'] if not p.startswith('pages/admin')]
        ordinary += list((ROOT / 'templates').glob('*.wxml')); errors = []
        for file in ordinary:
            for word in ('聊聊这餐', '选菜搭一餐', '需要确认', '待买参考', '本次实付'):
                if word in file.read_text(): errors.append(str(file.relative_to(ROOT)) + ': ' + word)
        record('G1 ordinary reachable copy (both feature branches)', errors, {'templates': len(ordinary)})
    if args.assets:
        errors = []; tokens = json.loads((ROOT / 'design/tokens.json').read_text())
        if tokens['font']['body'] < 16 or tokens['controls']['touchSize'] < 44 or tokens['controls']['primaryHeight'] < 48: errors.append('body/touch/button token minimum')
        for file in files:
            if file.suffix != '.wxml': continue
            for asset in re.findall(r'(?:src|icon-path)=["\'](/?assets/[^"\']+)', file.read_text()):
                if '{{' not in asset and not (ROOT / asset.lstrip('/')).is_file(): errors.append('Missing ' + asset)
        for tab in app['tabBar']['list']:
            for field in ('iconPath', 'selectedIconPath'):
                if not (ROOT / tab[field]).is_file(): errors.append('Missing ' + tab[field])
        dish = (ROOT / 'components/compact-dish-row/index.wxml').read_text()
        if not all(x in dish for x in ('imageFailed', 'placeholderIcon', 'onImageError')): errors.append('dish image fallback contract')
        record('G1 asset references and density tokens', errors, {'body': tokens['font']['body'], 'touch': tokens['controls']['touchSize'], 'button': tokens['controls']['primaryHeight']})
    if args.node_tests:
        targets = [ROOT / 'tests' / (name + '.test.js') for name in NODE_TESTS]
        # Fail closed if a previously audited entry gains process/network execution.
        unsafe = [p.name for p in targets if re.search(r'child_process|\bfetch\s*\(|\b(?:http|https)\.(?:request|get)\s*\(', p.read_text())]
        if unsafe: results.append(dict(check='G1 audited UI contracts', kind='automated', status='failed', evidence=unsafe, limitation='New execution capability requires human audit.'))
        else:
            result = subprocess.run(['node', '--test', *map(str, targets)], cwd=ROOT)
            results.append(dict(check='G1 audited UI contracts', kind='automated', status='passed' if result.returncode == 0 else 'failed', evidence=[str(p.relative_to(ROOT)) for p in targets], limitation='Literal API receipts and WeChat stubs, not model/native tests.'))
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return int(any(row['status'] == 'failed' for row in results))

if __name__ == '__main__': sys.exit(main())
