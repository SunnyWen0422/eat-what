"""Read-only, bounded checks of the clients' image addresses, with verified TLS.

Preserves recipe identities and versions. Stops on CDN access limits; an
unverified image is not necessarily missing. Never retries a blocked request.
"""
import argparse
import hashlib
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request


def display_url(value):
    url = urllib.parse.urlsplit(value)
    if url.scheme in ('http', 'https') and url.netloc in ('cp1.douguo.net', 'cp2.douguo.net'):
        return urllib.parse.urlunsplit(('https', 'cp1.douguo.com', url.path, url.query, url.fragment))
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--max-images', type=int, default=100)
    parser.add_argument('--no-network', action='store_true')
    args = parser.parse_args()
    assert 1 <= args.max_images <= 10000
    source, output = Path(args.source).resolve(), Path(args.output).resolve()
    raw = source.read_bytes(); digest = hashlib.sha256(raw).hexdigest()
    data = json.loads(raw); output.mkdir(parents=True, exist_ok=True)
    binding = output / 'source.json'
    if binding.exists(): assert json.loads(binding.read_text())['sourceSha256'] == digest
    else: binding.write_text(json.dumps({'sourceSha256': digest}), encoding='utf-8')
    urls = sorted({display_url(r['imageUrl']) for r in data['recipes'] if r.get('imageUrl')})
    cache = output / 'image-verification.jsonl'; records = []
    if cache.exists(): records = [json.loads(line) for line in cache.read_text(encoding='utf-8').splitlines() if line.strip()]
    verified = {r['url'] for r in records if r.get('ok') and r['url'] in urls}
    count = min(args.max_images, len(urls))
    selected = {urls[(i * (len(urls) - 1)) // max(1, count - 1)] for i in range(count)}
    stop = None
    if not args.no_network:
        with cache.open('a', encoding='utf-8') as log:
            for url in sorted(selected - verified):
                row = {'url': url, 'ok': False}
                try:
                    request = urllib.request.Request(url, headers={'Range': 'bytes=0-1023', 'User-Agent': 'EatWhat-Catalog-Audit/1.0'})
                    with urllib.request.urlopen(request, timeout=12) as response:
                        prefix = response.read(1024); kind = response.headers.get('Content-Type', '')
                        magic = prefix.startswith((b'\xff\xd8\xff', b'\x89PNG\r\n\x1a\n', b'GIF8')) or (prefix[:4] == b'RIFF' and prefix[8:12] == b'WEBP')
                        row.update(status=response.status, ok=response.status in (200, 206) and kind.startswith('image/') and magic)
                except urllib.error.HTTPError as error:
                    row.update(status=error.code, error='HTTPError')
                    if error.code in (429, 493, 503): stop = 'remote_access_limit'
                except (OSError, urllib.error.URLError) as error: row['error'] = type(error).__name__
                log.write(json.dumps(row) + '\n'); log.flush(); records.append(row)
                if row['ok']: verified.add(url)
                if stop: break
                time.sleep(.25)
    audit = {'sourceSha256': digest, 'catalogRevision': data['catalogRevision'], 'recipeCount': len(data['recipes']),
             'uniqueDisplayImages': len(urls), 'verifiedUniqueImages': len(verified),
             'unverifiedUniqueImages': len(set(urls) - verified), 'selectedSampleSize': count,
             'networkDisabled': args.no_network, 'stopReason': stop,
             'dataModified': False, 'allVerified': set(urls) <= verified,
             'note': 'Unverified includes access limits, unattempted images and failed requests; it does not mean missing images.'}
    (output / 'audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(audit, ensure_ascii=False))


if __name__ == '__main__': main()
