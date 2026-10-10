import { expect, it } from 'vitest';
import { join } from 'node:path';
import { npmInvocation, runNpm } from '../scripts/run-npm.ts';

it('uses Node and the explicit npm CLI without interpreting spaces or shell syntax', () => {
  expect(npmInvocation(['run', 'build', '--', 'space and $literal'], { node: 'C:/Program Files/node/node.exe', npmCli: 'C:/Program Files/node/npm-cli.js' })).toEqual({ executable: 'C:/Program Files/node/node.exe', args: ['C:/Program Files/node/npm-cli.js', 'run', 'build', '--', 'space and $literal'] });
});

it('uses the Node installation npm CLI when started directly rather than from npm', () => {
  const invocation = npmInvocation(['--version'], { node: '/runtime/bin/node', npmCli: undefined });
  expect(invocation.executable).toBe('/runtime/bin/node');
  expect(invocation.args).toEqual([join('/runtime/bin', 'node_modules/npm/bin/npm-cli.js'), '--version']);
});

it('actually runs npm through Node on this platform', async () => {
  const result = await runNpm(['--version'], { cwd: process.cwd() });
  expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
});

it('propagates a failing npm exit status rather than claiming a build completed', async () => {
  await expect(runNpm(['run', 'script-that-does-not-exist'], { cwd: process.cwd() })).rejects.toMatchObject({ code: 1 });
}, 20_000);
