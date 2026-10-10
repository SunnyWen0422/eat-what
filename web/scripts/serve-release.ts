import { createServer, type Server } from 'node:http';
import { realpath } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease } from './release-files.ts';
// Node's callback resolver still canonicalizes symlinks on Windows hosts where
// the native promises resolver cannot use GetFinalPathNameByHandle.
const canonicalPath = promisify(realpath);
/** Local static acceptance helper. Reserved services are deliberately unavailable here. */
export function createReleaseServer(directory: string): Server {
  const root = resolve(directory);
  return createServer(async (request, response) => {
    const reply = (status: number, body: string, type = 'text/plain; charset=utf-8') => { response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(body); };
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.setHeader('Allow', 'GET, HEAD'); reply(405, 'Method not allowed\n'); return; }
    const rawPath = (request.url ?? '/').split('?')[0]!;
    if (/[%\\\u0000-\u0020]/.test(rawPath)) { reply(404, 'Not found\n'); return; }
    if (rawPath === '/api' || rawPath.startsWith('/api/')) { reply(503, '{"error":"CANDIDATE_LOCAL_API_DISABLED"}', 'application/json; charset=utf-8'); return; }
    if (rawPath === '/health') { reply(200, 'candidate-local-only\n'); return; }
    const isEntry = rawPath === '/' || rawPath === '/index.html';
    const isAsset = /^\/web-assets\/[a-z0-9][a-z0-9-]{0,63}\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|svg|png|webp|woff2|txt)$/.test(rawPath);
    if (!isEntry && !isAsset) { reply(404, 'Not found\n'); return; }
    const file = join(root, isEntry ? 'index.html' : rawPath.slice(1));
    try {
      const stat = await lstat(file); const resolved = await canonicalPath(file);
      if (!stat.isFile() || stat.isSymbolicLink() || !resolved.startsWith(root + sep)) { reply(404, 'Not found\n'); return; }
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
      const bytes = await readFile(file); response.writeHead(200, { 'Content-Type': types[extname(file)]!, 'Content-Length': bytes.length, 'Cache-Control': isEntry ? 'no-cache' : 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }); response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { reply(404, 'Not found\n'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2] ?? '.'); const portIndex = process.argv.indexOf('--port'); const port = Number(portIndex < 0 ? 4173 : process.argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1–65535');
  await verifyRelease(directory);
  createReleaseServer(directory).listen(port, '127.0.0.1', () => process.stdout.write(`待验收开发版: http://127.0.0.1:${port}/ (public API disabled; local static helper only)\n`));
}
