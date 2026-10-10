import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

/** Invoke npm's JavaScript CLI through Node; .cmd/.ps1 are not executable files on Windows. */
export function npmInvocation(args: string[], runtime: { node: string; npmCli?: string | undefined } = { node: process.execPath, npmCli: process.env.npm_execpath }) {
  let npmCli = runtime.npmCli;
  if (npmCli === undefined) {
    // Windows bundles npm beside node.exe; Unix bundles it under prefix/lib.
    // Resolve an installed Node symlink too, without searching an arbitrary shell PATH.
    const nodes = [runtime.node];
    try { nodes.push(realpathSync(runtime.node)); } catch { /* An explicit fixture may not contain Node. */ }
    const candidates = nodes.flatMap(node => [
      join(dirname(node), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      join(dirname(node), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      join(dirname(node), '..', 'share', 'nodejs', 'npm', 'bin', 'npm-cli.js'),
    ]);
    npmCli = candidates.find(path => { try { return statSync(path).isFile(); } catch { return false; } });
    if (!npmCli) throw new Error('npm CLI not found; run with npm or use a Node installation containing npm.');
  }
  return { executable: runtime.node, args: [npmCli, ...args] };
}
export async function runNpm(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
  const invocation = npmInvocation(args);
  if (!/[/\\]npm-cli\.js$/.test(invocation.args[0]!)) throw new Error('npm_execpath must identify npm-cli.js');
  try { await access(resolve(invocation.args[0]!)); } catch { throw new Error('npm CLI not found; run with npm or use a Node installation containing npm.'); }
  return promisify(execFile)(invocation.executable, invocation.args, { ...options, shell: false, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
}
