import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
const root = fileURLToPath(new URL('..', import.meta.url));
it('online contract gate permits current default-off source and rejects default enablement or a static fallback', async () => {
  const script = join(root, 'scripts/check-online-contract.ts'); expect(await access(script).then(() => true, () => false), 'online-only release contract checker must exist').toBe(true);
  const { checkOnlineContract } = await import(/* @vite-ignore */ script) as { checkOnlineContract: (root: string) => Promise<void> };
  await expect(checkOnlineContract(root)).resolves.toBeUndefined();
  const temporary = await mkdtemp(join(tmpdir(), 'eatwhat-online-'));
  try {
    const web = join(temporary, 'web'); const backend = join(temporary, 'backend/src/main/java/com/eatwhat/config');
    await mkdir(join(web, 'src/catalog'), { recursive: true }); await mkdir(backend, { recursive: true });
    const properties = await readFile(join(root, '../backend/src/main/java/com/eatwhat/config/PublicCatalogProperties.java'), 'utf8');
    await writeFile(join(backend, 'PublicCatalogProperties.java'), properties.replace('enabled = false', 'enabled = true'));
    await writeFile(join(web, 'vite.config.ts'), await readFile(join(root, 'vite.config.ts'), 'utf8')); await writeFile(join(web, 'src/catalog/public-transport.ts'), await readFile(join(root, 'src/catalog/public-transport.ts'), 'utf8'));
    await expect(checkOnlineContract(web)).rejects.toThrow(/default disabled/i); await writeFile(join(backend, 'PublicCatalogProperties.java'), properties);
    await writeFile(join(web, 'vite.config.ts'), 'publicDir: true'); await expect(checkOnlineContract(web)).rejects.toThrow(/static public catalog/i);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
