import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, posix } from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import type { FileDigest } from './release-files.ts';
// Existing lockfile toolchain only: Rolldown is Vite's parser; css-tree 3.2.1 is
// already locked through jsdom. Neither enters browser code or the portable ZIP.
const require = createRequire(import.meta.url);
const css = require('css-tree') as { ident: { decode: (name: string) => string }; parse: (source: string, options: { parseCustomProperty: boolean; onParseError: (error: Error) => never }) => unknown; walk: (tree: unknown, callback: (node: Record<string, unknown>) => void) => void };
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
function literal(value: unknown): string | null {
  const node = object(value); if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && Array.isArray(node.expressions) && node.expressions.length === 0 && Array.isArray(node.quasis) && node.quasis.length === 1) {
    const element = object(node.quasis[0]); const content = object(element?.value); return typeof content?.cooked === 'string' ? content.cooked : null;
  }
  return null;
}
const resourceLike = (value: string) => /^\/(?:web-assets|assets)\//.test(value) || /\.(?:js|css|svg|png|webp|woff2|txt)(?:[#?].*)?$/.test(value);
/** Validate every emitted module/asset dependency before any review receipt exists. */
export async function checkReleaseResources(dist: string, releaseId: string, files: FileDigest[]): Promise<void> {
  const available = new Set(files.map(file => file.path)); const prefix = `web-assets/${releaseId}/`;
  function dependency(value: string | null, owner: string) {
    if (value === null) throw new Error(`Resource dynamic/unsupported dependency: ${owner}`);
    if (value.startsWith('#')) return; // An in-document SVG fragment does not fetch a file.
    if (/^(?:\/\/|[a-z][a-z\d+.-]*:)/i.test(value)) throw new Error(`Resource remote dependency: ${owner}`);
    const path = value.split('#')[0]!;
    if (!path || /[%?\\\u0000-\u0020]/.test(path) || path.split('/').some(part => part === '..')) throw new Error(`Resource escape dependency: ${owner}`);
    const resolved = path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(owner), path);
    if (!resolved.startsWith(prefix)) throw new Error(`Resource wrong release or escaping dependency: ${owner}`);
    if (!available.has(resolved)) throw new Error(`Resource missing dependency: ${owner} -> ${resolved}`);
  }
  for (const file of files) {
    if (!file.path.endsWith('.js') && !file.path.endsWith('.css')) continue;
    if (file.bytes > 10 * 1024 * 1024) throw new Error('Resource parser input limit exceeded');
    const text = await readFile(join(dist, file.path), 'utf8');
    if (file.path.endsWith('.css')) {
      let tree;
      try { tree = css.parse(text, { parseCustomProperty: true, onParseError: error => { throw error; } }); } catch { throw new Error(`Resource CSS parse error: ${file.path}`); }
      css.walk(tree, node => {
        if (node.type === 'Function' && typeof node.name === 'string' && ['image-set', '-webkit-image-set'].includes(css.ident.decode(node.name).toLowerCase())) throw new Error(`Resource unsupported CSS image-set: ${file.path}`);
        if (node.type === 'Url') dependency(typeof node.value === 'string' ? node.value : null, file.path);
        // Imports are unused by this candidate. Reject every spelling before a receipt,
        // including CSS-escaped identifiers whose string targets are not Url nodes.
        if (node.type === 'Atrule' && typeof node.name === 'string' && css.ident.decode(node.name).toLowerCase() === 'import') throw new Error(`Resource unsupported CSS import: ${file.path}`);
        if (node.type === 'Raw') throw new Error(`Resource unsupported CSS syntax: ${file.path}`);
      });
      continue;
    }
    let ast;
    try { ast = parseAst(text, undefined, file.path); } catch { throw new Error(`Resource JS parse error: ${file.path}`); }
    const pending: unknown[] = [ast]; let visited = 0;
    while (pending.length) {
      const value = pending.pop(); const node = object(value); if (!node) continue;
      if (++visited > 500_000) throw new Error('Resource AST limit exceeded');
      if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ImportExpression') {
        if (node.source !== null && node.source !== undefined) dependency(literal(node.source), file.path);
      }
      if (node.type === 'NewExpression' && object(node.callee)?.name === 'URL' && Array.isArray(node.arguments)) {
        const base = object(node.arguments[1]); const meta = object(base?.object);
        if (base?.type === 'MemberExpression' && object(base.property)?.name === 'url' && meta?.type === 'MetaProperty' && object(meta.meta)?.name === 'import') dependency(literal(node.arguments[0]), file.path);
      }
      const staticValue = literal(node);
      if (staticValue !== null && resourceLike(staticValue)) dependency(staticValue, file.path);
      if (node.type === 'TemplateLiteral' && staticValue === null && Array.isArray(node.quasis)) {
        const first = object(object(node.quasis[0])?.value); if (typeof first?.cooked === 'string' && /^\/(?:web-assets|assets)\//.test(first.cooked)) throw new Error(`Resource dynamic dependency: ${file.path}`);
      }
      for (const child of Object.values(node)) { if (Array.isArray(child)) pending.push(...child); else if (typeof child === 'object' && child !== null) pending.push(child); }
    }
  }
}
