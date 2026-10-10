import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
export const digest = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
export const safeReleaseId = (id: string): boolean => /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
export type FileDigest = { path: string; bytes: number; sha256: string };
export async function inventory(directory: string): Promise<FileDigest[]> {
  const files: FileDigest[] = [];
  async function scan(path: string, prefix: string) {
    const stat = await lstat(path); if (stat.isSymbolicLink()) throw new Error('Symbolic release binding');
    if (!stat.isDirectory()) throw new Error('Release directory missing');
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const name = prefix + entry.name; if (!/^[A-Za-z0-9_.\/-]+$/.test(name) || name.split('/').some(segment => segment === '..')) throw new Error('Unsafe release file');
      if (entry.isSymbolicLink()) throw new Error('Symbolic release binding');
      if (entry.isDirectory()) await scan(join(path, entry.name), name + '/');
      else if (entry.isFile()) { const bytes = await readFile(join(path, entry.name)); files.push({ path: name, bytes: bytes.length, sha256: digest(bytes) }); }
      else throw new Error('Nonregular release file');
    }
  }
  await scan(resolve(directory), ''); return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
export async function verifyRelease(directory: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(directory, 'release-manifest.json'), 'utf8')) as { files: FileDigest[]; status: string; productionApproved: boolean };
  if (manifest.status !== '待验收开发版' || manifest.productionApproved !== false || !Array.isArray(manifest.files)) throw new Error('Candidate manifest missing');
  const actual = (await inventory(directory)).filter(file => !['release-manifest.json', 'SHA256SUMS'].includes(file.path));
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error('Release file integrity mismatch');
  const sums = (await inventory(directory)).filter(file => file.path !== 'SHA256SUMS').map(file => `${file.sha256}  ${file.path}\n`).join('');
  if (await readFile(join(directory, 'SHA256SUMS'), 'utf8') !== sums) throw new Error('Release checksum integrity mismatch');
}
