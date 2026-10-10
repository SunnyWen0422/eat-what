import { expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { npmInvocation, runNpm } from '../scripts/run-npm.ts';

it('uses Node and the explicit npm CLI without interpreting spaces or shell syntax', () => {
  expect(npmInvocation(['run', 'build', '--', 'space and $literal'], { node: 'C:/Program Files/node/node.exe', npmCli: 'C:/Program Files/node/npm-cli.js' })).toEqual({ executable: 'C:/Program Files/node/node.exe', args: ['C:/Program Files/node/npm-cli.js', 'run', 'build', '--', 'space and $literal'] });
});

it.each(['windows', 'unix'])('locates a real %s npm installation with spaces without shell evaluation', async layout => {
  const root = await mkdtemp(join(tmpdir(), 'npm layout with spaces '));
  try {
    const node = join(root, layout === 'windows' ? 'node.exe' : 'bin/node');
    const cli = join(root, layout === 'windows' ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js');
    await mkdir(join(cli, '..'), { recursive: true }); await writeFile(cli, '');
    const invocation = npmInvocation(['--version', '$literal'], { node });
    expect(invocation).toEqual({ executable: node, args: [cli, '--version', '$literal'] });
  } finally { await rm(root, { recursive: true }); }
});

it('runs npm when invoked directly without npm_execpath on this installation', async () => {
  const env = { ...process.env }; delete env.npm_execpath;
  const script = new URL('../scripts/run-npm.ts', import.meta.url).href;
  const source = `import {runNpm} from ${JSON.stringify(script)}; const r=await runNpm(['--version'],{cwd:process.cwd()});process.stdout.write(r.stdout)`;
  const output = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', source], { env });
  expect(output.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
});

it('actually runs npm through Node on this platform', async () => {
  const result = await runNpm(['--version'], { cwd: process.cwd() });
  expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
});

it('propagates a failing npm exit status rather than claiming a build completed', async () => {
  await expect(runNpm(['run', 'script-that-does-not-exist'], { cwd: process.cwd() })).rejects.toMatchObject({ code: 1 });
}, 20_000);
