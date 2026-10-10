import type { PersonalData } from '../domain/types.ts';

export const APP_VERSION = '0.1.0';
export const DATABASE_NAME = 'eatwhat-web';
export const SCHEMA_VERSION = 1;
export const STORE_NAMES = ['meta', 'preferences', 'draft', 'customRecipes', 'favorites', 'menuTemplates', 'plans', 'actualMeals', 'shoppingLists', 'trash'] as const;
export function initialPersonalData(): PersonalData {
  return {
    meta: { schemaVersion: 1, appVersion: APP_VERSION, revision: 0, lastSuccessfulWriteAt: null, lastBackupRequestedAt: null },
    preferences: { servings: 2, meal: 'dinner', slots: [{ id: 'meat-1', type: 'meat' }, { id: 'vegetable-1', type: 'vegetable' }], hardExclusions: [], softPreferences: [], revision: 0 },
    draft: null, customRecipes: [], favorites: [], menuTemplates: [], plans: [], actualMeals: [], shoppingLists: [], trash: [],
  };
}
interface IndexDescriptor {
  name: string;
  keyPath: string | string[];
  unique: boolean;
  multiEntry: boolean;
}
function storeDescriptor(name: typeof STORE_NAMES[number]): { keyPath: string | null; indexes: IndexDescriptor[] } {
  const indexes: IndexDescriptor[] = [
    { name: 'requestId', keyPath: 'requestId', unique: true, multiEntry: false },
  ];
  if (name === 'plans') {
    indexes.push({ name: 'dateMeal', keyPath: ['date', 'meal'], unique: true, multiEntry: false });
  }
  if (name === 'favorites') {
    indexes.push({ name: 'recipeId', keyPath: 'recipeId', unique: true, multiEntry: false });
  }
  return { keyPath: name === 'meta' || name === 'preferences' ? null : 'id', indexes };
}
function sameKeyPath(actual: string | string[] | null, expected: string | string[] | null): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
/** Descriptor inspection only: never repair or write an unsupported v1 layout. */
export function matchesV1Schema(database: IDBDatabase): boolean {
  if (database.objectStoreNames.length !== STORE_NAMES.length
    || STORE_NAMES.some((name) => !database.objectStoreNames.contains(name))) return false;
  try {
    const transaction = database.transaction([...STORE_NAMES], 'readonly');
    for (const name of STORE_NAMES) {
      const expected = storeDescriptor(name);
      const store = transaction.objectStore(name);
      if (!sameKeyPath(store.keyPath, expected.keyPath) || store.autoIncrement
        || store.indexNames.length !== expected.indexes.length) return false;
      for (const descriptor of expected.indexes) {
        if (!store.indexNames.contains(descriptor.name)) return false;
        const index = store.index(descriptor.name);
        if (!sameKeyPath(index.keyPath, descriptor.keyPath)
          || index.unique !== descriptor.unique || index.multiEntry !== descriptor.multiEntry) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
/** v1 only initializes a new database. No guessed old or destructive migrations. */
export function initializeV1(database: IDBDatabase, transaction: IDBTransaction, oldVersion: number): void {
  if (oldVersion !== 0) throw new Error('No migration from this schema is supported');
  for (const name of STORE_NAMES) {
    const descriptor = storeDescriptor(name);
    const store = database.createObjectStore(name, { keyPath: descriptor.keyPath, autoIncrement: false });
    for (const index of descriptor.indexes) {
      store.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
    }
  }
  const data = initialPersonalData();
  transaction.objectStore('meta').put(data.meta, 'current');
  transaction.objectStore('meta').put(0, 'epoch');
  transaction.objectStore('preferences').put(data.preferences, 'current');
}
