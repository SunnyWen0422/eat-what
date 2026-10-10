import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
const pathPolicy = vi.hoisted(() => ({ outside: false, denied: false, nativeDenied: false }));
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs, realpath: async (path: string) => {
    if (pathPolicy.nativeDenied) throw Object.assign(new Error('Native path resolution denied by host'), { code: 'EPERM' });
    if (pathPolicy.denied) throw new Error('path denied');
    if (pathPolicy.outside) return resolve(tmpdir(), 'outside.html');
    return fs.realpath(path);
  } };
});
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, realpath: (path: string, callback: (error: NodeJS.ErrnoException | null, resolvedPath: string) => void) => {
    if (pathPolicy.denied) { callback(Object.assign(new Error('path denied'), { code: 'EPERM' }), ''); return; }
    if (pathPolicy.outside) { callback(null, resolve(tmpdir(), 'outside.html')); return; }
    // Successful paths must be resolved by Node itself, never substituted with resolve(path).
    fs.realpath(path, callback);
  } };
});

it('serves the actual canonical file when native promise realpath is denied and still rejects unsafe results', async () => {
  const { createReleaseServer } = await import('../scripts/serve-release.ts');
  const root = await mkdtemp(join(tmpdir(), 'eatwhat-callback-route-'));
  try {
    await writeFile(join(root, 'index.html'), '<html>callback candidate</html>');
    pathPolicy.nativeDenied = true;
    const server = createReleaseServer(root);
    const dispatch = () => new Promise<{ status: number; body: string }>(resolveResponse => {
      let status = 0;
      const reply = { writeHead(code: number) { status = code; return this; }, end(body: string | Buffer) { resolveResponse({ status, body: body.toString() }); return this; } };
      // Exercise this server's request handler without requiring a network capability.
      server.emit('request', { method: 'GET', url: '/' } as IncomingMessage, reply as unknown as ServerResponse);
    });
    expect(await dispatch()).toEqual({ status: 200, body: '<html>callback candidate</html>' });
    pathPolicy.outside = true; expect((await dispatch()).status).toBe(404); pathPolicy.outside = false;
    pathPolicy.denied = true; expect((await dispatch()).status).toBe(404); pathPolicy.denied = false;
  } finally { pathPolicy.nativeDenied = false; pathPolicy.outside = false; pathPolicy.denied = false; await rm(root, { recursive: true, force: true }); }
});

it('portable candidate HTTP server serves only fixed static routes and never disguises reserved routes as HTML', async () => {
  const script = fileURLToPath(new URL('../scripts/serve-release.ts', import.meta.url));
  expect(await access(script).then(() => true, () => false), 'portable candidate HTTP server must exist').toBe(true);
  const { createReleaseServer } = await import(/* @vite-ignore */ script) as { createReleaseServer: (root: string) => Server };
  const root = await mkdtemp(join(tmpdir(), 'eatwhat-route-'));
  try {
    await mkdir(join(root, 'web-assets/candidate'), { recursive: true }); await writeFile(join(root, 'index.html'), '<html>candidate</html>'); await writeFile(join(root, 'web-assets/candidate/index-abc12345.js'), 'window.test=1;');
    const server = createReleaseServer(root); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('TCP address expected'); const base = `http://127.0.0.1:${address.port}`;
      for (const path of ['/', '/#/today', '/#/recipes', '/#/calendar', '/#/my']) {
        const response = await fetch(base + path); expect(response.status).toBe(200); expect(response.headers.get('content-type')).toContain('text/html'); expect(response.headers.get('cache-control')).toBe('no-cache');
      }
      const asset = await fetch(base + '/web-assets/candidate/index-abc12345.js'); expect(asset.status).toBe(200); expect(asset.headers.get('cache-control')).toContain('immutable');
      for (const path of ['/web-assets/candidate/missing-abc12345.js', '/recipes', '/unknown', '/.env', '/release-manifest.json', '/web-assets/candidate/%2e%2e/index.html', '/main', '/main.html', '/.well-known/acme-challenge/token']) {
        const response = await fetch(base + path); expect(response.status).toBe(404); expect(response.headers.get('content-type')).not.toContain('text/html');
      }
      const api = await fetch(base + '/api/public/catalog/dishes?page=1'); expect(api.status).toBe(503); expect(api.headers.get('content-type')).toContain('application/json'); expect(api.headers.get('cache-control')).toBe('no-store');
      pathPolicy.outside = true; expect((await fetch(base + '/')).status).toBe(404); pathPolicy.outside = false;
      pathPolicy.denied = true; expect((await fetch(base + '/')).status).toBe(404); pathPolicy.denied = false;
      const health = await fetch(base + '/health'); expect(health.status).toBe(200); expect(await health.text()).toBe('candidate-local-only\n'); expect(health.headers.get('content-type')).toContain('text/plain'); expect((await fetch(base + '/', { method: 'POST' })).status).toBe(405);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
