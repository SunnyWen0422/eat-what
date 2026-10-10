import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('..', import.meta.url));
it('rejects an occupied test port and leaves the existing server running', async () => {
  const existing = createServer((_request, response) => response.end('owned by another developer'));
  await new Promise<void>((resolve, reject) => { existing.once('error', reject); existing.listen(4173, '127.0.0.1', resolve); });
  try {
    await expect(promisify(execFile)(process.execPath, ['scripts/run-e2e.ts', '--list', '--project=chromium'], { cwd, timeout: 20_000 })).rejects.toMatchObject({ code: 1 });
    const response = await fetch('http://127.0.0.1:4173/');
    expect(await response.text()).toBe('owned by another developer');
  } finally { await new Promise<void>((resolve, reject) => existing.close(error => error ? reject(error) : resolve())); }
}, 25_000);
