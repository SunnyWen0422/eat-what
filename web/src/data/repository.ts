import type { ActualMealInput, CustomRecipeInput, ErrorCode, LocalDate, Meal, MealDraft, MenuTemplateInput, PersonalData, PersonalStore, PlanInput, RecipeSnapshot, Result, ShoppingListEditInput, TimeZone, TrashEntry, UtcIso } from '../domain/types.ts';
import { exactKeys, isActualMealInput, isCustomRecipeInput, isInteger, isMealDraft, isMenuTemplateInput, isPlanInput, isPreferences, isShoppingListInput, sameShoppingFacts, isRecipeSnapshot, isText, isTimeZone, isUuid, MEAL_VALUES, TRASH_LIFETIME_MS, validateJsonBoundary, validatePersonalData } from '../domain/validation.ts';
import { DATABASE_NAME, initializeV1, matchesV1Schema, SCHEMA_VERSION, STORE_NAMES, initialPersonalData } from './migrations.ts';
import { isLocalDate, isUtcIso, localDate } from '../domain/dates.ts';
import { restoreTrash } from '../history/records.ts';

export type Command = { type: 'saveSettings'; draft: MealDraft; preferences: PersonalData['preferences'] } | { type: 'saveDraft'; draft: MealDraft } | { type: 'savePreferences'; preferences: PersonalData['preferences'] }
  | { type: 'savePlan'; plan: PlanInput; expectedObjectRevision: number | null }
  | { type: 'saveActual'; actual: ActualMealInput; expectedObjectRevision: number | null; allowAdditional: boolean }
  | { type: 'saveCustomRecipe'; recipe: CustomRecipeInput; expectedObjectRevision: number | null }
  | { type: 'saveFavorite'; snapshot: RecipeSnapshot }
  | { type: 'saveTemplate'; template: MenuTemplateInput; expectedObjectRevision: number | null }
  | { type: 'saveShoppingList'; list: ShoppingListEditInput; expectedObjectRevision: number | null }
  | { type: 'deleteObject'; store: PersonalStore; id: string; expectedObjectRevision: number }
  | { type: 'restoreTrash'; id: string; expectedObjectRevision: number; target?: {date:LocalDate;meal:Meal} }
  | { type: 'replaceAll'; data: PersonalData } | { type: 'markBackupRequested'; requestedAt: UtcIso }
  | { type: 'expireTrash' } | { type: 'clearAll' };
/** saveSettings reports the draft object revision; preferences advances its own revision in the same transaction. */
export interface CommitReceipt { globalRevision: number; objectId: string | null; objectRevision: number | null; replayed: boolean }
export interface RepositoryStatus { readable: boolean; writable: boolean; schemaVersion: number; reason: ErrorCode | null }
export interface RawSnapshot { databaseName: string; version: number; stores: { name: string; entries: { key: IDBValidKey; value: unknown }[] }[] }
export interface Repository {
  read(): Promise<Result<PersonalData>>;
  commit(command: Command, expectedGlobalRevision: number, requestId: string): Promise<Result<CommitReceipt>>;
  subscribe(listener: (revision: number) => void): () => void;
  status(): RepositoryStatus;
  readRawSnapshot(): Promise<Result<RawSnapshot>>;
  close(): void;
}
interface JournalEntry { requestId: string; fingerprint: string; receipt: CommitReceipt; epoch: number }
export const REQUEST_JOURNAL_LIMIT = 256;
function validJournalEntry(value: unknown): value is JournalEntry {
  return exactKeys(value, ['requestId', 'fingerprint', 'receipt', 'epoch']) && isText(value.requestId)
    && typeof value.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(value.fingerprint) && isInteger(value.epoch)
    && exactKeys(value.receipt, ['globalRevision', 'objectId', 'objectRevision', 'replayed']) && isInteger(value.receipt.globalRevision, 1)
    && (value.receipt.objectId === null || isText(value.receipt.objectId)) && (value.receipt.objectRevision === null || isInteger(value.receipt.objectRevision, 1)) && value.receipt.replayed === false;
}

const failure = <T>(code: ErrorCode, message: string): Result<T> => ({ ok: false, error: { code, message } });
function errorResult<T>(error: unknown): Result<T> {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  return failure(name === 'QuotaExceededError' ? 'QUOTA' : name === 'ConstraintError' ? 'DUPLICATE' : name === 'AbortError' || name === 'TransactionInactiveError' || name === 'InvalidStateError' ? 'ABORTED' : 'UNAVAILABLE', name || 'Local storage is unavailable');
}
function validateCommand(command: unknown): Result<Command> {
  const boundary = validateJsonBoundary(command); if (!boundary.ok) return boundary;
  if (exactKeys(command, ['type', 'draft', 'preferences']) && command.type === 'saveSettings' && isMealDraft(command.draft) && isPreferences(command.preferences)
    && command.draft.servings === command.preferences.servings && command.draft.meal === command.preferences.meal && canonical(command.draft.slots) === canonical(command.preferences.slots)) return { ok: true, value: command as Command };
  if (exactKeys(command, ['type', 'draft']) && command.type === 'saveDraft' && isMealDraft(command.draft)) return { ok: true, value: command as Command };
  if (exactKeys(command, ['type', 'preferences']) && command.type === 'savePreferences' && isPreferences(command.preferences)) return { ok: true, value: command as Command };
  if (exactKeys(command, ['type', 'plan', 'expectedObjectRevision']) && command.type === 'savePlan' && isPlanInput(command.plan)
    && (command.expectedObjectRevision === null ? !Object.hasOwn(command.plan, 'id') : isInteger(command.expectedObjectRevision) && Object.hasOwn(command.plan, 'id'))) return { ok: true, value: command as Command };
  const revisionMatches = (input: {id?:string}, revision:unknown) => revision===null ? !Object.hasOwn(input,'id') : isInteger(revision,1)&&Object.hasOwn(input,'id');
  if(exactKeys(command,['type','actual','expectedObjectRevision','allowAdditional'])&&command.type==='saveActual'&&isActualMealInput(command.actual)&&revisionMatches(command.actual,command.expectedObjectRevision)&&typeof command.allowAdditional==='boolean')return {ok:true,value:command as Command};
  if(exactKeys(command,['type','recipe','expectedObjectRevision'])&&command.type==='saveCustomRecipe'&&isCustomRecipeInput(command.recipe)&&revisionMatches(command.recipe,command.expectedObjectRevision))return {ok:true,value:command as Command};
  if(exactKeys(command,['type','snapshot'])&&command.type==='saveFavorite'&&isRecipeSnapshot(command.snapshot))return {ok:true,value:command as Command};
  if(exactKeys(command,['type','template','expectedObjectRevision'])&&command.type==='saveTemplate'&&isMenuTemplateInput(command.template)&&revisionMatches(command.template,command.expectedObjectRevision))return {ok:true,value:command as Command};
  if(exactKeys(command,['type','list','expectedObjectRevision'])&&command.type==='saveShoppingList'&&isShoppingListInput(command.list)&&revisionMatches(command.list,command.expectedObjectRevision))return {ok:true,value:command as Command};
  if(exactKeys(command,['type','store','id','expectedObjectRevision'])&&command.type==='deleteObject'&&['customRecipes','favorites','menuTemplates','plans','actualMeals','shoppingLists'].includes(command.store as string)&&isUuid(command.id)&&isInteger(command.expectedObjectRevision,1))return {ok:true,value:command as Command};
  if(exactKeys(command,['type','id','expectedObjectRevision',...(typeof command==='object'&&command!==null&&Object.hasOwn(command,'target')?['target']:[])])&&command.type==='restoreTrash'&&isUuid(command.id)&&isInteger(command.expectedObjectRevision,1)&&(!Object.hasOwn(command,'target')||exactKeys(command.target,['date','meal'])&&isLocalDate(command.target.date)&&MEAL_VALUES.includes(command.target.meal as Meal)))return {ok:true,value:command as Command};
  if(exactKeys(command,['type','data'])&&command.type==='replaceAll'){const valid=validatePersonalData(command.data);return valid.ok?{ok:true,value:{type:'replaceAll',data:valid.value}}:valid;}
  if(exactKeys(command,['type','requestedAt'])&&command.type==='markBackupRequested'&&isUtcIso(command.requestedAt))return {ok:true,value:command as Command};
  if(exactKeys(command,['type'])&&['expireTrash','clearAll'].includes(command.type as string))return {ok:true,value:command as Command};
  return failure('INVALID', 'Unsupported or invalid local command');
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
async function fingerprint(command: Command): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(command)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
/** Requests are queued together; callback runs inside the last IDB success task, with no await. */
function readDomain(transaction: IDBTransaction, done: (data: unknown, journal: JournalEntry[], epoch: number) => void): void {
  const data: Record<string, unknown> = {}; let remaining = STORE_NAMES.length + 2; let journal: JournalEntry[] = []; let epoch = 0;
  const complete = () => { if (--remaining === 0) done(data, journal, epoch); };
  for (const name of STORE_NAMES) {
    const store = transaction.objectStore(name); const request = name === 'meta' || name === 'preferences' ? store.get('current') : name === 'draft' ? store.get('current') : store.getAll();
    request.onsuccess = () => { data[name] = name === 'draft' ? request.result ?? null : request.result; complete(); };
  }
  const requests = transaction.objectStore('meta').index('requestId').getAll();
  requests.onsuccess = () => { journal = requests.result as JournalEntry[]; complete(); };
  const epochRequest = transaction.objectStore('meta').get('epoch');
  epochRequest.onsuccess = () => { epoch = epochRequest.result ?? 0; complete(); };
}

export async function openRepository(options: { factory: IDBFactory; now: () => Date; uuid: () => string; currentTimeZone?: () => TimeZone }): Promise<Result<Repository>> {
  function open(version?: number): Promise<Result<IDBDatabase>> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: Result<IDBDatabase>) => { if (!settled) { settled = true; resolve(result); } };
      let request: IDBOpenDBRequest;
      try { request = version === undefined ? options.factory.open(DATABASE_NAME) : options.factory.open(DATABASE_NAME, version); }
      catch (error) { finish(errorResult(error)); return; }
      request.onupgradeneeded = (event) => {
        try { initializeV1(request.result, request.transaction!, event.oldVersion); }
        catch { request.transaction?.abort(); }
      };
      request.onblocked = () => finish(failure('BLOCKED', 'Close the old tab and retry; the database will not be cleared'));
      request.onerror = () => finish(request.error?.name === 'VersionError' ? failure('NEWER_SCHEMA', 'A newer local schema is installed') : errorResult(request.error));
      request.onsuccess = () => { if (settled) request.result.close(); else finish({ ok: true, value: request.result }); };
    });
  }
  let opened = await open(SCHEMA_VERSION);
  if (!opened.ok && opened.error.code === 'NEWER_SCHEMA') opened = await open();
  if (!opened.ok) return opened;
  const db = opened.value;
  const newer = db.version > SCHEMA_VERSION;
  const invalidLayout = !newer && !matchesV1Schema(db);
  let closed = false;
  let cleanupFailure: {code:ErrorCode;message:string}|null = null;
  let lastRevision = 0;
  const listeners = new Set<(revision: number) => void>();
  let channel: BroadcastChannel | null = null;
  try { if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(`${DATABASE_NAME}:revision`); } catch { /* Focus fallback below. */ }
  function emit(revision: number): void { lastRevision = revision; for (const listener of listeners) { try { listener(revision); } catch { /* Listener errors cannot invalidate committed storage. */ } } }
  const unavailable = <T>(): Result<T> => failure(newer ? 'NEWER_SCHEMA' : invalidLayout ? 'INVALID' : 'UNAVAILABLE', newer ? 'Newer schema is read-only. Keep a raw export before using a newer app.' : invalidLayout ? 'Unsupported v1 layout. Preserve the raw data before repairing it.' : 'The database connection is closed. Reload to reopen.');
  async function read(): Promise<Result<PersonalData>> {
    if (closed || newer || invalidLayout) return unavailable();
    return new Promise((resolve) => {
      let result: Result<PersonalData> = failure('ABORTED', 'Read transaction aborted');
      let tx: IDBTransaction;
      try { tx = db.transaction([...STORE_NAMES], 'readonly'); }
      catch (error) { resolve(errorResult(error)); return; }
      readDomain(tx, (data) => { result = validatePersonalData(data); });
      tx.oncomplete = () => { if (result.ok) lastRevision = result.value.meta.revision; resolve(result); };
      tx.onabort = () => resolve(errorResult(tx.error ?? new DOMException('Read aborted', 'AbortError')));
    });
  }
  async function raw(): Promise<Result<RawSnapshot>> {
    if (closed) return unavailable();
    return new Promise((resolve) => {
      const snapshot: RawSnapshot = { databaseName: DATABASE_NAME, version: db.version, stores: [] };
      let tx: IDBTransaction;
      try { tx = db.transaction(Array.from(db.objectStoreNames), 'readonly'); }
      catch (error) { resolve(errorResult(error)); return; }
      for (const name of Array.from(db.objectStoreNames)) {
        const entries: RawSnapshot['stores'][number]['entries'] = []; snapshot.stores.push({ name, entries });
        const request = tx.objectStore(name).openCursor();
        request.onsuccess = () => { const cursor = request.result; if (cursor) { entries.push({ key: cursor.key, value: cursor.value as unknown }); cursor.continue(); } };
      }
      tx.oncomplete = () => resolve({ ok: true, value: snapshot });
      tx.onabort = () => resolve(errorResult(tx.error ?? new DOMException('Read aborted', 'AbortError')));
    });
  }
  /** Current date context is a runtime dependency, separate from immutable creation metadata. */
  function currentToday(timestamp:UtcIso):Result<LocalDate>{
    let zone:unknown;
    try{zone=options.currentTimeZone?options.currentTimeZone():Intl.DateTimeFormat().resolvedOptions().timeZone;}
    catch{return failure('UNAVAILABLE','Current timezone unavailable; input is preserved');}
    if(!isTimeZone(zone))return failure('INVALID','Invalid current timezone');
    try{return {ok:true,value:localDate(new Date(timestamp),zone as TimeZone)};}
    catch{return failure('INVALID','Invalid current date context');}
  }
  async function commit(input: Command, expectedRevision: number, requestId: string): Promise<Result<CommitReceipt>> {
    if (closed || newer || invalidLayout) return unavailable();
    if(cleanupFailure)return {ok:false,error:{...cleanupFailure,message:'Opening trash cleanup failed. Data remains readable and unchanged. Reopen to retry before saving.'}};
    const validation = validateCommand(input); if (!validation.ok) return validation;
    if (!isInteger(expectedRevision) || !isText(requestId)) return failure('INVALID', 'Invalid revision or request ID');
    // Clone before the asynchronous hash; callers cannot mutate the validated command mid-save.
    const command = structuredClone(validation.value); let hash: string; let timestamp: UtcIso; let generatedId: string | null = null;
    try { hash = await fingerprint(command); timestamp = options.now().toISOString() as UtcIso; if (command.type === 'deleteObject' || command.type==='saveFavorite' || ['savePlan','saveActual','saveCustomRecipe','saveTemplate','saveShoppingList'].includes(command.type) && 'expectedObjectRevision' in command && command.expectedObjectRevision===null) generatedId = options.uuid(); }
    catch (error) { return errorResult(error); }
    if (closed) return unavailable();
    return new Promise((resolve) => {
      let result: Result<CommitReceipt> = failure('ABORTED', 'Write transaction aborted'); let changed = false;
      let tx: IDBTransaction;
      try { tx = db.transaction([...STORE_NAMES], 'readwrite'); }
      catch (error) { resolve(errorResult(error)); return; }
      const stop = (failureResult: Result<CommitReceipt>) => { result = failureResult; try { tx.abort(); } catch { /* Already aborted. */ } };
      readDomain(tx, (unknownData, journal, epoch) => {
        try {
          const current = validatePersonalData(unknownData); if (!current.ok) { stop(current); return; }
          const data = current.value;
          if (!isInteger(epoch) || !Array.isArray(journal) || journal.length > REQUEST_JOURNAL_LIMIT || !journal.every(validJournalEntry)
            || journal.some((entry) => entry.epoch !== epoch || entry.receipt.globalRevision > data.meta.revision)) { stop(failure('INVALID', 'Invalid operation metadata. Preserve a raw export.')); return; }
          // Domain integrity first, then idempotency before checking the caller's stale revision.
          const replay = journal.find((item) => item.requestId === requestId);
          if (replay) { if (replay.fingerprint !== hash) stop(failure('CONFLICT', 'Request ID was already used for different content')); else result = { ok: true, value: { ...replay.receipt, replayed: true } }; return; }
          if (data.meta.revision !== expectedRevision) { stop(failure('CONFLICT', 'Another page changed the data. Keep your edits and review the latest content.')); return; }
          const beforeData = structuredClone(data);
          let objectId: string|null = null; let objectRevision: number|null = null; let nextEpoch = epoch;
          const conflict = () => stop(failure('CONFLICT','The object changed. Keep your edits and review the latest version.'));
          if (command.type === 'saveDraft' || command.type === 'saveSettings') {
            objectId = 'current'; objectRevision = (data.draft?.revision ?? 0) + 1;
            data.draft = { ...command.draft, updatedAt: timestamp, revision: objectRevision, requestId };
            if (command.type === 'saveSettings') data.preferences = { ...command.preferences, revision: data.preferences.revision + 1, requestId };
          } else if (command.type === 'savePreferences') {
            objectId = 'current'; objectRevision = data.preferences.revision + 1;
            data.preferences = { ...command.preferences, revision: objectRevision, requestId };
          } else if(command.type==='savePlan' || command.type==='saveActual' || command.type==='saveCustomRecipe' || command.type==='saveTemplate') {
            const store = command.type==='savePlan'?'plans':command.type==='saveActual'?'actualMeals':command.type==='saveCustomRecipe'?'customRecipes':'menuTemplates';
            const input = command.type==='savePlan'?command.plan:command.type==='saveActual'?command.actual:command.type==='saveCustomRecipe'?command.recipe:command.template;
            const existing = input.id ? data[store].find(row=>row.id===input.id) : undefined;
            if(command.expectedObjectRevision!==null&&(!existing||existing.revision!==command.expectedObjectRevision)){conflict();return;}
            objectId = input.id ?? generatedId!; objectRevision = (existing?.revision??0)+1;
            if(!existing&&data[store].some(row=>row.id===objectId)){stop(failure('DUPLICATE','Generated object identity is already in use'));return;}
            const common = {id:objectId,createdAt:existing?.createdAt??timestamp,updatedAt:timestamp,revision:objectRevision,requestId};
            if(command.type==='savePlan') {
              if(data.plans.some(p=>p.id!==objectId&&p.date===command.plan.date&&p.meal===command.plan.meal)){stop(failure('DUPLICATE','A plan already exists for this date and meal'));return;}
              const timeZone=existing&&'timeZone' in existing?existing.timeZone:command.plan.timeZone;
              data.plans=[...data.plans.filter(p=>p.id!==objectId),{...command.plan,...common,timeZone}];
            } else if(command.type==='saveActual') {
              const today=currentToday(timestamp);if(!today.ok){stop(today);return;}
              if(command.actual.date>today.value){stop(failure('FUTURE_DATE','Future dates can only be plans'));return;}
              if(!existing&&command.actual.planId!==null&&!command.allowAdditional&&data.actualMeals.some(a=>a.planId===command.actual.planId)){stop(failure('DUPLICATE','This plan already has an actual record. Open it or explicitly add another.'));return;}
              const timeZone=existing&&'timeZone' in existing?existing.timeZone:command.actual.timeZone;
              data.actualMeals=[...data.actualMeals.filter(a=>a.id!==objectId),{...command.actual,...common,timeZone}];
            } else if(command.type==='saveCustomRecipe') {
              const r=command.recipe;
              data.customRecipes=[...data.customRecipes.filter(r=>r.id!==objectId),{...common,snapshot:{recipeId:objectId,familyId:objectId,variantId:null,name:r.name,types:r.types,ingredients:r.ingredients,steps:r.steps,baseServings:r.baseServings,source:{url:null,commit:null,license:null},catalogVersion:null,contentVersion:null}}];
            } else data.menuTemplates=[...data.menuTemplates.filter(t=>t.id!==objectId),{...command.template,...common}];
          } else if(command.type==='saveShoppingList') {
            const input=command.list;
            const existing=input.id?data.shoppingLists.find(l=>l.id===input.id):undefined;
            if(command.expectedObjectRevision!==null&&(!existing||existing.revision!==command.expectedObjectRevision)){conflict();return;}
            if(existing&&!sameShoppingFacts(existing,input)){stop(failure('INVALID','Saved shopping sources and generated quantities are immutable. Regenerate as a new list.'));return;}
            if(!existing)for(const source of input.sources){
              const persisted=source.kind==='plan'?data.plans.find(p=>p.id===source.id):data.draft;
              if(source.kind==='draft'&&source.revision===null)continue;
              const snapshots=persisted&&('snapshots' in persisted?persisted.snapshots:persisted.dishes.map(d=>d.recipe));
              if(!persisted||persisted.revision!==source.revision||persisted.servings!==source.servings||canonical(snapshots)!==canonical(source.snapshots)){stop(failure('CONFLICT','Selected shopping source changed or was deleted. Keep the preview and reselect sources.'));return;}
            }

            objectId=input.id??generatedId!;objectRevision=(existing?.revision??0)+1;
            if(!existing&&data.shoppingLists.some(l=>l.id===objectId)){stop(failure('DUPLICATE','Generated list identity is already in use'));return;}
            data.shoppingLists=[...data.shoppingLists.filter(l=>l.id!==objectId),{sources:input.sources,items:input.items,id:objectId,createdAt:existing?.createdAt??timestamp,updatedAt:timestamp,revision:objectRevision,requestId}];
          } else if(command.type==='saveFavorite') {
            if(data.favorites.some(f=>f.recipeId===command.snapshot.recipeId||f.id===generatedId)){stop(failure('DUPLICATE','This recipe is already favorited'));return;}
            objectId=generatedId!;objectRevision=1;
            data.favorites.push({id:objectId,recipeId:command.snapshot.recipeId,snapshot:command.snapshot,createdAt:timestamp,updatedAt:timestamp,revision:1,requestId});
          } else if(command.type==='deleteObject') {
            const original=data[command.store].find(row=>row.id===command.id);
            if(!original||original.revision!==command.expectedObjectRevision){conflict();return;}
            objectId=generatedId!;objectRevision=1;
            if(data.trash.some(t=>t.id===objectId)){stop(failure('DUPLICATE','Generated trash identity is in use'));return;}
            const entry={id:objectId,store:command.store,originalId:original.id,data:original,deletedAt:timestamp,expiresAt:new Date(Date.parse(timestamp)+TRASH_LIFETIME_MS).toISOString() as UtcIso,revision:1,requestId} as TrashEntry;
            data[command.store]=data[command.store].filter(row=>row.id!==command.id) as never;
            data.trash.push(entry);
          } else if(command.type==='restoreTrash') {
            const entry=data.trash.find(t=>t.id===command.id);
            if(!entry||entry.revision!==command.expectedObjectRevision){conflict();return;}
            if(entry.expiresAt<=timestamp){stop(failure('INVALID','This deleted object has expired'));return;}
            const checked=restoreTrash(entry,data,command.target);if(!checked.ok){stop(checked);return;}
            objectId=entry.originalId;objectRevision=entry.data.revision+1;
            const restored={...entry.data,...(command.target??{}),revision:objectRevision,updatedAt:timestamp,requestId};
            if(entry.store==='actualMeals'){const today=currentToday(timestamp);if(!today.ok){stop(today);return;}if(entry.data.date>today.value){stop(failure('FUTURE_DATE','Future actual records cannot be restored'));return;}}
            data[entry.store]=[...data[entry.store],restored] as never;
            data.trash=data.trash.filter(t=>t.id!==entry.id);
          } else if(command.type==='expireTrash') {
            data.trash=data.trash.filter(t=>t.expiresAt>timestamp);
          } else if(command.type==='markBackupRequested') {
            data.meta.lastBackupRequestedAt=command.requestedAt;
          } else if(command.type==='replaceAll') {
            const today=currentToday(timestamp);if(!today.ok){stop(today);return;}
            if(command.data.actualMeals.some(row=>row.date>today.value)||command.data.trash.some(row=>row.store==='actualMeals'&&row.data.date>today.value)){stop(failure('FUTURE_DATE','Future actual records cannot be imported'));return;}
            const revision=beforeData.meta.revision+1;
            Object.assign(data,structuredClone(command.data));
            data.preferences.revision=revision;if(data.draft)data.draft.revision=revision;
            for(const store of ['customRecipes','favorites','menuTemplates','plans','actualMeals','shoppingLists','trash'] as const)for(const row of data[store])row.revision=revision;
            for(const entry of data.trash)entry.data.revision=revision;
            data.meta.revision=beforeData.meta.revision;nextEpoch=epoch+1;
          } else if(command.type==='clearAll') {
            const fresh=initialPersonalData();Object.assign(data,fresh);data.meta.revision=beforeData.meta.revision;nextEpoch=epoch+1;
          }
          data.meta = { ...data.meta, revision: data.meta.revision + 1, lastSuccessfulWriteAt: timestamp };
          const candidate = validatePersonalData(data); if (!candidate.ok) { stop(candidate); return; }
          const receipt: CommitReceipt = { globalRevision: data.meta.revision, objectId, objectRevision, replayed: false };
          const entry: JournalEntry = { requestId, fingerprint: hash, receipt, epoch:nextEpoch };
          const sorted = [...(command.type==='clearAll'||command.type==='replaceAll'?[]:journal), entry].sort((a, b) => a.receipt.globalRevision - b.receipt.globalRevision);
          const retained = sorted.slice(-REQUEST_JOURNAL_LIMIT);
          const size = validateJsonBoundary({ data, journal: retained }); if (!size.ok) { stop(size); return; }
          if(command.type==='clearAll'||command.type==='replaceAll')for(const name of STORE_NAMES)tx.objectStore(name).clear();
          if(command.type==='replaceAll'){
            for(const name of ['customRecipes','favorites','menuTemplates','plans','actualMeals','shoppingLists','trash'] as const)for(const row of data[name])tx.objectStore(name).put(row);
          } else if(command.type!=='clearAll') {
            for(const name of ['customRecipes','favorites','menuTemplates','plans','actualMeals','shoppingLists','trash'] as const){
              const before=beforeData[name] as {id:string}[]; const after=data[name] as {id:string}[];
              const oldRows=new Map(before.map(row=>[row.id,row]));const newRows=new Map(after.map(row=>[row.id,row]));
              for(const row of before)if(!newRows.has(row.id))tx.objectStore(name).delete(row.id);
              for(const row of after)if(canonical(row)!==canonical(oldRows.get(row.id)??null))tx.objectStore(name).put(row);
            }
          }
          if(data.draft!==null&&(command.type==='replaceAll'||canonical(data.draft)!==canonical(beforeData.draft)))tx.objectStore('draft').put(data.draft);
          if(command.type==='clearAll'||command.type==='replaceAll'||canonical(data.preferences)!==canonical(beforeData.preferences))tx.objectStore('preferences').put(data.preferences,'current');
          if(command.type==='clearAll'||command.type==='replaceAll')tx.objectStore('meta').put(nextEpoch,'epoch');
          tx.objectStore('meta').put(data.meta, 'current');
          for (const evicted of sorted.slice(0, Math.max(0, sorted.length - REQUEST_JOURNAL_LIMIT))) tx.objectStore('meta').delete(`request:${evicted.requestId}`);
          tx.objectStore('meta').put(entry, `request:${requestId}`);
          result = { ok: true, value: receipt }; changed = true;
        } catch (error) { stop(errorResult(error)); }
      });
      tx.oncomplete = () => { if (result.ok && changed) { emit(result.value.globalRevision); try { channel?.postMessage(result.value.globalRevision); } catch { /* Storage remains committed. */ } } resolve(result); };
      tx.onabort = () => resolve(result.ok ? errorResult(tx.error ?? new DOMException('Write aborted', 'AbortError')) : result);
    });
  }
  const onFocus = () => { void read().then((result) => { if (result.ok) emit(result.value.meta.revision); }); };
  if (channel) channel.onmessage = (event: MessageEvent<unknown>) => { if (isInteger(event.data)) emit(event.data); };
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
  function close(): void { if (closed) return; closed = true; db.close(); channel?.close(); if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus); }
  db.onversionchange = () => { close(); emit(lastRevision); };
  function status(): RepositoryStatus {
    const reason = closed ? 'UNAVAILABLE' : newer ? 'NEWER_SCHEMA' : invalidLayout ? 'INVALID' : cleanupFailure?.code??null;
    return {
      readable: !closed,
      writable: !closed && !newer && !invalidLayout && !cleanupFailure,
      schemaVersion: db.version,
      reason,
    };
  }
  if(!newer&&!invalidLayout){
    // Opening is the expiry boundary. A guarded transaction precedes the caller's editing baseline.
    for(;;){
      const current=await read();if(!current.ok)break;
      const now=options.now().toISOString();if(!current.value.trash.some(t=>t.expiresAt<=now))break;
      const cleanup=await commit({type:'expireTrash'},current.value.meta.revision,options.uuid());
      if(cleanup.ok)break;
      if(cleanup.error.code==='CONFLICT')continue;
      cleanupFailure=cleanup.error;break;
    }
  }
  return {
    ok: true,
    value: {
      read,
      commit,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      status,
      readRawSnapshot: raw,
      close,
    },
  };
}
