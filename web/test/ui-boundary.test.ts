import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/check-boundaries.ts', import.meta.url));
async function audit() { expect(await access(script).then(() => true, () => false), 'build boundary audit must exist').toBe(true); return (await import(/* @vite-ignore */ script)).checkBoundaries as (root: string) => Promise<{ violations: string[] }>; }
describe('independent UI privacy build boundary', () => {
  it('audits shipped application source without blocking safe local graphics or public catalog transport', async () => {
    const check = await audit(); expect(await check(fileURLToPath(new URL('..', import.meta.url)))).toEqual({ violations: [] });
  });
  it.each([
    ['private mini-program endpoint', 'fetch("/api/dishes")'], ['external network', 'fetch("https://external.example")'], ['model SDK', 'import OpenAI from "openai"'],
    ['mini-program service', 'wx.request({})'], ['HTML injection', 'const x = <div dangerouslySetInnerHTML={{__html: input}} />'], ['DOM injection', 'node.innerHTML = input'],
    ['service worker', 'navigator.serviceWorker.register("/sw.js")'], ['telemetry', 'navigator.sendBeacon("/stats", personal)'], ['remote media', 'const x = <img src="https://image.example/photo"/>'],
    ['CSS remote font', '@import url("https://font.example/font.css");'], ['personal logs', 'console.log(personal)'], ['URL state', 'history.pushState(personal,"", "?name="+name)'],
    ['UI direct database', 'indexedDB.open("eatwhat-web")'], ['root services', 'import {request} from "../../utils/request.js"'], ['socket', 'new WebSocket("wss://example.test")'],
    ['computed database escape', 'window["indexedDB"].open("eatwhat-web")'], ['dynamic runtime import', 'import(moduleName)'], ['dynamic image source', 'const x = <img src={remoteURL}/>'],
  ])('rejects %s', async (_label, content) => {
    const check = await audit(); const root = await mkdtemp(join(tmpdir(), 'eatwhat-ui-boundary-'));
    try { await mkdir(join(root, 'src/ui'), { recursive: true }); await writeFile(join(root, content.startsWith('@import') ? 'src/ui/test.css' : 'src/ui/Test.tsx'), content); expect((await check(root)).violations.length).toBeGreaterThan(0); } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('does not allow relaxing public GET transport credentials or fixed-query scope', async () => {
    const check = await audit(); const source = await readFile(fileURLToPath(new URL('../src/catalog/public-transport.ts', import.meta.url)), 'utf8');
    const root = await mkdtemp(join(tmpdir(), 'eatwhat-transport-boundary-'));
    try { await mkdir(join(root, 'src/catalog'), { recursive: true }); await writeFile(join(root, 'src/catalog/public-transport.ts'), source.replace("credentials: 'omit'", "credentials: 'include'")); expect((await check(root)).violations.length).toBeGreaterThan(0); } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects additional personal query fields in the otherwise approved public transport', async () => {
    const check = await audit(); const source = await readFile(fileURLToPath(new URL('../src/catalog/public-transport.ts', import.meta.url)), 'utf8');
    const root = await mkdtemp(join(tmpdir(), 'eatwhat-query-boundary-'));
    try { await mkdir(join(root, 'src/catalog'), { recursive: true }); await writeFile(join(root, 'src/catalog/public-transport.ts'), source.replace("if (query.type)", "parameters.set('name', personal.name); if (query.type)")); expect((await check(root)).violations.length).toBeGreaterThan(0); } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('does not report a missing application source tree as an audited success', async () => {
    const check = await audit(); const root = await mkdtemp(join(tmpdir(), 'eatwhat-missing-boundary-'));
    try { expect((await check(root)).violations.length).toBeGreaterThan(0); } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('permits only the fixed module entry in source/build HTML and rejects injected inline scripts', async () => {
    const check = await audit(); const root = await mkdtemp(join(tmpdir(), 'eatwhat-html-boundary-'));
    try {
      await mkdir(join(root, 'src'), { recursive: true }); await mkdir(join(root, 'dist'), { recursive: true });
      await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.tsx"></script>');
      await writeFile(join(root, 'dist/index.html'), '<script type="module" crossorigin src="/assets/index-static123.js"></script>');
      expect((await check(root)).violations).toEqual([]);
      await writeFile(join(root, 'index.html'), '<script>executeImportedText()</script>'); expect((await check(root)).violations.length).toBeGreaterThan(0);
      await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.tsx"></script>');
      await writeFile(join(root, 'dist/index.html'), '<p onclick="executeImportedText()">bad</p>'); expect((await check(root)).violations.length).toBeGreaterThan(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.each([
    ['stylesheet', '<link rel="stylesheet" href="//external.example/privacy.css">'],
    ['image', '<img src="//external.example/photo.png">'],
    ['image candidates', '<img srcset="/assets/local.svg 1x, //external.example/photo.png 2x">'],
    ['video poster', '<video poster="//external.example/poster.png"></video>'],
    ['media source', '<audio><source src="//external.example/audio.ogg"></audio>'],
  ])('rejects protocol-relative automatic %s independently in source and built HTML', async (_name, markup) => {
    const check = await audit(); const root = await mkdtemp(join(tmpdir(), 'eatwhat-html-resource-boundary-'));
    try {
      await mkdir(join(root, 'src'), { recursive: true }); await mkdir(join(root, 'dist'), { recursive: true });
      await writeFile(join(root, 'index.html'), markup); await writeFile(join(root, 'dist/index.html'), '');
      expect((await check(root)).violations.some(violation => violation.startsWith('index.html:'))).toBe(true);
      await writeFile(join(root, 'index.html'), ''); await writeFile(join(root, 'dist/index.html'), markup);
      expect((await check(root)).violations.some(violation => violation.startsWith('dist/index.html:'))).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('allows genuine local module, CSS and media resources in source and built entry HTML', async () => {
    const check = await audit(); const root = await mkdtemp(join(tmpdir(), 'eatwhat-local-html-boundary-'));
    try {
      await mkdir(join(root, 'src'), { recursive: true }); await mkdir(join(root, 'dist'), { recursive: true });
      await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.tsx"></script><link rel="stylesheet" href="./assets/local.css"><img src="/assets/category.svg">');
      await writeFile(join(root, 'dist/index.html'), '<script type="module" crossorigin src="/assets/index-static123.js"></script><link rel="stylesheet" crossorigin href="/assets/index-static123.css"><img srcset="/assets/category.svg 1x, ./assets/category-large.svg 2x"><svg xmlns="http://www.w3.org/2000/svg"><use href="/assets/category.svg#vegetable"/></svg>');
      expect((await check(root)).violations).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.each(['import "../../../utils/request.js";', 'import "unapproved-runtime";'])('rejects side-effect import isolation/dependency escape: %s', async content => {
    const check = await audit(); const root = await mkdtemp(join(tmpdir(), 'eatwhat-side-effect-boundary-'));
    try { await mkdir(join(root, 'src/ui'), { recursive: true }); await writeFile(join(root, 'src/ui/Test.tsx'), content); expect((await check(root)).violations.length).toBeGreaterThan(0); } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('allows the existing local CSS side-effect import with the same independent-source rules', async () => {
    const check = await audit(); const root = await mkdtemp(join(tmpdir(), 'eatwhat-local-side-effect-boundary-'));
    try { await mkdir(join(root, 'src/ui'), { recursive: true }); await writeFile(join(root, 'src/ui/Test.tsx'), 'import "./styles.css"; import "react";'); await writeFile(join(root, 'src/ui/styles.css'), 'body { color: #283b2d; }'); expect((await check(root)).violations).toEqual([]); } finally { await rm(root, { recursive: true, force: true }); }
  });
});
