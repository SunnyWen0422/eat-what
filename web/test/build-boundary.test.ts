import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runNpm } from '../scripts/run-npm.ts';
import { expect, it } from 'vitest';

const forbiddenBinding = /\/api\/dishes|\/recommend|Bearer |https:\/\/(?!react\.dev\/errors\/)(?!["'`])|database-password|userId/;
it('scanner allows an exact quoted HTTPS scheme token and rejects actual external URL bindings',()=>{
  expect(forbiddenBinding.test('value.startsWith("https://")')).toBe(false);
  expect(forbiddenBinding.test('fetch("https://external.example/api")')).toBe(true);
  expect(forbiddenBinding.test('image.src="https://media.example/file"')).toBe(true);
  expect(forbiddenBinding.test('fetch("/api/dishes")')).toBe(true);
});

it('production build excludes historical audit recipes, test fixtures and private endpoint or remote-media bindings', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production' }; delete env.npm_config_http_proxy; delete env.NPM_CONFIG_HTTP_PROXY;
  const output = await runNpm(['run', 'build'], { cwd: root, env });
  expect(output.stdout).not.toContain('catalog:build');
  const files: string[] = [];
  async function collect(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name); if (entry.isDirectory()) await collect(path); else files.push(path);
    }
  }
  await collect(join(root, 'dist'));
  expect(files.some((path) => path.includes('/catalog/') || path.includes('/content/') || path.includes('/test/'))).toBe(false);
  for (const path of files) {
    const text = await readFile(path, 'utf8');
    expect(text).not.toMatch(/howtocook:dishes|简易红烧肉|土豆炖排骨|青菜 100g|fixture-content-|fixture-only|sourceSha256/);
    expect(text).not.toMatch(forbiddenBinding);
  }
}, 20_000);
