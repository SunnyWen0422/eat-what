import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
it('Nginx sample revalidates both entry spellings and preserves explicit service precedence without SPA fallback', async () => {
  const config = await readFile(fileURLToPath(new URL('../deploy/nginx-web.example.conf', import.meta.url)), 'utf8');
  for (const entry of ['/', '/index.html']) {
    const block = config.split(`location = ${entry} {`)[1]!.split('\n}')[0]!; expect(block).toContain('Cache-Control "no-cache"');
  }
   expect(config).toContain('proxy_pass http://localhost:8080/api/;'); expect(config).toContain('location /health'); expect(config).toContain('location ^~ /.well-known/acme-challenge/'); expect(config).toContain('location = /main'); expect(config).toContain('try_files /main.html =404;');
  for (const path of ['/api/public/catalog/dishes', '/api/.env', '/api/nested/.secret']) {
    const baseline = await readFile(fileURLToPath(new URL('../../backend/nginx-chishenme.conf', import.meta.url)), 'utf8');
    expect(selectedPolicy(config, path)).toBe(selectedPolicy(baseline, path));
  }
  expect(selectedPolicy(config, '/api/.env')).toBe('deny');
  expect(config).not.toMatch(/try_files[^\n]*\$uri\/[^\n]*\/index\.html/); expect(config).toContain('location / { return 404; }');
});

// Test-only location-selection model for these static examples; not Nginx execution evidence.
function selectedPolicy(config: string, path: string): string {
  const locations = [...config.matchAll(/^\s*location (.*?) \{([\s\S]*?)\}/gm)].map(match => ({ declaration: match[1]!, body: match[2]! }));
  const classify = (body: string) => body.includes('deny all') ? 'deny' : body.includes('proxy_pass') ? 'proxy' : 'static';
  const exact = locations.find(item => item.declaration === '= ' + path); if (exact) return classify(exact.body);
  const prefixes = locations.filter(item => !item.declaration.startsWith('~') && !item.declaration.startsWith('=')).map(item => ({ ...item, path: item.declaration.replace(/^\^~ /, '') })).filter(item => path.startsWith(item.path)).sort((a, b) => b.path.length - a.path.length);
  const prefix = prefixes[0]; if (prefix?.declaration.startsWith('^~ ')) return classify(prefix.body);
  const regex = locations.find(item => item.declaration.startsWith('~ ') && new RegExp(item.declaration.slice(2).replace(/^"|"$/g, '')).test(path));
  return regex ? classify(regex.body) : prefix ? classify(prefix.body) : 'none';
}
