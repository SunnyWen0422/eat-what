import { openRepository, type Repository } from './data/repository.ts';
import { probeStorage, type StorageStatus } from './data/storage-status.ts';

type Options = {
  getFactory?: () => IDBFactory | undefined;
  getOrigin?: () => string;
  open?: typeof openRepository;
  probe?: typeof probeStorage;
};
export interface StorageStartup { repository: Repository | null; storageStatus: StorageStatus }

/** A policy-denied browser property can throw before any IndexedDB request exists. */
export async function initializeStorage(options: Options = {}): Promise<StorageStartup> {
  let origin = 'null';
  try { origin = (options.getOrigin ?? (() => globalThis.location?.origin ?? 'null'))(); } catch { /* Origin is unknown. */ }
  const unavailable = (): StorageStatus => ({ readable: false, writable: false, origin, estimate: null, persisted: null,
    error: { code: 'UNAVAILABLE', message: '本地存储暂不可用，已保留浏览器中的原记录。本次临时内容不会保存。' } });
  let opened: Awaited<ReturnType<typeof openRepository>>;
  let factory: IDBFactory | undefined;
  try {
    factory = (options.getFactory ?? (() => globalThis.indexedDB))();
    if (!factory) return { repository: null, storageStatus: unavailable() };
    opened = await (options.open ?? openRepository)({ factory, now: () => new Date(), uuid: () => globalThis.crypto.randomUUID() });
  } catch { return { repository: null, storageStatus: unavailable() }; }
  let storageStatus: StorageStatus;
  try { storageStatus = await (options.probe ?? probeStorage)({ factory, origin }); }
  catch {
    // Retain the owned connection for reading/export; an unknown write probe must not enable saves.
    storageStatus = unavailable();
    storageStatus.readable = opened.ok && opened.value.status().readable;
  }
  if (!opened.ok) storageStatus = { ...storageStatus, writable: false, error: opened.error };
  return { repository: opened.ok ? opened.value : null, storageStatus };
}
