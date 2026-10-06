"""Fail closed before starting private local services; never opens a connection."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

def validate(value):
    blockers = []
    if value.get('environment') != 'local': blockers.append('environment must be local')
    api = urlparse(value.get('api', ''))
    if api.scheme != 'http' or api.hostname != '127.0.0.1' or not api.port: blockers.append('API must be explicit loopback HTTP')
    if value.get('dbHost') != '127.0.0.1': blockers.append('database must bind loopback')
    if not str(value.get('database', '')).startswith('eatwhat_v4_local_'): blockers.append('database must have an isolated local name')
    root = Path(value.get('root', '.')).resolve()
    data = (root / value.get('dataDir', '')).resolve()
    if data == root or not data.is_relative_to(root): blockers.append('data directory must be inside the local workspace')
    return {'safe': not blockers, 'blockers': blockers}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--manifest', required=True); args = parser.parse_args()
    result = validate(json.loads(Path(args.manifest).read_text(encoding='utf-8-sig')))
    print(json.dumps(result)); raise SystemExit(0 if result['safe'] else 1)
