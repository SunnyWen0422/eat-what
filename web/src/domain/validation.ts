import { buildShopping, canonicalShopping, isShoppingSource } from '../shopping/shopping.ts';
import { ARITHMETIC_CEILING } from '../shopping/quantities.ts';
import { isLocalDate, isUtcIso } from './dates.ts';
import type { ActualMeal, ActualMealInput, CustomRecipe, CustomRecipeInput, Favorite, Ingredient, MealDraft, MenuTemplate, MenuTemplateInput, PersonalData, Plan, PlanInput, Quantity, RecipeSnapshot, Result, ShoppingItem, ShoppingList, ShoppingListEditInput, ShoppingListInput, TrashEntry } from './types.ts';

export const LIMITS = { bytes: 20 * 1024 * 1024, records: 20_000, string: 20_000, depth: 20, quantity: 1_000_000 } as const;
export const MEAL_VALUES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const TYPE_VALUES = ['meat', 'vegetable', 'staple', 'soup', 'breakfastSnack'] as const;
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
export function isText(value: unknown, nonempty = true): value is string {
  return typeof value === 'string' && value.length <= LIMITS.string && (!nonempty || value.trim().length > 0);
}
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const positiveQuantity = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= LIMITS.quantity;
/** Backup context is bounded independently of user text. One full envelope is reserved for every normal state. */
export const BACKUP_CONTEXT_LIMITS = { appVersion: 128, catalogVersion: 256, timeZone: 128 } as const;
export const BACKUP_FORMAT = 'eatwhat-web-backup';
const reservedContext = {format:BACKUP_FORMAT,schemaVersion:1,appVersion:'x'.repeat(BACKUP_CONTEXT_LIMITS.appVersion),catalogVersion:'x'.repeat(BACKUP_CONTEXT_LIMITS.catalogVersion),exportedAt:'2000-01-01T00:00:00.000Z',timeZone:'x'.repeat(BACKUP_CONTEXT_LIMITS.timeZone)};
export const BACKUP_ENVELOPE_RESERVED_BYTES = new TextEncoder().encode(JSON.stringify({...reservedContext,data:null})).byteLength - 4;
/** Bounded walk counts JSON containers (root = 1), decoded UTF-16 string characters and serialized UTF-8 bytes. */
export function validateJsonBoundary(value: unknown): Result<unknown> {
  const ancestors = new Set<object>(); let bytes=0;
  const charge=(amount:number)=>{bytes+=amount;if(bytes>LIMITS.bytes)throw new RangeError('Data exceeds 20 MiB');};
  function walk(current: unknown, containers: number): void {
    if (typeof current === 'string') {if(current.length>LIMITS.string)throw new RangeError('String exceeds 20,000 characters');charge(new TextEncoder().encode(JSON.stringify(current)).byteLength);return;}
    if (typeof current === 'number') {if(!Number.isFinite(current))throw new TypeError('Non-finite number');charge(String(current).length);return;}
    if(current===null){charge(4);return;} if(typeof current==='boolean'){charge(current?4:5);return;}
    if (!Array.isArray(current) && !isObject(current)) throw new TypeError('Only JSON values are accepted');
    if (containers+1 > LIMITS.depth) throw new RangeError('JSON nesting exceeds 20 levels');
    if (ancestors.has(current as object)) throw new TypeError('Circular data is not accepted');
    ancestors.add(current as object);charge(2);
    if(Array.isArray(current)) {for(let index=0;index<current.length;index++){if(index)charge(1);walk(current[index],containers+1);}}
    else for (const [index,[key,child]] of Object.entries(current).entries()) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new TypeError('Dangerous object key');
      if(key.length>LIMITS.string)throw new RangeError('Object key exceeds string limit');
      if(index)charge(1);charge(new TextEncoder().encode(JSON.stringify(key)).byteLength+1);walk(child,containers+1);
    }
    ancestors.delete(current as object);
  }
  try {walk(value,0);return {ok:true,value};}
  catch(error){return {ok:false,error:{code:error instanceof RangeError?'LIMIT':'INVALID',message:error instanceof Error?error.message:'Invalid JSON data'}};}
}
/** Same allowance for normal domain writes and imported data, independent of actual export context. */
export function validatePersonalBoundary(value:unknown):Result<unknown>{return validateJsonBoundary({...reservedContext,data:value});}
/** Preferences count once, current draft once, each active row or trash wrapper once; trash payload is not counted again. */
export function personalRecordCounts(data:PersonalData):Record<string,number>{
  const counts:Record<string,number>={preferences:1,draft:data.draft===null?0:1};
  for(const store of ['customRecipes','favorites','menuTemplates','plans','actualMeals','shoppingLists','trash'] as const)counts[store]=data[store].length;
  counts.total=Object.values(counts).reduce((sum,count)=>sum+count,0);return counts;
}
export function isQuantity(value: unknown): value is Quantity {
  if (!isObject(value) || !isText(value.unit)) return false;
  return value.kind === 'exact' ? exactKeys(value, ['kind', 'value', 'unit']) && positiveQuantity(value.value)
    : value.kind === 'range' && exactKeys(value, ['kind', 'min', 'max', 'unit']) && positiveQuantity(value.min) && positiveQuantity(value.max) && value.min <= value.max;
}
export function isIngredient(value: unknown): value is Ingredient {
  return exactKeys(value, ['ingredientId', 'form', 'part', 'raw', 'quantity', 'trust', 'compoundResolved'])
    && (value.ingredientId === null || isText(value.ingredientId)) && isText(value.form, false) && (value.part === null || isText(value.part))
    && isText(value.raw) && (value.quantity === null || isQuantity(value.quantity)) && ['reviewed', 'unknown'].includes(value.trust as string)
    && typeof value.compoundResolved === 'boolean';
}
const snapshotKeys = ['recipeId', 'familyId', 'variantId', 'name', 'types', 'ingredients', 'steps', 'source', 'catalogVersion', 'baseServings'];
export function isHttpsSource(value:unknown):boolean {
  if(!isText(value)||!value.startsWith('https://'))return false;
  try{const url=new URL(value);return url.protocol==='https:'&&url.hostname.length>0&&!url.username&&!url.password;}catch{return false;}
}
export function isRecipeSnapshot(value: unknown, extraKeys: readonly string[] = []): value is RecipeSnapshot {
  if (!exactKeys(value, [...snapshotKeys, ...extraKeys, ...(isObject(value) && Object.hasOwn(value, 'contentVersion') ? ['contentVersion'] : [])])) return false;
  return isText(value.recipeId) && isText(value.familyId) && (value.variantId === null || isText(value.variantId)) && isText(value.name)
    && Array.isArray(value.types) && value.types.every((t) => TYPE_VALUES.includes(t)) && new Set(value.types).size === value.types.length
    && Array.isArray(value.ingredients) && value.ingredients.every(isIngredient) && Array.isArray(value.steps) && value.steps.every((s) => isText(s))
    && exactKeys(value.source, ['url', 'commit', 'license']) && (value.source.url === null || isHttpsSource(value.source.url)) && (value.source.commit === null || isText(value.source.commit)) && (value.source.license === null || isText(value.source.license))
    && (!Object.hasOwn(value, 'contentVersion') || value.contentVersion === null || isText(value.contentVersion)) && (value.catalogVersion === null || isText(value.catalogVersion)) && (value.baseServings === null || integer(value.baseServings, 1, 50));
}
export const isInteger = integer;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function isTimeZone(value: unknown): boolean {
  if (!isText(value)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}
function withRequest(value: unknown, keys: string[]): value is Record<string, unknown> {
  return exactKeys(value, [...keys, ...(isObject(value) && Object.hasOwn(value, 'requestId') ? ['requestId'] : [])])
    && (!Object.hasOwn(value, 'requestId') || isText(value.requestId));
}
function validSlots(value: unknown): value is PersonalData['preferences']['slots'] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 20
    && value.every((s) => exactKeys(s, ['id', 'type']) && isText(s.id) && TYPE_VALUES.includes(s.type as typeof TYPE_VALUES[number]))
    && new Set(value.map((s) => s.id)).size === value.length;
}
export function isPreferences(value: unknown): value is PersonalData['preferences'] {
  return withRequest(value, ['servings', 'meal', 'slots', 'hardExclusions', 'softPreferences', 'revision'])
    && integer(value.servings, 1, 50) && MEAL_VALUES.includes(value.meal as typeof MEAL_VALUES[number]) && integer(value.revision)
    && validSlots(value.slots) && Array.isArray(value.hardExclusions)
    && value.hardExclusions.every((e) => exactKeys(e, ['ingredientId', 'raw']) && (e.ingredientId === null || isText(e.ingredientId)) && isText(e.raw))
    && Array.isArray(value.softPreferences) && value.softPreferences.every((s) => isText(s));
}
export function isMealDraft(value: unknown): value is MealDraft {
  if (!withRequest(value, ['id', 'servings', 'meal', 'slots', 'dishes', 'countsConfirmed', 'updatedAt', 'revision'])
    || value.id !== 'current' || !integer(value.servings, 1, 50) || !MEAL_VALUES.includes(value.meal as typeof MEAL_VALUES[number])
    || !validSlots(value.slots) || !Array.isArray(value.dishes) || typeof value.countsConfirmed !== 'boolean'
    || !isUtcIso(value.updatedAt) || !integer(value.revision)) return false;
  const slots = value.slots;
  return value.dishes.every((dish) => exactKeys(dish, ['slotId', 'recipe', 'locked']) && isText(dish.slotId)
    && slots.some((slot) => slot.id === dish.slotId) && isRecipeSnapshot(dish.recipe) && typeof dish.locked === 'boolean')
    && new Set(value.dishes.map((dish) => dish.slotId)).size === value.dishes.length;
}
function planFields(value: Record<string, unknown>): boolean {
  return isLocalDate(value.date) && MEAL_VALUES.includes(value.meal as typeof MEAL_VALUES[number]) && integer(value.servings, 1, 50)
    && isTimeZone(value.timeZone) && Array.isArray(value.snapshots) && value.snapshots.length >= 1 && value.snapshots.length <= 20
    && value.snapshots.every((snapshot) => isRecipeSnapshot(snapshot));
}
export function isPlanInput(value: unknown): value is PlanInput {
  return exactKeys(value, ['date', 'meal', 'servings', 'snapshots', 'timeZone', ...(isObject(value) && Object.hasOwn(value, 'id') ? ['id'] : [])])
    && (!Object.hasOwn(value, 'id') || isUuid(value.id)) && planFields(value);
}
export function isPlan(value: unknown): value is Plan {
  return exactKeys(value, ['id', 'date', 'meal', 'servings', 'snapshots', 'timeZone', 'createdAt', 'updatedAt', 'revision', 'requestId'])
    && isUuid(value.id) && planFields(value) && isUtcIso(value.createdAt) && isUtcIso(value.updatedAt) && integer(value.revision, 1) && isText(value.requestId);
}
/** Only implemented store shapes may pass; later tasks must add their own exact validators. */
export function validatePersonalData(value: unknown): Result<PersonalData> {
  const boundary = validatePersonalBoundary(value); if (!boundary.ok) return boundary;
  const invalid = (): Result<PersonalData> => ({ ok: false, error: { code: 'INVALID', message: 'Invalid personal data envelope' } });
  const stores = ['customRecipes', 'favorites', 'menuTemplates', 'plans', 'actualMeals', 'shoppingLists', 'trash'] as const;
  if (!exactKeys(value, ['meta', 'preferences', 'draft', ...stores]) || !exactKeys(value.meta, ['schemaVersion', 'appVersion', 'revision', 'lastSuccessfulWriteAt', 'lastBackupRequestedAt'])) return invalid();
  const meta = value.meta;
  if (meta.schemaVersion !== 1 || !isText(meta.appVersion) || !integer(meta.revision) || (meta.lastSuccessfulWriteAt !== null && !isUtcIso(meta.lastSuccessfulWriteAt)) || (meta.lastBackupRequestedAt !== null && !isUtcIso(meta.lastBackupRequestedAt))) return invalid();
  if (!isPreferences(value.preferences) || (value.draft !== null && !isMealDraft(value.draft)) || stores.some((store) => !Array.isArray(value[store]))) return invalid();
  if ((value.plans as unknown[]).some((plan) => !isPlan(plan))) return invalid();
  const plans = value.plans as Plan[];
  if (new Set(plans.map((p) => p.id)).size !== plans.length || new Set(plans.map((p) => `${p.date}/${p.meal}`)).size !== plans.length || new Set(plans.map((p) => p.requestId)).size !== plans.length) return invalid();
  const validators = {customRecipes:isCustomRecipe,favorites:isFavorite,menuTemplates:isMenuTemplate,actualMeals:isActualMeal,shoppingLists:isShoppingList,trash:isTrashEntry};
  for (const [store, validator] of Object.entries(validators)) {
    const rows = value[store] as unknown[];
    if (!rows.every(validator)) return invalid();
    const objects = rows as {id:string;requestId:string}[];
    if (new Set(objects.map(r=>r.id)).size !== rows.length || new Set(objects.map(r=>r.requestId)).size !== rows.length) return invalid();
  }
  const favorites = value.favorites as Favorite[];
  if (new Set(favorites.map(f=>f.recipeId)).size !== favorites.length) return invalid();
  const records = personalRecordCounts(value as unknown as PersonalData).total!;
  if (records > LIMITS.records) return { ok: false, error: { code: 'LIMIT', message: 'Personal records exceed 20,000' } };
  return { ok: true, value: structuredClone(value) as unknown as PersonalData };
}

const identityKeys = ['id','createdAt','updatedAt','revision','requestId'];
function identity(value: Record<string,unknown>): boolean {
  return isUuid(value.id) && isUtcIso(value.createdAt) && isUtcIso(value.updatedAt) && (value.updatedAt as string) >= (value.createdAt as string) && integer(value.revision,1) && isText(value.requestId);
}
function snapshots(value:unknown):value is RecipeSnapshot[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 20 && value.every(s=>isRecipeSnapshot(s));
}
function actualFields(value:Record<string,unknown>):boolean {
  return isLocalDate(value.date) && MEAL_VALUES.includes(value.meal as typeof MEAL_VALUES[number]) && snapshots(value.snapshots)
    && (value.planId === null || isUuid(value.planId)) && isText(value.note,false) && isTimeZone(value.timeZone);
}
export function isActualMealInput(value:unknown):value is ActualMealInput {
  return exactKeys(value,['date','meal','snapshots','planId','note','timeZone',...(isObject(value)&&Object.hasOwn(value,'id')?['id']:[])]) && (!Object.hasOwn(value,'id')||isUuid(value.id)) && actualFields(value);
}
export function isActualMeal(value:unknown):value is ActualMeal {
  return exactKeys(value,[...identityKeys,'date','meal','snapshots','planId','note','timeZone']) && identity(value) && actualFields(value);
}
export function isCustomRecipeInput(value:unknown):value is CustomRecipeInput {
  return exactKeys(value,['name','types','ingredients','steps','baseServings',...(isObject(value)&&Object.hasOwn(value,'id')?['id']:[])])
    && (!Object.hasOwn(value,'id')||isUuid(value.id)) && isText(value.name) && Array.isArray(value.types) && value.types.every(t=>TYPE_VALUES.includes(t)) && new Set(value.types).size===value.types.length
    && Array.isArray(value.ingredients) && value.ingredients.every(i=>isIngredient(i)&&i.trust==='unknown'&&i.ingredientId===null&&!i.compoundResolved)
    && Array.isArray(value.steps) && value.steps.every(s=>isText(s)) && (value.baseServings===null||integer(value.baseServings,1,50));
}
export function isCustomRecipe(value:unknown):value is CustomRecipe {
  return exactKeys(value,[...identityKeys,'snapshot']) && identity(value) && isRecipeSnapshot(value.snapshot)
    && value.snapshot.recipeId===value.id && value.snapshot.familyId===value.id && value.snapshot.variantId===null
    && value.snapshot.source.url===null && value.snapshot.source.commit===null && value.snapshot.source.license===null
    && value.snapshot.catalogVersion===null && value.snapshot.contentVersion===null
    && isCustomRecipeInput({name:value.snapshot.name,types:value.snapshot.types,ingredients:value.snapshot.ingredients,steps:value.snapshot.steps,baseServings:value.snapshot.baseServings});
}
export function isFavorite(value:unknown):value is Favorite {
  return exactKeys(value,[...identityKeys,'recipeId','snapshot']) && identity(value) && isText(value.recipeId) && isRecipeSnapshot(value.snapshot) && value.recipeId===value.snapshot.recipeId;
}
export function isMenuTemplateInput(value:unknown):value is MenuTemplateInput {
  return exactKeys(value,['name','servings','snapshots',...(isObject(value)&&Object.hasOwn(value,'id')?['id']:[])]) && (!Object.hasOwn(value,'id')||isUuid(value.id)) && isText(value.name) && integer(value.servings,1,50) && snapshots(value.snapshots);
}
export function isMenuTemplate(value:unknown):value is MenuTemplate {
  return exactKeys(value,[...identityKeys,'name','servings','snapshots']) && identity(value) && isText(value.name) && integer(value.servings,1,50) && snapshots(value.snapshots);
}
export const TRASH_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export function isTrashEntry(value:unknown):value is TrashEntry {
  if (!exactKeys(value,['id','store','originalId','data','deletedAt','expiresAt','revision','requestId']) || !isUuid(value.id) || !isUuid(value.originalId) || !integer(value.revision,1) || !isText(value.requestId)
    || !isUtcIso(value.deletedAt) || !isUtcIso(value.expiresAt) || Date.parse(value.expiresAt as string)-Date.parse(value.deletedAt as string)!==TRASH_LIFETIME_MS) return false;
  const valid = value.store==='customRecipes'?isCustomRecipe(value.data):value.store==='favorites'?isFavorite(value.data):value.store==='menuTemplates'?isMenuTemplate(value.data):value.store==='plans'?isPlan(value.data):value.store==='actualMeals'?isActualMeal(value.data):value.store==='shoppingLists'?isShoppingList(value.data):false;
  return valid && (value.data as {id:string}).id===value.originalId;
}

const shoppingItemKeys=['key','name','ingredientId','form','part','quantity','unknownEntries','sources','userQuantity','purchased','manual'];
/** Derived quantity limits never weaken the original Ingredient/RecipeSnapshot quantity validator. */
export function isDerivedQuantity(value:unknown):value is Quantity {
  if(!isObject(value)||!isText(value.unit))return false;
  const safe=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=ARITHMETIC_CEILING;
  return value.kind==='exact'?exactKeys(value,['kind','value','unit'])&&safe(value.value):value.kind==='range'&&exactKeys(value,['kind','min','max','unit'])&&safe(value.min)&&safe(value.max)&&(value.min as number)<=(value.max as number);
}
export function isShoppingItem(value:unknown):value is ShoppingItem {
  if(!exactKeys(value,shoppingItemKeys)||!isText(value.key)||!isText(value.name)||(value.ingredientId!==null&&!isText(value.ingredientId))||!isText(value.form,false)||(value.part!==null&&!isText(value.part))
    ||(value.quantity!==null&&!isDerivedQuantity(value.quantity))||!Array.isArray(value.unknownEntries)||!Array.isArray(value.sources)||(value.userQuantity!==null&&!isText(value.userQuantity,false))||typeof value.purchased!=='boolean'||typeof value.manual!=='boolean')return false;
  if(value.manual)return typeof value.key==='string'&&value.key.startsWith('manual:')&&isUuid(value.key.slice(7))&&value.ingredientId===null&&value.form===''&&value.part===null&&value.quantity===null&&value.sources.length===0&&value.unknownEntries.length===0;
  return /^generated:[a-f0-9]{16}$/.test(value.key)&&value.sources.length>0;
}
function shoppingFields(value:Record<string,unknown>):boolean {
  if(!Array.isArray(value.sources)||!value.sources.length||!value.sources.every(isShoppingSource)||!Array.isArray(value.items)||!value.items.every(isShoppingItem)||new Set(value.items.map(i=>i.key)).size!==value.items.length)return false;
  try{
    const generated=buildShopping(value.sources);
    const rows=value.items.filter(i=>!i.manual);
    if(rows.length!==generated.items.length)return false;
    const expected=new Map(generated.items.map(i=>[i.key,i]));
    return rows.every(item=>{const original=expected.get(item.key);if(!original)return false;const {userQuantity:_u,purchased:_p,...facts}=item;const {userQuantity:_a,purchased:_b,...originalFacts}=original;return canonicalShopping(facts)===canonicalShopping(originalFacts);});
  }catch{return false;}
}
export function isShoppingListInput(value:unknown):value is ShoppingListEditInput {
  return exactKeys(value,['sources','items',...(isObject(value)&&Object.hasOwn(value,'id')?['id']:[])])&&(!Object.hasOwn(value,'id')||isUuid(value.id))&&shoppingFields(value);
}
export function isShoppingList(value:unknown):value is ShoppingList {
  return exactKeys(value,[...identityKeys,'sources','items'])&&identity(value)&&shoppingFields(value);
}
/** Existing source snapshots and generated rows are immutable; only local overrides and manual rows may change. */
export function sameShoppingFacts(previous:ShoppingList,next:ShoppingListInput):boolean {
  const facts=(items:ShoppingItem[])=>items.filter(i=>!i.manual).map(({userQuantity:_u,purchased:_p,...rest})=>rest).sort((a,b)=>a.key.localeCompare(b.key));
  return canonicalShopping(previous.sources)===canonicalShopping(next.sources)&&canonicalShopping(facts(previous.items))===canonicalShopping(facts(next.items));
}
