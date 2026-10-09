import { execFile } from 'node:child_process';
import { cp, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkBoundaries } from './check-boundaries.ts';
import { checkOnlineContract } from './check-online-contract.ts';
import { checkReleaseResources } from './check-release-resources.ts';
import { digest, inventory, safeReleaseId, verifyRelease, type FileDigest } from './release-files.ts';
export { verifyRelease } from './release-files.ts';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const supportedDependencies: Record<string, string> = { react: '19.3.0', 'react-dom': '19.3.0', scheduler: '0.28.0' };
type Dependency = { name: string; version: string; license: string; licenseSha256: string; integrity: string };
type Review = { schemaVersion: 1; releaseId: string; review: 'automated-static-candidate'; status: '待验收开发版'; productionApproved: false; files: FileDigest[]; dependencies: Dependency[]; sourceSha256: string; lockSha256: string };
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
function validateId(id: string) { if (!safeReleaseId(id)) throw new Error('Unsafe release ID'); }
async function licenses(root: string): Promise<{ dependencies: Dependency[]; text: string; lockSha256: string }> {
  const lockBytes = await readFile(join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes.toString('utf8')) as { packages: Record<string, { version: string; integrity: string; resolved: string; dependencies?: Record<string, string> }> };
  const packageJSON = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
  if (JSON.stringify(Object.keys(packageJSON.dependencies).sort()) !== JSON.stringify(['react', 'react-dom'])) throw new Error('Unapproved private runtime dependency');
  const pending = Object.keys(packageJSON.dependencies); const seen = new Set<string>(); const dependencies: Dependency[] = []; let text = '随此静态候选分发的运行时第三方许可（开发工具不进入浏览器包）。\n';
  while (pending.length) {
    const name = pending.shift()!; if (seen.has(name)) continue; seen.add(name);
    if (!(name in supportedDependencies)) throw new Error('Unapproved private runtime dependency');
    const entry = lock.packages[`node_modules/${name}`]; const metadata = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8')) as { name: string; version: string; license: string; dependencies?: Record<string, string> };
    if (!entry || entry.version !== supportedDependencies[name] || metadata.name !== name || metadata.version !== entry.version || metadata.license !== 'MIT' || !/^sha512-/.test(entry.integrity) || !entry.resolved.startsWith('https://registry.npmjs.org/')) throw new Error('Dependency provenance or license missing/unapproved');
    const license = await readFile(join(root, 'node_modules', name, 'LICENSE'), 'utf8'); if (!license.includes('Permission is hereby granted')) throw new Error('Dependency license text missing');
    if (JSON.stringify(metadata.dependencies ?? {}) !== JSON.stringify(entry.dependencies ?? {})) throw new Error('Dependency lock drift');
    dependencies.push({ name, version: entry.version, license: 'MIT', licenseSha256: digest(license), integrity: entry.integrity }); text += `\n===== ${name}@${entry.version} (MIT) =====\n${license}\n`;
    pending.push(...Object.keys(metadata.dependencies ?? {}));
  }
  dependencies.sort((a, b) => a.name.localeCompare(b.name, 'en')); return { dependencies, text, lockSha256: digest(lockBytes) };
}
async function sourceFingerprint(root: string): Promise<string> {
  const sources: FileDigest[] = [];
  for (const subdirectory of ['src', 'scripts', 'deploy']) for (const file of await inventory(join(root, subdirectory))) sources.push({ ...file, path: subdirectory + '/' + file.path });
  for (const file of ['package.json', 'package-lock.json', 'vite.config.ts', 'index.html']) { const bytes = await readFile(join(root, file)); sources.push({ path: file, bytes: bytes.length, sha256: digest(bytes) }); }
  return digest(json(sources));
}
async function validateStatic(dist: string, id: string): Promise<FileDigest[]> {
  const files = (await inventory(dist)).filter(file => file.path !== 'candidate-review.json');
  if (files.length > 1000 || files.reduce((sum, file) => sum + file.bytes, 0) > 100 * 1024 * 1024) throw new Error('Candidate resource limit exceeded');
  const resources = files.filter(file => file.path.startsWith(`web-assets/${id}/`));
  if (!resources.some(file => file.path.endsWith('.js')) || !resources.some(file => file.path.endsWith('.css'))) throw new Error('Versioned entry resources missing');
  if (files.some(file => !['index.html', 'THIRD-PARTY-LICENSES.txt', 'PROJECT-NOTICE.txt'].includes(file.path) && !new RegExp(`^web-assets/${id}/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\\.(?:js|css|svg|png|webp|woff2|txt)$`).test(file.path))) throw new Error('Unexpected candidate file/resource');
  const html = await readFile(join(dist, 'index.html'), 'utf8'); const refs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]!);
  if (!refs.length || refs.some(ref => !ref.startsWith(`/web-assets/${id}/`) || !resources.some(file => '/' + file.path === ref))) throw new Error('Missing or nonversioned entry resource');
  await checkReleaseResources(dist, id, resources);
  const boundary = await checkBoundaries(projectRoot, dist); if (boundary.violations.length) throw new Error(`Candidate boundaries: ${boundary.violations.join('; ')}`);
  return files;
}
/** Creates an integrity receipt for automated checks only, never a human/content/production approval. */
export async function reviewCandidate(dist: string, releaseId: string, root = projectRoot): Promise<void> {
  validateId(releaseId); await checkOnlineContract(root); await validateStatic(dist, releaseId);
  const dependencies = await licenses(root);
  await writeFile(join(dist, 'THIRD-PARTY-LICENSES.txt'), dependencies.text);
  const noticePath = `web-assets/${releaseId}/third-party-notices-${digest(dependencies.text)}.txt`;
  await writeFile(join(dist, noticePath), dependencies.text);
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  const licenseLink = `<link rel="license" href="/${noticePath}" />`;
  if (!html.includes(licenseLink)) await writeFile(join(dist, 'index.html'), html.includes('</head>') ? html.replace('</head>', `    ${licenseLink}\n  </head>`) : html + licenseLink);

  await writeFile(join(dist, 'PROJECT-NOTICE.txt'), '吃什么独立网页：待验收开发版。仓库未声明通用的项目开源/再分发许可，不能据此推定一般许可。用户授权的本次独立分支、草稿PR及Library交付可在批准范围内进行。线上菜品披露许可仍未确认。第三方MIT许可只覆盖对应依赖；本候选不包含线上菜谱、个人备份或历史静态菜库。此文件不授予部署或公开传播许可。\n');
  const review: Review = { schemaVersion: 1, releaseId, review: 'automated-static-candidate', status: '待验收开发版', productionApproved: false, files: await validateStatic(dist, releaseId), dependencies: dependencies.dependencies, sourceSha256: await sourceFingerprint(root), lockSha256: dependencies.lockSha256 };
  await writeFile(join(dist, 'candidate-review.json'), json(review));
}
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
/** Deterministic stored ZIP, fixed DOS epoch and sorted ASCII paths; no external archive executable. */
async function zip(directory: string): Promise<Buffer> {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const file of await inventory(directory)) {
    const name = Buffer.from(file.path); const bytes = await readFile(join(directory, file.path)); const crc = crc32(bytes);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x21, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    locals.push(header, name, bytes); const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42); centrals.push(central, name); offset += header.length + name.length + bytes.length;
  }
  const body = Buffer.concat(centrals); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(body.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, body, end]);
}
export async function packageRelease(dist: string, releaseId: string): Promise<{ directory: string; sha256: string; archive: string }> {
  validateId(releaseId); let review: Review;
  try { review = JSON.parse(await readFile(join(dist, 'candidate-review.json'), 'utf8')) as Review; } catch { throw new Error('Candidate review missing or malformed'); }
  if (review.schemaVersion !== 1 || review.releaseId !== releaseId || review.review !== 'automated-static-candidate' || review.status !== '待验收开发版' || review.productionApproved !== false) throw new Error('Candidate review missing or unapproved');
  const current = await validateStatic(dist, releaseId);
  if (JSON.stringify(current) !== JSON.stringify(review.files) || !current.some(file => file.path === 'THIRD-PARTY-LICENSES.txt') || !current.some(file => file.path === 'PROJECT-NOTICE.txt')) throw new Error('Candidate file integrity mismatch or license missing');
  const provenance = await licenses(projectRoot);
  if (JSON.stringify(provenance.dependencies) !== JSON.stringify(review.dependencies) || provenance.lockSha256 !== review.lockSha256 || await readFile(join(dist, 'THIRD-PARTY-LICENSES.txt'), 'utf8') !== provenance.text) throw new Error('Dependency review/provenance integrity mismatch');
  await checkOnlineContract(projectRoot);
  if (review.sourceSha256 !== await sourceFingerprint(projectRoot)) throw new Error('Source review integrity mismatch');
  const releases = resolve(dist, '..', 'release');
  const releaseParent = await lstat(releases).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (releaseParent?.isSymbolicLink()) throw new Error('Symbolic releases parent');
  if (releaseParent && !releaseParent.isDirectory()) throw new Error('Releases parent must be a directory');
  const directory = join(releases, releaseId); const archive = directory + '.zip';
  for (const path of [directory, archive]) if (await lstat(path).then(() => true, () => false)) throw new Error('Release already exists; use a new release ID');
  await mkdir(releases, { recursive: true }); const staging = join(releases, `${releaseId}.staging`); await mkdir(staging);
  try {
    for (const file of current) { await mkdir(resolve(staging, file.path, '..'), { recursive: true }); await cp(join(dist, file.path), join(staging, file.path)); }
    await mkdir(join(staging, 'tools')); for (const file of ['serve-release.ts', 'release-files.ts']) await cp(join(projectRoot, 'scripts', file), join(staging, 'tools', file));
    for (const file of ['README_LOCAL.md', 'nginx-web.example.conf']) await cp(join(projectRoot, 'deploy', file), join(staging, file));
    const manifest = { schemaVersion: 1, releaseId, status: review.status, productionApproved: false, browserAcceptance: 'NOT_RUN', publicCatalog: { source: 'online-only', enabledByDefault: false, approvedIdsByDefault: [], liveDataVerified: false }, review: review.review, sourceSha256: review.sourceSha256, lockSha256: review.lockSha256, dependencies: review.dependencies, files: await inventory(staging) };
    await writeFile(join(staging, 'release-manifest.json'), json(manifest)); const sums = (await inventory(staging)).map(file => `${file.sha256}  ${file.path}\n`).join(''); await writeFile(join(staging, 'SHA256SUMS'), sums); await verifyRelease(staging);
    const archiveBytes = await zip(staging); await writeFile(archive, archiveBytes, { flag: 'wx' }); await rename(staging, directory); return { directory, sha256: digest(sums), archive };
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const releaseId = process.argv[2] ?? 'candidate-20261009'; validateId(releaseId);
  const env: NodeJS.ProcessEnv = { ...process.env, EATWHAT_RELEASE_ID: releaseId }; delete env.npm_config_http_proxy; delete env.NPM_CONFIG_HTTP_PROXY;
  const build = await promisify(execFile)('npm', ['run', 'build'], { cwd: projectRoot, env }); process.stdout.write(build.stdout); process.stderr.write(build.stderr);
  await reviewCandidate(join(projectRoot, 'dist'), releaseId); const result = await packageRelease(join(projectRoot, 'dist'), releaseId); process.stdout.write(json(result));
}
