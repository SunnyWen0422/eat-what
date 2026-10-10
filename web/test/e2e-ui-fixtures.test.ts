import { expect, it } from 'vitest';
import { parseBackup } from '../src/backup/backup.ts';
import { longSourceBackup } from '../e2e/ui-fixtures.ts';
it('viewport and imported-source browser fixture is a valid nontruncated normal backup', async () => {
  const fixture = await longSourceBackup(); const restored = await parseBackup(new Blob([fixture.buffer]));
  expect(restored.ok).toBe(true); if (!restored.ok) throw new Error(restored.error.message);
  expect(restored.value.data.favorites[0]?.snapshot.name).toBe(fixture.name);
  expect(restored.value.data.favorites[0]?.snapshot.source.url).toBe(fixture.source);
  expect(fixture.name.length).toBeGreaterThan(150); expect(fixture.source.length).toBeGreaterThan(900);
});
