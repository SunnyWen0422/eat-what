import { spawn, execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
process.stdout.write(`Isolated test server PID: ${server.pid ?? 'spawn failed'}\n`);
let spawnError: Error | null = null;
let ready = false; let startupOutput = '';
server.stdout?.on('data', bytes => { startupOutput = (startupOutput + String(bytes)).slice(-8192); ready = startupOutput.includes('http://127.0.0.1:4173/'); });
server.stderr?.resume();
server.on('error', error => { spawnError = error; });
try {
  const deadline = Date.now() + 15_000;
  while (true) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error('The isolated browser-test server exited; verify port 4173 is free.');
    // A successful GET alone could belong to another developer's server. Wait for our own Vite process.
    if (ready) break;
    if (Date.now() >= deadline) throw new Error('Browser-test server did not start.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const runner = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { cwd, stdio: 'inherit', env: { ...process.env, EATWHAT_E2E_EXTERNAL_SERVER: '1' } });
  process.stdout.write(`Browser test runner PID: ${runner.pid ?? 'spawn failed'}\n`);
  const result = await new Promise<number>((resolve, reject) => { runner.once('error', reject); runner.once('exit', code => resolve(code ?? 1)); });
  process.exitCode = result;
} finally {
  // Only terminate the process tree created by this launcher, never an existing developer server.
  if (server.pid && server.exitCode === null) {
    const stopped = new Promise<boolean>(resolve => { server.once('exit', () => resolve(true)); setTimeout(() => resolve(false), 6000).unref(); });
    if (process.platform === 'win32') await promisify(execFile)(join(process.env.SystemRoot ?? 'C:/Windows', 'System32/taskkill.exe'), ['/PID', String(server.pid), '/T', '/F'], { timeout: 5000 }).catch(() => { server.kill(); });
    else { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); } }
    if (server.exitCode === null && !await stopped) {
      process.stderr.write('The test server could not be stopped in this environment. Browser checks completed; launcher cleanup failed.\n');
      process.exitCode = 1;
    }
  }
  server.stdout?.destroy(); server.stderr?.destroy();
  server.unref();
}
