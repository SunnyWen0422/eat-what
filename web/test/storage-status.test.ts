import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { probeStorage, requestPersistence } from '../src/data/storage-status.ts';

describe('storage capability truthfulness', () => {
  it('reports an actual completed read/write probe and origin, estimate and persisted state', async () => {
    const persist = vi.fn(async () => true);
    const storage = { estimate: async () => ({ usage: 100, quota: 1000 }), persisted: async () => false, persist };
    expect(await probeStorage({ factory: new IDBFactory(), storage, origin: 'https://test.invalid' })).toEqual({ readable: true, writable: true, origin: 'https://test.invalid', estimate: { usage: 100, quota: 1000 }, persisted: false, error: null });
    expect(persist).not.toHaveBeenCalled(); expect(await requestPersistence(storage)).toBe(true); expect(persist).toHaveBeenCalledOnce();
  });
  it('reports storage denial without inventing private-mode detection', async () => {
    const factory = { open() { throw new DOMException('denied', 'SecurityError'); } } as unknown as IDBFactory;
    const result = await probeStorage({ factory, origin: 'null' });
    expect(result.readable).toBe(false); expect(result.writable).toBe(false); expect(result.error?.code).toBe('UNAVAILABLE'); expect(result.estimate).toBeNull();
  });
  it('does not promise persistence if the browser declines or lacks support', async () => {
    expect(await requestPersistence({ persist: async () => false })).toBe(false); expect(await requestPersistence({})).toBe(false);
  });
});

it('does not crash the storage probe when cryptographic UUID helpers are unavailable',async()=>{
  vi.stubGlobal('crypto',{});try { await expect(probeStorage({factory:new IDBFactory(),origin:'http://test.invalid'})).resolves.toMatchObject({readable:true,writable:false,error:{code:'UNAVAILABLE'}}); } finally {vi.unstubAllGlobals();}
});
