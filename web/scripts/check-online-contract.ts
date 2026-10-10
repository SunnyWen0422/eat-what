import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Source-only gate: never proof of database, proxy or production API acceptance. */
export async function checkOnlineContract(webRoot: string): Promise<void> {
  const properties = await readFile(join(webRoot, '../backend/src/main/java/com/eatwhat/config/PublicCatalogProperties.java'), 'utf8');
  if (!/private boolean enabled = false;/.test(properties) || !/private List<Long> allowedDishIds = Collections.emptyList\(\);/.test(properties)) throw new Error('Public catalog must default disabled with an empty explicit allowlist');
  const transport = await readFile(join(webRoot, 'src/catalog/public-transport.ts'), 'utf8');
  if (!transport.includes("const endpoint = '/api/public/catalog/dishes';") || !transport.includes("credentials: 'omit', mode: 'same-origin', redirect: 'error'")) throw new Error('Online-only public GET contract changed');
  if (!(await readFile(join(webRoot, 'vite.config.ts'), 'utf8')).includes('publicDir: false')) throw new Error('Historical static public catalog copying must stay disabled');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkOnlineContract(resolve(process.argv[2] ?? '.')); process.stdout.write('Online-only transport and backend default-off/empty-allowlist source checks passed; live API NOT RUN.\n');
}
