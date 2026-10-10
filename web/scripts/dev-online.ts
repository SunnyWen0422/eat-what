import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The local browser uses a public GET proxy, never a database credential or private account token.
const root = fileURLToPath(new URL('../', import.meta.url));
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', shell: false, env: { ...process.env, EATWHAT_CATALOG_PROXY: 'online' },
});
child.on('error', () => { console.error('Unable to start the web development server. Install locked dependencies with npm ci.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
