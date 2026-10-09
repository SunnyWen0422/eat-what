import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

/** Invoke npm's JavaScript CLI through Node; .cmd/.ps1 are not executable files on Windows. */
export function npmInvocation(args: string[], runtime: { node: string; npmCli?: string | undefined } = { node: process.execPath, npmCli: process.env.npm_execpath }) {
  const npmCli = runtime.npmCli ?? join(dirname(runtime.node), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return { executable: runtime.node, args: [npmCli, ...args] };
}
export async function runNpm(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
  const invocation = npmInvocation(args);
  if (!/[/\\]npm-cli\.js$/.test(invocation.args[0]!)) throw new Error('npm_execpath must identify npm-cli.js');
  try { await access(resolve(invocation.args[0]!)); } catch { throw new Error('npm CLI not found; run with npm or use a Node installation containing npm.'); }
  return promisify(execFile)(invocation.executable, invocation.args, { ...options, shell: false, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
}
