import type { ErrorCode, Result } from '../domain/types.ts';
export interface StorageStatus {
  readable: boolean; writable: boolean; origin: string; estimate: StorageEstimate | null; persisted: boolean | null;
  error: { code: ErrorCode; message: string } | null;
}
type StorageLike = Partial<Pick<StorageManager, 'estimate' | 'persisted' | 'persist'>>;
export async function probeStorage(options: { factory?: IDBFactory; storage?: StorageLike; origin?: string } = {}): Promise<StorageStatus> {
  const storage = options.storage ?? globalThis.navigator?.storage;
  const result: StorageStatus = { readable: false, writable: false, origin: options.origin ?? globalThis.location?.origin ?? 'null', estimate: null, persisted: null, error: null };
  try { result.estimate = await storage?.estimate?.() ?? null; } catch { /* Unsupported estimates are unknown. */ }
  try { result.persisted = await storage?.persisted?.() ?? null; } catch { /* Persistence remains unknown. */ }
  const factory = options.factory ?? globalThis.indexedDB;
  if (!factory) return { ...result, error: { code: 'UNAVAILABLE', message: 'IndexedDB is unavailable' } };
  // Only a disposable capability database is touched, never personal stores or an existing newer schema.
  const hasCrypto = typeof globalThis.crypto?.randomUUID === 'function' && globalThis.crypto?.subtle !== undefined;
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const probeName = `eatwhat-web-probe-${nonce}`;
  return new Promise((resolve) => {
    let db: IDBDatabase | null = null; let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return; settled = true; db?.close();
      if (db) { try { factory.deleteDatabase(probeName); } catch { /* Empty probe cleanup can be retried by the browser. */ } }
      if (error) result.error = { code: error instanceof DOMException && error.name === 'QuotaExceededError' ? 'QUOTA' : 'UNAVAILABLE', message: 'Local storage cannot complete a write. This session will not be saved.' };
      resolve(result);
    };
    try {
      const request = factory.open(probeName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('probe');
      request.onblocked = () => finish(new DOMException('blocked', 'AbortError'));
      request.onerror = () => finish(request.error);
      request.onsuccess = () => {
        db = request.result; if (settled) { db.close(); return; } result.readable = true;
        try {
          const tx = db.transaction('probe', 'readwrite'); const store = tx.objectStore('probe'); store.put('ready', 'capability');
          const read = store.get('capability'); let verified = false;
          read.onsuccess = () => { verified = read.result === 'ready'; store.delete('capability'); };
          tx.oncomplete = () => { result.writable = verified && hasCrypto; finish(result.writable ? undefined : new Error('Required local write capabilities are unavailable')); };
          tx.onabort = () => finish(tx.error ?? new DOMException('aborted', 'AbortError'));
        } catch (error) { finish(error); }
      };
    } catch (error) { finish(error); }
  });
}
/** Invoke from an explicit user click only, never startup or an automatic save. */
export async function requestPersistence(storage: StorageLike = globalThis.navigator?.storage ?? {}): Promise<boolean> {
  try { return await storage.persist?.() ?? false; } catch { return false; }
}

/** This only requests browser download. A click is never proof the user saved the file. */
export function requestDownload(blob:Blob,filename:string):Result<void>{
  let url:string|null=null,anchor:HTMLAnchorElement|null=null;
  try{url=URL.createObjectURL(blob);anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.hidden=true;document.body.append(anchor);anchor.click();return {ok:true,value:undefined};}
  catch{return {ok:false,error:{code:'UNAVAILABLE',message:'无法请求下载。请保留数据并重试。'}};}
  finally{anchor?.remove();if(url){const owned=url;setTimeout(()=>{URL.revokeObjectURL(owned);},1000);}}
}
