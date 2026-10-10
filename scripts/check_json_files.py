"""Validate source JSON with case-sensitive keys, without traversing generated/private trees."""
import argparse
import json
import os
from pathlib import Path

EXCLUDED = {'.git', 'target', 'node_modules', 'dist', 'release', 'coverage', 'playwright-report', 'test-results',
            '.mysql-test-data', '.local-v4', '.test-artifacts', '.test-venv', '__pycache__', '.pytest_cache'}


def excluded(name):
    return name in EXCLUDED or name.startswith(('.local-maturity', 'tmppytest-'))


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key')
        result[key] = value
    return result


def invalid_constant(_value):
    raise ValueError('Non-finite JSON number')


def check(root):
    count, errors = 0, []
    for directory, folders, files in os.walk(root, followlinks=False):
        folders[:] = sorted(name for name in folders if not excluded(name) and not (Path(directory) / name).is_symlink())
        for name in sorted(files):
            path = Path(directory) / name
            if path.suffix.lower() != '.json' or path.is_symlink():
                continue
            count += 1
            try:
                json.loads(path.read_text(encoding='utf-8-sig'), object_pairs_hook=unique_object, parse_constant=invalid_constant)
            except (ValueError, OSError, UnicodeError) as error:
                # Never echo document values, keys or credential-bearing source content.
                errors.append(f'{path.relative_to(root).as_posix()}: {type(error).__name__}')
    return count, errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('root', type=Path)
    args = parser.parse_args()
    count, errors = check(args.root.resolve())
    for error in errors:
        print(error)
    print(f'Checked {count} source JSON files; {len(errors)} errors.')
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
