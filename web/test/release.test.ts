import { access, mkdir, readdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runNpm } from '../scripts/run-npm.ts';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
const simulatedLinks = vi.hoisted(() => new Set<string>());
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs,
    lstat: async (path: string) => { const stat = await fs.lstat(path); return simulatedLinks.has(String(path)) ? Object.assign(stat, { isSymbolicLink: () => true }) : stat; },
    readdir: async (path: string, options: unknown) => {
      const entries = await fs.readdir(path, options as { withFileTypes: true });
      if (Array.isArray(entries) && options && typeof options === 'object' && 'withFileTypes' in options)
        for (const entry of entries) if (simulatedLinks.has(join(String(path), entry.name))) Object.assign(entry, { isSymbolicLink: () => true });
      return entries;
    },
  };
});
// Windows may prohibit creating symlinks. Simulate filesystem metadata rather than weakening production checks.
async function linkFixture(target: string, path: string, directory = false) {
  if (process.platform !== 'win32') { await symlink(target, path); return; }
  if (directory) await mkdir(path); else await writeFile(path, 'simulated link');
  simulatedLinks.add(path);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const script = join(root, 'scripts/package-release.ts');
const temporary: string[] = []; const releaseId = 'test-candidate';
async function implementation() {
  expect(await access(script).then(() => true, () => false), 'candidate release packager must exist').toBe(true);
  return import(/* @vite-ignore */ script) as Promise<{
    reviewCandidate: (dist: string, releaseId: string, root: string) => Promise<void>;
    packageRelease: (dist: string, releaseId: string) => Promise<{ directory: string; sha256: string; archive: string }>;
    verifyRelease: (directory: string) => Promise<void>;
  }>;
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'eatwhat-release-')); temporary.push(directory);
  const dist = join(directory, 'dist'); const assets = join(dist, 'web-assets', releaseId);
  await mkdir(assets, { recursive: true }); await writeFile(join(assets, 'index-abc12345.js'), 'document.title="吃什么";'); await writeFile(join(assets, 'index-def12345.css'), 'body{color:#123}');
  await writeFile(join(dist, 'index.html'), `<html lang="zh-CN"><script type="module" src="/web-assets/${releaseId}/index-abc12345.js"></script><link rel="stylesheet" href="/web-assets/${releaseId}/index-def12345.css"></html>`);
  return dist;
}
afterEach(async () => { simulatedLinks.clear(); await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
describe('candidate release integrity and licensing gates', () => {
  it('rejects a candidate without a completed automated static review', async () => {
    const { packageRelease } = await implementation(); await expect(packageRelease(await fixture(), releaseId)).rejects.toThrow(/review/i);
  });
  it('packages version-pinned resources, license notices, exact hashes and a deterministic portable zip', async () => {
    const { reviewCandidate, packageRelease, verifyRelease } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root); const result = await packageRelease(dist, releaseId);
    expect(result.directory).toBe(join(dist, '..', 'release', releaseId)); expect(result.sha256).toMatch(/^[a-f0-9]{64}$/); await verifyRelease(result.directory);
    const manifest = JSON.parse(await readFile(join(result.directory, 'release-manifest.json'), 'utf8'));
    expect(manifest.status).toBe('待验收开发版'); expect(manifest.productionApproved).toBe(false); expect(manifest.browserAcceptance).toBe('NOT_RUN');
    expect(manifest.publicCatalog).toEqual({ source: 'online-only', enabledByDefault: false, approvedIdsByDefault: [], liveDataVerified: false });
    expect(manifest.dependencies.map((entry: { name: string }) => entry.name).sort()).toEqual(['react', 'react-dom', 'scheduler']);
    expect(await readFile(join(result.directory, 'THIRD-PARTY-LICENSES.txt'), 'utf8')).toContain('Permission is hereby granted'); expect(await readFile(join(result.directory, 'PROJECT-NOTICE.txt'), 'utf8')).toContain('未确认');
    expect((await readFile(result.archive)).readUInt32LE(0)).toBe(0x04034b50); await expect(packageRelease(dist, releaseId)).rejects.toThrow(/exist/i);
  });
  it.each(['../escape', 'a/b', '.hidden', 'UPPER', 'x'.repeat(65)])('rejects unsafe release ID %s', async id => {
    const { packageRelease } = await implementation(); await expect(packageRelease(await fixture(), id)).rejects.toThrow(/release.*id/i);
  });
  it.each(['THIRD-PARTY-LICENSES.txt', 'PROJECT-NOTICE.txt', 'web-assets/test-candidate/index-abc12345.js'])('rejects a missing reviewed file %s', async file => {
    const { reviewCandidate, packageRelease } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root); await rm(join(dist, file)); await expect(packageRelease(dist, releaseId)).rejects.toThrow(/missing|integrity|file/i);
  });
  it('rejects bytes changed after review rather than recomputing approval', async () => {
    const { reviewCandidate, packageRelease } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root); await writeFile(join(dist, 'web-assets', releaseId, 'index-abc12345.js'), 'changed'); await expect(packageRelease(dist, releaseId)).rejects.toThrow(/integrity/i);
  });
  it.each(['fetch("/api/dishes")', 'fetch("https://private.example")', 'const old="howtocook:dishes"'])('rejects private/remote/historical bindings before review: %s', async content => {
    const { reviewCandidate } = await implementation(); const dist = await fixture(); await writeFile(join(dist, 'web-assets', releaseId, 'index-abc12345.js'), content); await expect(reviewCandidate(dist, releaseId, root)).rejects.toThrow(/boundar/i);
  });
  it('rejects extra files added after review', async () => {
    const { reviewCandidate, packageRelease } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root); await writeFile(join(dist, '.env'), 'secret'); await expect(packageRelease(dist, releaseId)).rejects.toThrow(/file|integrity/i);
  });
  it('rejects symlinked assets without following them', async () => {
    const { reviewCandidate } = await implementation(); const dist = await fixture(); await linkFixture('/etc/passwd', join(dist, 'web-assets', releaseId, 'escape-abc12345.js')); await expect(reviewCandidate(dist, releaseId, root)).rejects.toThrow(/symbolic/i);
  });
  it('rejects nonversioned and missing entry references', async () => {
    const { reviewCandidate } = await implementation(); const dist = await fixture(); await writeFile(join(dist, 'index.html'), '<script type="module" src="/assets/index-abc12345.js"></script>'); await expect(reviewCandidate(dist, releaseId, root)).rejects.toThrow(/resource|entry/i);
  });
  it('detects package tampering using the delivered manifest', async () => {
    const { reviewCandidate, packageRelease, verifyRelease } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root); const result = await packageRelease(dist, releaseId); await writeFile(join(result.directory, 'index.html'), 'changed'); await expect(verifyRelease(result.directory)).rejects.toThrow(/integrity/i);
  });
});
it('rejects fabricated dependency approval in the review receipt', async () => {
  const { reviewCandidate, packageRelease } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root);
  const path = join(dist, 'candidate-review.json'); const receipt = JSON.parse(await readFile(path, 'utf8')); receipt.dependencies.push({ name: 'private-sdk', version: '1', license: 'MIT' }); await writeFile(path, JSON.stringify(receipt));
  await expect(packageRelease(dist, releaseId)).rejects.toThrow(/dependency.*integrity/i);
});
it('delivers the same ZIP bytes when repackaging the exact reviewed candidate', async () => {
  const { reviewCandidate, packageRelease } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root); const first = await packageRelease(dist, releaseId); const bytes = await readFile(first.archive);
  await rm(first.directory, { recursive: true }); await rm(first.archive); const second = await packageRelease(dist, releaseId); expect(await readFile(second.archive)).toEqual(bytes); expect(second.sha256).toBe(first.sha256);
});
it('rejects a stale source fingerprint in the automated review receipt', async () => {
  const { reviewCandidate, packageRelease } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root);
  const path = join(dist, 'candidate-review.json'); const receipt = JSON.parse(await readFile(path, 'utf8')); receipt.sourceSha256 = '0'.repeat(64); await writeFile(path, JSON.stringify(receipt));
  await expect(packageRelease(dist, releaseId)).rejects.toThrow(/source.*integrity/i);
});
it('ships full third-party terms as a versioned hashed website resource referenced by the entry', async () => {
  const { reviewCandidate, packageRelease } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root); const result = await packageRelease(dist, releaseId);
  const manifest = JSON.parse(await readFile(join(result.directory, 'release-manifest.json'), 'utf8'));
  const notice = manifest.files.find((file: { path: string }) => /^web-assets\/test-candidate\/third-party-notices-[a-f0-9]{64}\.txt$/.test(file.path)); expect(notice, 'the deployed website must retain the dependency license text').toBeDefined();
  expect(await readFile(join(result.directory, 'index.html'), 'utf8')).toContain(`href="/${notice.path}"`);
  expect(await readFile(join(result.directory, notice.path), 'utf8')).toContain('Permission is hereby granted');
});
it('rejects active markup in a built SVG before candidate review', async () => {
  const { reviewCandidate } = await implementation(); const dist = await fixture();
  await writeFile(join(dist, 'web-assets', releaseId, 'icon-abc12345.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>active()</script></svg>');
  await expect(reviewCandidate(dist, releaseId, root)).rejects.toThrow(/boundar/i);
});
it('rejects a symbolic releases parent instead of writing through it', async () => {
  const { reviewCandidate, packageRelease } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root);
  const target = await mkdtemp(join(tmpdir(), 'eatwhat-release-target-')); temporary.push(target); await linkFixture(target, join(dist, '..', 'release'), true);
  await expect(packageRelease(dist, releaseId)).rejects.toThrow(/symbolic/i);
});
it('rejects the actual emitted SVG missing before the first review receipt', async () => {
  const { reviewCandidate } = await implementation(); const directory = await mkdtemp(join(tmpdir(), 'eatwhat-actual-emitted-')); temporary.push(directory);
  const id = 'test-emitted-candidate'; const dist = join(directory, 'dist');
  const env: NodeJS.ProcessEnv = { ...process.env, EATWHAT_RELEASE_ID: id }; delete env.npm_config_http_proxy; delete env.NPM_CONFIG_HTTP_PROXY;
  await runNpm(['run', 'build', '--', '--outDir', dist, '--emptyOutDir'], { cwd: root, env });
  const assets = join(dist, 'web-assets', id); const names = await readdir(assets);
  const icon = names.find(name => /^category-icons-.*\.svg$/.test(name)); const entry = names.find(name => /^index-.*\.js$/.test(name));
  expect(icon).toBeDefined(); expect(entry).toBeDefined(); const js = await readFile(join(assets, entry!), 'utf8'); expect(js).toContain(`/web-assets/${id}/${icon}`); await rm(join(assets, icon!));
  await expect(reviewCandidate(dist, id, root)).rejects.toThrow(/resource.*missing/i);
}, 20_000);
it.each([
  ['static JS chunk', 'import "./chunk-12345678.js";', 'js'],
  ['dynamic JS chunk', 'import("./chunk-12345678.js");', 'js'],
  ['exported JS chunk', 'export { value } from "./chunk-12345678.js";', 'js'],
  ['JS asset URL', 'const icon=new URL("./icon-12345678.svg",import.meta.url);', 'js'],
  ['CSS image', 'body{background-image:url("./icon-12345678.svg")}', 'css'],
])('rejects a missing %s before recording review', async (_name, source, extension) => {
  const { reviewCandidate } = await implementation(); const dist = await fixture(); await writeFile(join(dist, 'web-assets', releaseId, extension === 'js' ? 'index-abc12345.js' : 'index-def12345.css'), source);
  await expect(reviewCandidate(dist, releaseId, root)).rejects.toThrow(/resource.*missing/i);
});
it.each([
  ['escaping import', 'import "../../escape-12345678.js";', 'js'],
  ['wrong-release JS asset', 'const icon="/web-assets/other/icon-12345678.svg";', 'js'],
  ['remote import', 'import "//remote.example/chunk-12345678.js";', 'js'],
  ['CSS escape', 'body{background:url(../../escape-12345678.svg)}', 'css'],
  ['wrong-release CSS asset', 'body{background:url(/web-assets/other/icon-12345678.svg)}', 'css'],
  ['remote CSS image', 'body{background:url(//remote.example/icon-12345678.svg)}', 'css'],
])('rejects %s in emitted resource dependencies', async (_name, source, extension) => {
  const { reviewCandidate } = await implementation(); const dist = await fixture(); await writeFile(join(dist, 'web-assets', releaseId, extension === 'js' ? 'index-abc12345.js' : 'index-def12345.css'), source);
  await expect(reviewCandidate(dist, releaseId, root)).rejects.toThrow(/resource.*(?:escape|release|remote)/i);
});
it('accepts a fully present bounded JS/CSS resource closure with decoded JS and CSS URL strings', async () => {
  const { reviewCandidate, packageRelease } = await implementation(); const dist = await fixture(); const assets = join(dist, 'web-assets', releaseId);
  await writeFile(join(assets, 'chunk-12345678.js'), 'export const value=1;'); await writeFile(join(assets, 'icon-12345678.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>');
  await writeFile(join(assets, 'index-abc12345.js'), 'import {value} from "./chunk-12345678.js";const icon=`/web-assets/test-candidate/icon-12345678.svg#x`;const escaped="\\u002fweb-assets/test-candidate/icon-12345678.svg";');
  await writeFile(join(assets, 'index-def12345.css'), String.raw`body{--icon:url("./icon-\31 2345678.svg#x");background:var(--icon)}`);
  await reviewCandidate(dist, releaseId, root); await expect(packageRelease(dist, releaseId)).resolves.toMatchObject({ directory: join(dist, '..', 'release', releaseId) });
});
it('separates absent general project licensing from authorized branch/PR/Library delivery', async () => {
  const { reviewCandidate } = await implementation(); const dist = await fixture(); await reviewCandidate(dist, releaseId, root);
  const notice = await readFile(join(dist, 'PROJECT-NOTICE.txt'), 'utf8'); expect(notice).toContain('用户授权'); expect(notice).toContain('Library'); expect(notice).toContain('通用');
});
it.each([
  ['missing image-set source', 'image-set("./missing-12345678.png" 1x)'],
  ['missing prefixed source', '-webkit-image-set("./missing-12345678.png" 1x)'],
  ['remote image-set source', 'image-set("//cdn.example/image-12345678.png" 1x)'],
  ['remote prefixed source', '-webkit-image-set("//cdn.example/image-12345678.png" 1x)'],
  ['uppercase function', 'IMAGE-SET("./missing-12345678.png" 1x)'],
  ['escaped function name', String.raw`im\61ge-set("./missing-12345678.png" 1x)`],
  ['escaped prefixed function name', String.raw`-webkit-\69 mage-set("./missing-12345678.png" 1x)`],
])('rejects unsupported %s before the first receipt', async (_name, expression) => {
  const { reviewCandidate } = await implementation(); const dist = await fixture(); await writeFile(join(dist, 'web-assets', releaseId, 'index-def12345.css'), `body{background-image:${expression}}`);
  await expect(reviewCandidate(dist, releaseId, root)).rejects.toThrow(/unsupported CSS image-set/i);
  await expect(access(join(dist, 'candidate-review.json'))).rejects.toThrow();
});
it('rejects otherwise-valid present image-set resources and type metadata as unsupported syntax', async () => {
  const { reviewCandidate } = await implementation(); const dist = await fixture(); const assets = join(dist, 'web-assets', releaseId);
  await writeFile(join(assets, 'icon-12345678.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>');
  await writeFile(join(assets, 'index-def12345.css'), 'body{background-image:image-set("./icon-12345678.svg" type("image/svg+xml") 1x)}');
  await expect(reviewCandidate(dist, releaseId, root)).rejects.toThrow(/unsupported CSS image-set/i);
});

it.each([
  ['escaped missing string', String.raw`@\69mport "./missing-12345678.css";`],
  ['escaped remote string', String.raw`@\69mport "//cdn.example/missing-12345678.css";`],
  ['escaped remote target', String.raw`@\69mport "\2f\2f cdn.example/missing-12345678.css";`],
  ['mixed-case missing string', '@ImPoRt "./missing-12345678.css";'],
  ['mixed-case remote string', '@ImPoRt "https://cdn.example/missing-12345678.css";'],
  ['mixed-case escaped identifier', String.raw`@\49mPoRt "./missing-12345678.css";`],
  ['escaped URL syntax', String.raw`@\69mport url("./missing-12345678.css");`],
])('rejects unsupported CSS import (%s) before the first receipt', async (_name, source) => {
  const { reviewCandidate } = await implementation(); const dist = await fixture();
  await writeFile(join(dist, 'web-assets', releaseId, 'index-def12345.css'), source + 'body{color:#123}');
  await expect(reviewCandidate(dist, releaseId, root)).rejects.toThrow(/unsupported CSS import/i);
  await expect(access(join(dist, 'candidate-review.json'))).rejects.toThrow();
});
it.each(['import', 'ImPoRt', String.raw`\69mport`])('rejects even a present local stylesheet under the fail-closed @%s policy', async name => {
  const { reviewCandidate } = await implementation(); const dist = await fixture(); const assets = join(dist, 'web-assets', releaseId);
  await writeFile(join(assets, 'style-12345678.css'), 'body{color:#123}');
  await writeFile(join(assets, 'index-def12345.css'), `@${name} "./style-12345678.css";`);
  await expect(reviewCandidate(dist, releaseId, root)).rejects.toThrow(/unsupported CSS import/i);
  await expect(access(join(dist, 'candidate-review.json'))).rejects.toThrow();
});
