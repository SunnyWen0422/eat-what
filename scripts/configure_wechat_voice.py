"""Opt in to WechatSI only after WeChat admin activation; no network or credentials."""
import argparse
import json
import os
import re
import stat
import tempfile
from pathlib import Path

PROVIDER = 'wx069ba97219f66d99'
VERSION = re.compile(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)')
DISABLED_LOADER = (
    '// Managed by scripts/configure_wechat_voice.py; disabled until admin activation.\n'
    "module.exports = { configured: false, provider: 'wx069ba97219f66d99', version: null, loadPlugin: null }\n"
)


def enabled_loader(version):
    return (
        '// Managed by scripts/configure_wechat_voice.py; admin-enabled plugin.\n'
        'module.exports = {\n'
        '  configured: true,\n'
        f"  provider: '{PROVIDER}',\n"
        f"  version: '{version}',\n"
        "  loadPlugin: () => requirePlugin('WechatSI')\n"
        '}\n'
    )


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate app.json key: {key}')
        result[key] = value
    return result


def _stage(path, content):
    descriptor, name = tempfile.mkstemp(prefix='.wechat-voice-', suffix='.tmp', dir=path.parent)
    staged = Path(name)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(staged, stat.S_IMODE(path.stat().st_mode))
        return staged
    except BaseException:
        staged.unlink(missing_ok=True)
        raise


def _replace_pair(originals, desired):
    """Stage both new files and recovery copies before replacing either file."""
    temporary = []
    staged, backups, changed = {}, {}, []
    preserve_recovery = False
    try:
        for path, content in desired.items():
            staged[path] = _stage(path, content)
            temporary.append(staged[path])
            backups[path] = _stage(path, originals[path])
            temporary.append(backups[path])
        # Another editor must never be overwritten between validation and replacement.
        for path, content in originals.items():
            if path.read_bytes() != content:
                raise ValueError(f'File changed during activation; retry after reviewing: {path}')
        for path, staged_path in staged.items():
            if path.read_bytes() != originals[path]:
                raise ValueError(f'File changed during activation: {path}')
            os.replace(staged_path, path)
            changed.append(path)
    except BaseException as error:
        try:
            for path in reversed(changed):
                if path.read_bytes() != desired[path]:
                    raise RuntimeError(f'Concurrent edit prevents automatic restore: {path}')
                os.replace(backups[path], path)
        except BaseException as restore_error:
            preserve_recovery = True
            recovery = ', '.join(str(backups[path]) for path in originals)
            raise RuntimeError(f'Activation failed; recovery copies preserved at {recovery}; {restore_error}') from error
        raise
    finally:
        if not preserve_recovery:
            for path in temporary:
                path.unlink(missing_ok=True)


def configure(root, enabled, version, admin_enabled=False, provider=PROVIDER):
    if provider != PROVIDER or not isinstance(version, str) or not VERSION.fullmatch(version):
        raise ValueError('Use the official provider and an explicit published x.y.z version from WeChat admin.')
    if enabled and not admin_enabled:
        raise ValueError('First add WechatSI in WeChat admin, then pass --admin-enabled.')
    root = Path(root).resolve()
    app_path = root / 'app.json'
    loader_path = root / 'utils' / 'wechat-voice-plugin.js'
    for path in (app_path, loader_path):
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root):
            raise ValueError(f'Expected an existing regular file inside the project: {path}')
    originals = {path: path.read_bytes() for path in (app_path, loader_path)}
    app = json.loads(originals[app_path].decode('utf-8-sig'), object_pairs_hook=_unique_object)
    if not isinstance(app, dict) or not isinstance(app.get('plugins', {}), dict):
        raise ValueError('app.json and its plugins field must be objects.')
    plugins = app.get('plugins', {})
    current = plugins.get('WechatSI')
    if current is None:
        expected_loader = DISABLED_LOADER
    else:
        if not isinstance(current, dict) or set(current) != {'provider', 'version'} or current['provider'] != PROVIDER \
                or not isinstance(current['version'], str) or not VERSION.fullmatch(current['version']):
            raise ValueError('Existing WechatSI declaration is not managed by this helper; review it manually.')
        expected_loader = enabled_loader(current['version'])
    # Exact template ownership is intentional; do not replace custom JS.
    if originals[loader_path].decode('utf-8').replace('\r\n', '\n') != expected_loader:
        raise ValueError('The voice loader differs from the managed template; preserve and review the custom file.')
    if not enabled and current is not None and current['version'] != version:
        raise ValueError('Disable version must match the active managed plugin version.')
    if enabled:
        app.setdefault('plugins', {})['WechatSI'] = {'provider': PROVIDER, 'version': version}
        desired_loader = enabled_loader(version)
    else:
        plugins.pop('WechatSI', None)
        if app.get('plugins') == {}:
            app.pop('plugins')
        desired_loader = DISABLED_LOADER
    desired_app = (json.dumps(app, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    # Repeated activation should leave unchanged valid input bytes untouched.
    if json.loads(originals[app_path].decode('utf-8-sig')) == app and originals[loader_path] == desired_loader.encode('utf-8'):
        return
    loader_bytes = desired_loader.encode('utf-8')
    # Enable declares before loading; disable stops loading before undeclaring.
    # Even interruption between replacements therefore errs toward unavailable voice.
    desired = {app_path: desired_app, loader_path: loader_bytes} if enabled \
        else {loader_path: loader_bytes, app_path: desired_app}
    _replace_pair(originals, desired)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--enable', action='store_true')
    action.add_argument('--disable', action='store_true')
    parser.add_argument('--version', required=True, help='Explicit published plugin version shown in WeChat admin.')
    parser.add_argument('--admin-enabled', action='store_true', help='Confirm plugin was already added in WeChat admin.')
    parser.add_argument('--provider', default=PROVIDER)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        configure(args.root, args.enable, args.version, args.admin_enabled, args.provider)
    except (ValueError, OSError, RuntimeError) as error:
        parser.exit(1, f'{error}\n')
    print('WechatSI locally enabled.' if args.enable else 'WechatSI locally disabled; typing stays available.')


if __name__ == '__main__':
    main()
