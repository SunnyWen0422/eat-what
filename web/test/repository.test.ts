import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRepository, type Repository, type Command } from '../src/data/repository.ts';
import { draft, FIXED_NOW, personalData, recipe } from './fixtures.ts';
import type { LocalDate, RecipeSnapshot, TimeZone } from '../src/domain/types.ts';

const snapshot = (): RecipeSnapshot => {
  const { meals: _m, reviewStatus: _r, generationEligible: _g, reviewedAt: _a, issues: _i, stepStatus: _s, servingsStatus: _v, familyIdentity: _f, mealEligibility: _e, ...value } = recipe();
  return value;
};
const plan = (id?: string): Extract<Command,{type:'savePlan'}> => ({ type: 'savePlan', expectedObjectRevision: id ? 1 : null, plan: { ...(id ? {id} : {}), date: '2026-10-09' as LocalDate, meal: 'dinner', servings: 2, snapshots: [snapshot()], timeZone: 'UTC' as TimeZone } });
const opened: Repository[] = [];
let sequence = 0;
async function setup(factory = new IDBFactory()) {
  sequence = 0; const result = await openRepository({ factory, now: () => FIXED_NOW, uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  opened.push(result.value); return { repo: result.value, factory };
}
afterEach(() => { opened.splice(0).forEach((repo) => repo.close()); vi.restoreAllMocks(); });

describe('atomic local repository', () => {
  it('reads the exact initial ten-store personal envelope', async () => {
    const { repo } = await setup(); expect(await repo.read()).toEqual({ ok: true, value: personalData() });
  });
  it('persists a plan with snapshot and revision but no actual meal', async () => {
    const { repo } = await setup();
    expect(await repo.commit(plan(), 0, 'request-1')).toEqual({ ok: true, value: { globalRevision: 1, objectId: '00000000-0000-4000-8000-000000000001', objectRevision: 1, replayed: false } });
    const read = await repo.read(); expect(read.ok).toBe(true);
    if (read.ok) { expect(read.value.plans[0]).toMatchObject({ id: '00000000-0000-4000-8000-000000000001', snapshots: [snapshot()], revision: 1 }); expect(read.value.actualMeals).toEqual([]); }
  });
  it('rejects duplicate date-meal and retains every existing value', async () => {
    const { repo } = await setup(); await repo.commit(plan(), 0, 'request-1'); const before = await repo.read();
    const failed = await repo.commit(plan(), 1, 'request-2'); expect(failed).toMatchObject({ ok: false, error: { code: 'DUPLICATE' } }); expect(await repo.read()).toEqual(before);
  });
  it('replays same request once before stale revision checking and rejects changed payload', async () => {
    const { repo } = await setup(); const first = await repo.commit(plan(), 0, 'request-1');
    expect(await repo.commit(plan(), 0, 'request-1')).toEqual({ ok: true, value: { globalRevision: 1, objectId: '00000000-0000-4000-8000-000000000001', objectRevision: 1, replayed: true } });
    expect(await repo.commit({ ...plan(), plan: { ...(plan() as Extract<Command,{type:'savePlan'}>).plan, servings: 3 } }, 0, 'request-1')).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(first.ok).toBe(true); const read = await repo.read(); if (read.ok) expect(read.value.meta.revision).toBe(1);
  });
  it('rejects stale global and object revisions without overwriting', async () => {
    const { repo } = await setup(); await repo.commit(plan(), 0, 'one'); const before = await repo.read();
    expect(await repo.commit(plan(), 0, 'two')).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    const command = plan('00000000-0000-4000-8000-000000000001'); if (command.type === 'savePlan') command.expectedObjectRevision = 0;
    expect(await repo.commit(command, 1, 'three')).toMatchObject({ ok: false, error: { code: 'CONFLICT' } }); expect(await repo.read()).toEqual(before);
  });
  it('atomically rolls back an injected abort after scheduling object writes', async () => {
    const { repo } = await setup(); await repo.commit(plan(), 0, 'one'); const before = await repo.read();
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      const result = original.apply(this, args); if (this.name === 'meta') this.transaction.abort(); return result;
    });
    expect(await repo.commit({ type: 'saveDraft', draft: draft() }, 1, 'abort')).toMatchObject({ ok: false, error: { code: 'ABORTED' } });
    expect(await repo.read()).toEqual(before);
  });
  it('atomically rolls back quota errors and never removes history to make space', async () => {
    const { repo } = await setup(); await repo.commit(plan(), 0, 'one'); const before = await repo.read();
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'draft') throw new DOMException('full', 'QuotaExceededError'); return original.apply(this, args);
    });
    expect(await repo.commit({ type: 'saveDraft', draft: draft() }, 1, 'quota')).toMatchObject({ ok: false, error: { code: 'QUOTA' } }); expect(await repo.read()).toEqual(before);
  });
  it('reports success and emits subscriptions only after transaction completion', async () => {
    const { repo } = await setup(); const listener = vi.fn(); repo.subscribe(listener);
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      expect(listener).not.toHaveBeenCalled(); return original.apply(this, args);
    });
    const pending = repo.commit(plan(), 0, 'one'); expect(listener).not.toHaveBeenCalled(); await pending; expect(listener).toHaveBeenCalledWith(1);
  });
  it('rejects unknown fields and overlimit strings before mutating data', async () => {
    const { repo } = await setup(); const before = await repo.read();
    expect(await repo.commit({ ...plan(), externalUrl: 'https://example.test' } as unknown as Command, 0, 'unknown')).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    const command = plan(); if (command.type === 'savePlan') command.plan.snapshots[0]!.name = 'x'.repeat(20001);
    expect(await repo.commit(command, 0, 'limit')).toMatchObject({ ok: false, error: { code: 'LIMIT' } }); expect(await repo.read()).toEqual(before);
  });
  it('serializes two concurrent tabs and rejects the stale writer', async () => {
    const { factory, repo } = await setup(); const { repo: second } = await setup(factory);
    const results = await Promise.all([repo.commit(plan(), 0, 'one'), second.commit({ type: 'saveDraft', draft: draft() }, 0, 'two')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1); expect(results.filter((r) => !r.ok)).toMatchObject([{ ok: false, error: { code: 'CONFLICT' } }]);
  });
});

describe('durable operation metadata and schema lifecycle', () => {
  it('replays a singleton save after later singleton rewrites and survives reopening', async () => {
    const { repo, factory } = await setup(); const original = { type: 'saveDraft', draft: draft() } as const;
    await repo.commit(original, 0, 'first'); await repo.commit({ type: 'saveDraft', draft: draft({ servings: 3 }) }, 1, 'second');
    repo.close(); const reopened = await setup(factory);
    expect(await reopened.repo.commit(original, 0, 'first')).toMatchObject({ ok: true, value: { globalRevision: 1, replayed: true } });
    const read = await reopened.repo.read(); if (read.ok) { expect(read.value.draft?.servings).toBe(3); expect(read.value.meta.revision).toBe(2); }
    const raw = await reopened.repo.readRawSnapshot(); expect(raw.ok).toBe(true);
    if (raw.ok) { const meta = raw.value.stores.find((store) => store.name === 'meta')!; const receipt = meta.entries.find((entry) => entry.key === 'request:first')!.value;
      expect(receipt).toMatchObject({ requestId: 'first', epoch: 0, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }); expect(receipt).not.toHaveProperty('draft'); }
  });
  it('bounds the journal and rejects an evicted old request at its original stale revision', async () => {
    const { repo } = await setup();
    for (let revision = 0; revision < 258; revision++) expect((await repo.commit({ type: 'savePreferences', preferences: personalData().preferences }, revision, `request-${revision}`)).ok).toBe(true);
    const before = await repo.read();
    expect(await repo.commit({ type: 'savePreferences', preferences: personalData().preferences }, 0, 'request-0')).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(await repo.read()).toEqual(before); const raw = await repo.readRawSnapshot(); if (raw.ok) expect(raw.value.stores.find((s) => s.name === 'meta')!.entries.filter((e) => typeof e.key === 'string' && e.key.startsWith('request:'))).toHaveLength(256);
  });
  it('closes on versionchange so a newer schema can open, with unknown stores and key types retained raw', async () => {
    const { repo, factory } = await setup(); await repo.commit(plan(), 0, 'one');
    const request = factory.open('eatwhat-web', 2);
    request.onupgradeneeded = () => { request.result.createObjectStore('future').put({ unknown: true }, ['nested-key', 7]); };
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); db.close();
    expect(repo.status().writable).toBe(false);
    const { repo: next } = await setup(factory); expect(next.status()).toMatchObject({ schemaVersion: 2, readable: true, writable: false, reason: 'NEWER_SCHEMA' });
    expect(await next.read()).toMatchObject({ ok: false, error: { code: 'NEWER_SCHEMA' } });
    expect(await next.commit(plan(), 1, 'two')).toMatchObject({ ok: false, error: { code: 'NEWER_SCHEMA' } });
    expect(await next.readRawSnapshot()).toMatchObject({ ok: true, value: { version: 2, stores: expect.arrayContaining([{ name: 'future', entries: [{ key: ['nested-key', 7], value: { unknown: true } }] }]) } });
  });
  it('rolls back an aborted v1 initialization and creates no partial stores', async () => {
    const factory = new IDBFactory(); const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) { const request = original.apply(this, args); this.transaction.abort(); return request; });
    expect(await openRepository({ factory, now: () => FIXED_NOW, uuid: () => 'unused' })).toMatchObject({ ok: false, error: { code: 'ABORTED' } });
    spy.mockRestore(); expect((await factory.databases()).some((db) => db.name === 'eatwhat-web')).toBe(false); await setup(factory);
  });
  it('reports blocked opens rather than waiting indefinitely or deleting an old database', async () => {
    const { repo, factory } = await setup(); repo.close();
    const old = factory.open('eatwhat-web', 1); const db = await new Promise<IDBDatabase>((ok) => { old.onsuccess = () => ok(old.result); }); db.onversionchange = () => {};
    const original = factory.open.bind(factory); const spy = vi.spyOn(factory, 'open').mockImplementation((name) => original(name, 2));
    const deleted = vi.spyOn(factory, 'deleteDatabase');
    const result = await openRepository({ factory, now: () => FIXED_NOW, uuid: () => 'unused' });
    expect(result).toMatchObject({ ok: false, error: { code: 'BLOCKED' } }); expect(deleted).not.toHaveBeenCalled(); db.close(); spy.mockRestore();
  });
});

describe('strict validation and limits', () => {
  it('updates an existing plan only with its matching object revision', async () => {
    const { repo } = await setup(); await repo.commit(plan(), 0, 'create'); const command = plan('00000000-0000-4000-8000-000000000001'); command.plan.servings = 3;
    expect(await repo.commit(command, 1, 'update')).toMatchObject({ ok: true, value: { globalRevision: 2, objectRevision: 2 } });
    const read = await repo.read(); if (read.ok) { expect(read.value.plans).toHaveLength(1); expect(read.value.plans[0]).toMatchObject({ servings: 3, createdAt: FIXED_NOW.toISOString() }); }
  });
  it('rejects extra catalog authority flags and dangerous keys instead of persisting them', async () => {
    const { repo } = await setup(); const command = plan(); command.plan.snapshots = [recipe()];
    expect(await repo.commit(command, 0, 'review-flags')).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    expect(await repo.commit(JSON.parse('{"type":"saveDraft","draft":{"__proto__":{}}}') as Command, 0, 'poison')).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    expect(await repo.read()).toEqual({ ok: true, value: personalData() });
  });
  it('rejects a normally written candidate above the 20 MiB total limit', async () => {
    const { repo } = await setup(); const before = await repo.read(); const command = plan();
    command.plan.snapshots = Array.from({ length: 20 }, (_, index) => ({ ...snapshot(), recipeId: `large-${index}`, steps: Array.from({ length: 60 }, () => 'x'.repeat(20000)) }));
    expect(await repo.commit(command, 0, 'bytes')).toMatchObject({ ok: false, error: { code: 'LIMIT' } }); expect(await repo.read()).toEqual(before);
  });
  it('blocks malformed operation metadata rather than returning a fabricated replay', async () => {
    const { repo, factory } = await setup(); const request = factory.open('eatwhat-web');
    const db = await new Promise<IDBDatabase>((ok) => { request.onsuccess = () => ok(request.result); });
    const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ requestId: 'corrupt', fingerprint: 'bad', receipt: null, epoch: 0 }, 'request:corrupt');
    await new Promise((ok) => { tx.oncomplete = ok; }); db.close();
    expect(await repo.commit(plan(), 0, 'fresh')).toMatchObject({ ok: false, error: { code: 'INVALID' } });
  });
  it('keeps raw export available for malformed v1 layouts while read and commit return Result errors', async () => {
    const factory = new IDBFactory(); const request = factory.open('eatwhat-web', 1); request.onupgradeneeded = () => { request.result.createObjectStore('meta').put({ keep: true }, 'unknown'); };
    const db = await new Promise<IDBDatabase>((ok) => { request.onsuccess = () => ok(request.result); }); db.close(); const { repo } = await setup(factory);
    expect(repo.status().writable).toBe(false); expect(await repo.read()).toMatchObject({ ok: false, error: { code: 'INVALID' } }); expect(await repo.commit(plan(), 0, 'blocked')).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    expect(await repo.readRawSnapshot()).toMatchObject({ ok: true, value: { stores: [{ name: 'meta', entries: [{ key: 'unknown', value: { keep: true } }] }] } });
  });
});

describe('fallback notifications and record budgets', () => {
  it('reads the latest revision on focus when BroadcastChannel is unavailable', async () => {
    vi.stubGlobal('BroadcastChannel', undefined); const windowTarget = new EventTarget(); vi.stubGlobal('window', windowTarget);
    try {
      const { repo, factory } = await setup(); const { repo: second } = await setup(factory); const listener = vi.fn(); repo.subscribe(listener);
      await second.commit(plan(), 0, 'other-tab'); expect(listener).not.toHaveBeenCalled(); windowTarget.dispatchEvent(new Event('focus'));
      await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(1));
    } finally { opened.forEach((repo) => repo.close()); vi.unstubAllGlobals(); }
  });
  it('refuses the 20,001st main record without dropping the existing 19,999 plans', async () => {
    const { repo, factory } = await setup(); const request = factory.open('eatwhat-web'); const db = await new Promise<IDBDatabase>((ok) => { request.onsuccess = () => ok(request.result); });
    const tx = db.transaction('plans', 'readwrite');
    for (let index = 0; index < 19999; index++) {
      const date = new Date(Date.UTC(2000, 0, index + 1)).toISOString().slice(0, 10) as LocalDate;
      tx.objectStore('plans').put({ id: `00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`, date, meal: 'dinner', servings: 2, snapshots: [snapshot()], timeZone: 'UTC', createdAt: FIXED_NOW.toISOString(), updatedAt: FIXED_NOW.toISOString(), revision: 1, requestId: `seed-${index}` });
    }
    await new Promise((ok) => { tx.oncomplete = ok; }); db.close();
    const before = await repo.read(); expect(before.ok).toBe(true);
    expect(await repo.commit({ type: 'saveDraft', draft: draft() }, 0, 'over-record-limit')).toMatchObject({ ok: false, error: { code: 'LIMIT' } });
    expect(await repo.read()).toEqual(before);
  }, 30_000);
});

it('rejects a receipt from a later revision instead of fabricating a successful replay', async () => {
  const { repo, factory } = await setup(); await repo.commit(plan(), 0, 'one');
  const request = factory.open('eatwhat-web'); const db = await new Promise<IDBDatabase>((ok) => { request.onsuccess = () => ok(request.result); });
  const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(personalData().meta,'current'); await new Promise((ok) => {tx.oncomplete=ok;});db.close();
  expect(await repo.commit(plan(),0,'one')).toMatchObject({ok:false,error:{code:'INVALID'}});
});

describe('complete v1 schema descriptor safety', () => {
  async function malformedLayout(change: (db: IDBDatabase, tx: IDBTransaction) => void) {
    const { initializeV1 } = await import('../src/data/migrations.ts');
    const factory = new IDBFactory();
    const request = factory.open('eatwhat-web', 1);
    request.onupgradeneeded = () => {
      initializeV1(request.result, request.transaction!, 0);
      change(request.result, request.transaction!);
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return setup(factory);
  }

  it('rejects date-keyed plans before dinner and lunch can overwrite each other', async () => {
    const { repo } = await malformedLayout((db) => {
      db.deleteObjectStore('plans');
      const plans = db.createObjectStore('plans', { keyPath: 'date' });
      plans.createIndex('requestId', 'requestId', { unique: true });
      plans.createIndex('dateMeal', ['date', 'meal'], { unique: true });
    });
    const before = await repo.readRawSnapshot();
    expect(repo.status()).toMatchObject({ writable: false, reason: 'INVALID' });
    expect(await repo.read()).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    expect(await repo.commit(plan(), 0, 'dinner')).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    const lunch = plan(); lunch.plan.meal = 'lunch';
    expect(await repo.commit(lunch, 1, 'lunch')).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    expect(await repo.readRawSnapshot()).toEqual(before);
  });

  it.each([
    { name: 'wrong requestId key path', keyPath: 'id', options: { unique: true } },
    { name: 'nonunique requestId index', keyPath: 'requestId', options: { unique: false } },
    { name: 'multi-entry requestId index', keyPath: 'requestId', options: { unique: true, multiEntry: true } },
  ])('rejects $name while preserving raw values', async ({ keyPath, options }) => {
    const { repo } = await malformedLayout((_db, tx) => {
      const meta = tx.objectStore('meta');
      meta.deleteIndex('requestId');
      meta.createIndex('requestId', keyPath, options);
    });
    const before = await repo.readRawSnapshot();
    expect(repo.status()).toMatchObject({ writable: false, reason: 'INVALID' });
    expect(await repo.commit(plan(), 0, 'no-write')).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    expect(await repo.readRawSnapshot()).toEqual(before);
  });

  it.each(['autoIncrement', 'extraIndex', 'dateMealOrder', 'favoritesRecipeKey'] as const)('rejects unsupported descriptor %s without repairs', async (variant) => {
    const { repo } = await malformedLayout((db, tx) => {
      if (variant === 'autoIncrement') {
        db.deleteObjectStore('plans');
        const store = db.createObjectStore('plans', { keyPath: 'id', autoIncrement: true });
        store.createIndex('requestId', 'requestId', { unique: true });
        store.createIndex('dateMeal', ['date', 'meal'], { unique: true });
      } else if (variant === 'extraIndex') {
        tx.objectStore('draft').createIndex('unrecognized-index', 'revision');
      } else if (variant === 'dateMealOrder') {
        const store = tx.objectStore('plans'); store.deleteIndex('dateMeal'); store.createIndex('dateMeal', ['meal', 'date'], { unique: true });
      } else {
        const store = tx.objectStore('favorites'); store.deleteIndex('recipeId'); store.createIndex('recipeId', 'id', { unique: true });
      }
    });
    const before = await repo.readRawSnapshot();
    expect(repo.status()).toMatchObject({ writable: false, reason: 'INVALID' });
    expect(await repo.commit(plan(), 0, 'no-write')).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    expect(await repo.readRawSnapshot()).toEqual(before);
  });
});

describe('atomic meal settings command', () => {
  const settings = () => ({ type: 'saveSettings', draft: draft({ servings: 9, countsConfirmed: false }), preferences: { ...personalData().preferences, servings: 9 } } as unknown as Command);
  it('persists matching preferences and unconfirmed group draft in one revision, then replays once', async () => {
    const { repo } = await setup(); const command = settings(); const saved = await repo.commit(command, 0, 'settings-1');
    expect(saved).toMatchObject({ ok: true, value: { globalRevision: 1, objectId: 'current', objectRevision: 1 } });
    const read = await repo.read(); expect(read.ok).toBe(true); if (read.ok) { expect(read.value.draft).toMatchObject({ servings: 9, countsConfirmed: false, revision: 1 }); expect(read.value.preferences).toMatchObject({ servings: 9, revision: 1 }); }
    expect(await repo.commit(command, 0, 'settings-1')).toMatchObject({ ok: true, value: { replayed: true, globalRevision: 1 } });
    const changed = settings(); if (changed.type === 'saveSettings') changed.preferences.softPreferences = ['vegetarian'];
    expect(await repo.commit(changed, 1, 'settings-1')).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });
  it('rolls back both records if writing the second record aborts', async () => {
    const { repo } = await setup(); const before = await repo.read(); const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'preferences') throw new DOMException('full', 'QuotaExceededError'); return original.apply(this, args);
    });
    expect(await repo.commit(settings(), 0, 'settings-full')).toMatchObject({ ok: false, error: { code: 'QUOTA' } }); expect(await repo.read()).toEqual(before);
  });
  it('rejects mismatched settings and unknown fields without modifying either record', async () => {
    const { repo } = await setup(); const before = await repo.read(); const command = settings(); if (command.type === 'saveSettings') command.preferences.servings = 10;
    expect(await repo.commit(command, 0, 'invalid-settings')).toMatchObject({ ok: false, error: { code: 'INVALID' } }); expect(await repo.read()).toEqual(before);
    expect(await repo.commit({ ...settings(), unexpected: true } as unknown as Command, 0, 'extra-settings')).toMatchObject({ ok: false, error: { code: 'INVALID' } }); expect(await repo.read()).toEqual(before);
  });
});
