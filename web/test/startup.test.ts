import { IDBFactory } from 'fake-indexeddb';
import { expect, it } from 'vitest';
import { initializeStorage } from '../src/startup.ts';
import { openRepository } from '../src/data/repository.ts';

it('returns a usable temporary-mode outcome when the IndexedDB getter throws', async () => {
  const result = await initializeStorage({ getFactory: () => { throw new DOMException('denied', 'SecurityError'); }, getOrigin: () => 'https://test.invalid' });
  expect(result.repository).toBeNull();
  expect(result.storageStatus).toMatchObject({ origin: 'https://test.invalid', readable: false, writable: false, error: { code: 'UNAVAILABLE' } });
});

it('contains unexpected open failures and never treats them as empty persisted history', async () => {
  const result = await initializeStorage({ getFactory: () => new IDBFactory(), open: async () => { throw new Error('driver failed'); } });
  expect(result.repository).toBeNull();
  expect(result.storageStatus.writable).toBe(false);
  expect(result.storageStatus.error?.code).toBe('UNAVAILABLE');
});

it('keeps an already opened readable repository in read-only mode if capability probing throws', async () => {
  const factory = new IDBFactory();
  const opened = await openRepository({ factory, now: () => new Date(), uuid: () => crypto.randomUUID() });
  if (!opened.ok) throw new Error(opened.error.message);
  const result = await initializeStorage({ getFactory: () => factory, open: async () => opened, probe: async () => { throw new Error('storage manager getter denied'); } });
  expect(result.repository).toBe(opened.value);
  expect(result.storageStatus).toMatchObject({ readable: true, writable: false, error: { code: 'UNAVAILABLE' } });
  expect((await result.repository!.read()).ok).toBe(true);
  opened.value.close();
});

it('opens storage normally and retains completed capability probe results', async () => {
  const result = await initializeStorage({ getFactory: () => new IDBFactory(), getOrigin: () => 'https://test.invalid' });
  expect(result.repository).not.toBeNull();
  expect(result.storageStatus).toMatchObject({ readable: true, writable: true, error: null });
  result.repository!.close();
});
