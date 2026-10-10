import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

/** Conservative source/build audit, not a substitute for browser request observation. */
export async function checkBoundaries(root: string, dist = resolve(root, 'dist')): Promise<{ violations: string[] }> {
  const violations: string[] = [];
  const sourceRoot = resolve(root, 'src');
  const forbiddenNames = new Set(['wx', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'serviceWorker', 'Worker', 'SharedWorker', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'dangerouslySetInnerHTML', 'eval', 'Function', 'Image']);
  function auditHtml(text: string, path: string) {
    const scripts = [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    if (scripts.length !== (text.match(/<script\b/gi)?.length ?? 0) || scripts.some(match => !/\btype=["']module["']/.test(match[1]!) || !/\bsrc=["']\/(?:src\/main\.tsx|assets\/[A-Za-z0-9_-]+\.js|web-assets\/[a-z0-9][a-z0-9-]{0,63}\/[A-Za-z0-9_-]+\.js)["']/.test(match[1]!) || !!match[2]!.trim()) || /\bon\w+\s*=|<(?:iframe|object|embed)\b|javascript:/i.test(text)) violations.push(`${path}: active or nonfixed HTML entry`);
    const localResource = (value: string) => !/^(?:\/\/|[a-z][a-z\d+.-]*:)|[\u0000-\u001f&]/i.test(value.trim().replace(/\\/g, '/'));
    for (const tag of text.matchAll(/<(?:link|img|audio|video|source|track|input|image|use|base)\b([^>]*)>/gi)) {
      for (const attribute of tag[1]!.matchAll(/\b(href|src|poster|srcset|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
        const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
        const urls = attribute[1]!.toLowerCase() === 'srcset' ? value.split(',').map(candidate => candidate.trim().split(/\s+/)[0] ?? '') : [value];
        if (urls.some(url => !localResource(url))) violations.push(`${path}: remote automatic HTML resource`);
      }
    }
    if (/url\(\s*["']?(?:\/\/|[a-z][a-z\d+.-]*:)/i.test(text)) violations.push(`${path}: remote HTML style resource`);
  }
  async function scan(directory: string, built = false) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) { await scan(file, built); continue; }
      if (entry.isSymbolicLink()) { violations.push(`${relative(root, file)}: symbolic source binding`); continue; }
      if (!/\.(?:tsx?|[cm]?js|css|html|svg)$/.test(entry.name)) continue;
      const text = await readFile(file, 'utf8'); const path = relative(root, file).split(sep).join('/');
      const report = (rule: string) => violations.push(`${path}: ${rule}`);
      if (/\/api\/(?!public\/catalog\/dishes)|\/recommend(?:[/'"?]|$)|Bearer |database-password|howtocook:dishes|fixture-only/.test(text)) report('private service, credential or historical fixture binding');
      if (/https?:\/\/(?!react\.dev\/errors\/)(?!www\.w3\.org\/(?:2000\/svg|1998\/Math\/MathML|1999\/xlink|XML\/1998\/namespace)["'`])(?!["'`\s])/.test(text)) report('remote resource binding');
      if (extname(file) === '.html') auditHtml(text, path);
      if (extname(file) === '.css' || extname(file) === '.svg' || extname(file) === '.html') {
        if (/@import|url\(\s*["']?(?:https?:|\/\/)|<(?:script|iframe)|\bon\w+\s*=/i.test(text) && extname(file) !== '.html') report('active markup or remote style resource');
        continue;
      }
      if (built) continue;
      const transport = path === 'src/catalog/public-transport.ts';
      const scanner = createScanner(true, undefined, text); let fetchCalls = 0;
      while (scanner.scan() !== SyntaxKind.EndOfFile) {
        const name = scanner.getToken() === SyntaxKind.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText();
        if (scanner.isIdentifier() || scanner.getToken() === SyntaxKind.StringLiteral) {
          if (forbiddenNames.has(name)) report(`forbidden runtime capability ${name}`);
          if (name === 'console') report('application logging');
          if (name === 'fetch' && !transport) report('network outside public catalog transport');
          if (name === 'indexedDB' && path.startsWith('src/ui/')) report('UI bypasses repository');
          if (name === 'fetcher' && text.slice(scanner.getTokenEnd()).trimStart().startsWith('(')) { fetchCalls++; if (!transport) report('network outside public catalog transport'); }
        }
      }
      if (extname(file) === '.tsx' && /\bimport\s*\(|<(?:img|iframe|script|link|object|embed|image)\b/.test(text)) report('dynamic module or media binding');
      for (const match of text.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)(['"])([^'"]+)\1/g)) {
        const specifier = match[2]!;
        if (specifier.startsWith('.')) { if (!resolve(dirname(file), specifier).startsWith(sourceRoot + sep)) report('import escapes independent web source'); }
        else if (!['react', 'react-dom', 'react-dom/client'].includes(specifier)) report('unapproved runtime dependency');
      }
      for (const match of text.matchAll(/\b(?:history\.)?(?:pushState|replaceState)\s*\(([^;\n]*)/g)) {
        if (path !== 'src/ui/App.tsx' || !/^null,\s*['"]{2},\s*ROUTES\[[^\]]+\]/.test(match[1]!)) report('nonfixed or personal URL state');
      }
      if (/\b(?:window\.open|(?:window\.)?location\.(?:assign|replace))\s*\(|\b(?:window\.)?location\.\w+\s*=|document\.write\s*\(/.test(text)) report('uncontrolled navigation');
      if (transport && [...text.matchAll(/parameters\.set\(([^)]*)\)/g)].some(match => match[1] !== "'type', query.type")) report('personal query outside public transport whitelist');
      if (transport && (fetchCalls !== 1 || !/const endpoint = '\/api\/public\/catalog\/dishes';/.test(text) || !/method: 'GET', credentials: 'omit', mode: 'same-origin', redirect: 'error'/.test(text) || !/new URLSearchParams\(\{ page: String\(query.page\), pageSize: String\(query.pageSize\) \}\)/.test(text) || !/exactKeys\(query, Object.hasOwn\(query, 'type'\) \? \['page', 'pageSize', 'type'\] : \['page', 'pageSize'\]\)/.test(text))) report('public transport contract changed');
      if (path === 'src/ui/App.tsx' && !/const ROUTES = \{ '今天吃什么': '#\/today', '菜谱': '#\/recipes', '日历': '#\/calendar', '我的': '#\/my' \} as const;/.test(text)) report('navigation allowlist changed');
    }
  }
  try { await access(sourceRoot); } catch { violations.push('src: application source tree missing'); }
  const entry = await readFile(resolve(root, 'index.html'), 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (entry !== null) auditHtml(entry, 'index.html');
  await scan(sourceRoot);
  await scan(dist, true);
  return { violations: [...new Set(violations)] };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkBoundaries(resolve(process.argv[2] ?? '.'));
  if (result.violations.length) { process.stderr.write(result.violations.join('\n') + '\n'); process.exitCode = 1; }
  else process.stdout.write('Independent web source/build boundaries passed.\n');
}
