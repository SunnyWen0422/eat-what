import { canonicalShopping, sourceFromDraft, sourceFromPlan } from '../shopping/shopping.ts';
import { useEffect, useRef, useState } from 'react';
import type { Catalog, GenerateInput, GenerationResult, LocalDate, Meal, MealDraft, MenuTemplate, PersonalData, Plan, RecipeSnapshot, Result, ShoppingSource, Slot, TimeZone, UtcIso } from '../domain/types.ts';
import { canGenerate } from '../catalog/catalog.ts';
import { defaultSlots, generateMeal, replaceSlot } from '../menu/rules.ts';
import { localDate } from '../domain/dates.ts';
import { snapshotRecipe } from '../domain/snapshots.ts';
import type { Command, CommitReceipt, Repository } from '../data/repository.ts';
import { initialPersonalData } from '../data/migrations.ts';
import type { StorageStatus } from '../data/storage-status.ts';
import { requestPersistence } from '../data/storage-status.ts';
import { Recipes } from './Recipes.tsx';
import { Today } from './Today.tsx';
import { Calendar } from './Calendar.tsx';
import { My } from './My.tsx';
import { ActualEditor, DeleteEditor, FavoriteEditor, TemplateEditor, type LocalActions } from './PersonalActions.tsx';
import { Dialog, errorMessage, MEAL_LABELS, Notice } from './components.tsx';

interface AppProps { repository: Repository | null; catalogLoader: () => Promise<Result<Catalog>>; storageStatus: StorageStatus }
const tabs = ['今天吃什么', '菜谱', '日历', '我的'] as const;
const ROUTES = { '今天吃什么': '#/today', '菜谱': '#/recipes', '日历': '#/calendar', '我的': '#/my' } as const;
function routeTab() { return tabs.find(label => ROUTES[label] === location.hash) ?? '今天吃什么'; }
export function App({ repository, catalogLoader, storageStatus }: AppProps) {
  const [tab, setTab] = useState<typeof tabs[number]>(routeTab);
  const [data, setData] = useState(initialPersonalData);
  // Initial null placeholders are not evidence of an empty persisted write/download history.
  const [metadataKnown,setMetadataKnown] = useState(false);
  const [draft, setDraft] = useState<MealDraft | null>(null);
  const [preferences, setPreferences] = useState(initialPersonalData().preferences);
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const seedRef = useRef(0);
  const preferencesDirtyRef = useRef(false);
  const draftDirtyRef = useRef(false);
  const failedSaveRef = useRef<{ command: Command; success: string } | null>(null);
  // The displayed records may refresh independently. Only an explicit decision rebases local edits.
  const editingRevisionRef = useRef(0);
  const latestRevisionRef = useRef(0);
  const [reviewedData, setReviewedData] = useState<PersonalData | null>(null);
  const [catalog, setCatalog] = useState<Result<Catalog> | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [ready, setReady] = useState(repository === null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(false);
  const [connectionStatus, setConnectionStatus] = useState(repository?.status());
  const [confirming, setConfirming] = useState(false);
  const [replacement,setReplacement] = useState<Plan|null>(null);
  const [recording,setRecording] = useState(false);
  const [templating,setTemplating] = useState(false);
  const [favoriting,setFavoriting] = useState<RecipeSnapshot|null>(null);
  const [unfavoriting,setUnfavoriting] = useState<string|null>(null);
  const [shoppingSeed,setShoppingSeed]=useState<{id:string;sources:ShoppingSource[]}|null>(null);
  const [backupHint,setBackupHint] = useState(false);
  const [presentationFailure,setPresentationFailure] = useState(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone as TimeZone;
  const [date, setDate] = useState<string>(() => localDate(new Date(), zone));
  const [meal, setMeal] = useState<Meal>('dinner');
  const [persisted, setPersisted] = useState(storageStatus.persisted);
  const writable = ready && storageStatus.writable && connectionStatus?.writable === true && !presentationFailure;
  const storageNotice = !storageStatus.writable || !connectionStatus?.writable
    ? connectionStatus?.reason === 'NEWER_SCHEMA' ? errorMessage('NEWER_SCHEMA') : storageStatus.error?.code === 'BLOCKED' ? errorMessage('BLOCKED')
      : connectionStatus?.readable&&['QUOTA','ABORTED'].includes(connectionStatus.reason??'')?'回收站到期清理未完成，当前只读。原记录仍可查看且未删除，重新打开可重试清理。'
      : '本地存储不可写，本次内容不会保存。可以临时手选菜谱。' : null;
  const requestRef = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    function followRoute() { const next = routeTab(); setTab(next); setReplacement(null); setShoppingSeed(null); }
    window.addEventListener('hashchange', followRoute); window.addEventListener('popstate', followRoute);
    return () => { window.removeEventListener('hashchange', followRoute); window.removeEventListener('popstate', followRoute); };
  }, []);
  function navigate(next: typeof tabs[number]) {
    if (next !== tab) { setReplacement(null); setShoppingSeed(null); }
    history.pushState(null, '', ROUTES[next]); setTab(next);
    queueMicrotask(() => document.getElementById('main-content')?.focus());
  }
  function markConflict() {
    conflictRef.current = true;
    setConflict(true);
    setReviewedData(null);
  }
  function rememberRevision(revision: number) {
    latestRevisionRef.current = Math.max(latestRevisionRef.current, revision);
  }
  async function loadOnline() {
    setCatalogLoading(true);
    try {
      setCatalog(await catalogLoader());
    } catch {
      setCatalog({ ok: false, error: { code: 'UNAVAILABLE', message: 'Online directory unavailable' } });
    } finally {
      setCatalogLoading(false);
    }
  }
  useEffect(() => { void loadOnline(); }, [catalogLoader]);
  useEffect(() => {
    if (!repository) return;
    let alive = true;
    void repository.read().then((result) => {
      if (!alive) return;
      if (result.ok) {
        setData(result.value);setMetadataKnown(true);
        setDraft(result.value.draft);
        setPreferences(result.value.preferences);
        editingRevisionRef.current = result.value.meta.revision;
        rememberRevision(result.value.meta.revision);
        if (latestRevisionRef.current > editingRevisionRef.current) markConflict();
      } else {
        setConnectionStatus({ ...repository.status(), writable: false, reason: result.error.code });
        setNotice(errorMessage(result.error.code));
        setError(true);
      }
      setReady(true);
    });
    const unsubscribe = repository.subscribe((revision) => {
      if (!alive) return;
      setConnectionStatus(repository.status());
      // Notifications during a commit/read remain queued until the receipt is known.
      rememberRevision(revision);
      if (!pendingRef.current && latestRevisionRef.current > editingRevisionRef.current) markConflict();
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [repository]);

  async function refresh() {
    if (!repository || pendingRef.current) return;
    const result = await repository.read();
    if (!result.ok) {
      setNotice(errorMessage(result.error.code));
      setError(true);
      return;
    }
    setData(result.value);setMetadataKnown(true);
    setConnectionStatus(repository.status());
    rememberRevision(result.value.meta.revision);
    if (latestRevisionRef.current > result.value.meta.revision) {
      setReviewedData(null);
      setNotice('记录又有更新，请再次查看最新内容。当前编辑已保留。');
      return;
    }
    // Looking at the latest records is read-only and never advances the editing baseline.
    setReviewedData(result.value);
    setNotice('已读取最新记录。请选择采用最新草稿，或保留本页草稿。');
    setError(false);
  }
  function resolveConflict(choice: 'adoptLatest' | 'keepLocal') {
    if (!reviewedData || pendingRef.current) return;
    if (latestRevisionRef.current > reviewedData.meta.revision) {
      markConflict();
      setNotice('记录又有更新，请再次查看最新内容。当前编辑已保留。');
      return;
    }
    editingRevisionRef.current = reviewedData.meta.revision;
    if (choice === 'adoptLatest') {
      setDraft(reviewedData.draft);
      setPreferences(reviewedData.preferences);
      setGeneration(null);
      preferencesDirtyRef.current = false;
      draftDirtyRef.current = false;
    }
    failedSaveRef.current = null;
    conflictRef.current = false;
    setConflict(false);
    setReviewedData(null);
    requestRef.current = null;
    setNotice(choice === 'adoptLatest' ? '已采用最新草稿。' : draftDirtyRef.current || preferencesDirtyRef.current ? '已保留本页草稿和设置。请保存当前编辑，再保存计划。' : '已保留本页草稿和设置。');
    setError(false);
  }
  async function save(command: Command, success: string, exactRetry = false): Promise<boolean> {
    if (!repository || !writable || pendingRef.current) return false;
    if (conflictRef.current && !exactRetry) {
      setNotice('当前编辑已保留，请先查看最新内容并选择如何继续。');
      return false;
    }
    const expectedRevision = editingRevisionRef.current;
    pendingRef.current = true;
    setPending(true);
    setError(false);
    failedSaveRef.current = { command, success };
    setNotice(command.type === 'savePlan' ? '正在保存计划…' : command.type === 'saveSettings' ? '正在保存设置…' : command.type === 'savePreferences' ? '正在保存忌口…' : '正在保存草稿…');
    const key = JSON.stringify(command);
    if (requestRef.current?.key !== key) requestRef.current = { key, id: globalThis.crypto.randomUUID() };
    const result = await repository.commit(command, expectedRevision, requestRef.current!.id);
    if (result.ok) {
      // This local edit incorporated only its own completed receipt, not later writes by another tab.
      editingRevisionRef.current = Math.max(editingRevisionRef.current, result.value.globalRevision);
      rememberRevision(result.value.globalRevision);
      const read = await repository.read();
      if (read.ok) {
        setData(read.value);setMetadataKnown(true);
        rememberRevision(read.value.meta.revision);
      }
      if(data.meta.revision===0)setBackupHint(true);
      setPresentationFailure(!read.ok);
      setNotice(success);
      setError(false);
      requestRef.current = null;
      failedSaveRef.current = null;
      if (command.type === 'saveSettings' || command.type === 'savePreferences') preferencesDirtyRef.current = false;
      if (command.type === 'saveSettings' || command.type === 'saveDraft') draftDirtyRef.current = false;
      // An exact replay can confirm our own previously uncertain write. It resolves
      // that conflict only if no later foreign revision has been observed.
      if (exactRetry && latestRevisionRef.current <= editingRevisionRef.current) {
        conflictRef.current = false;
        setConflict(false);
        setReviewedData(null);
      }
    } else {
      setNotice(result.error.code === 'CONFLICT' ? '' : errorMessage(result.error.code));
      setError(true);
      if (result.error.code === 'CONFLICT') markConflict();
    }
    pendingRef.current = false;
    setPending(false);
    if (latestRevisionRef.current > editingRevisionRef.current) markConflict();
    return result.ok;
  }
  function currentDraft(): MealDraft {
    return draft ?? { id: 'current', servings: preferences.servings, meal: preferences.meal, slots: preferences.slots, dishes: [], countsConfirmed: preferences.servings <= 8, updatedAt: new Date().toISOString() as UtcIso, revision: 0 };
  }
  function saveCurrentEdits() {
    if (failedSaveRef.current || conflictRef.current || pendingRef.current) return;
    // Explicit rebasing ends the old request. Save the retained state as a new intent;
    // once attempted, the normal failure recovery keeps that exact command and UUID.
    if (draftDirtyRef.current) {
      const current = currentDraft();
      const command: Command = preferencesDirtyRef.current
        ? { type: 'saveSettings', draft: current, preferences: { ...preferences, servings: current.servings, meal: current.meal, slots: current.slots } }
        : { type: 'saveDraft', draft: current };
      void save(command, '当前编辑已保存');
    } else if (preferencesDirtyRef.current) void save({ type: 'savePreferences', preferences }, '当前编辑已保存');
  }
  function editDraft(next: MealDraft, success: string) {
    if (!ready || pendingRef.current) return;
    setDraft(next);
    draftDirtyRef.current = true;
    const command: Command = preferencesDirtyRef.current ? { type: 'saveSettings', draft: next, preferences: { ...preferences, servings: next.servings, meal: next.meal, slots: next.slots } } : { type: 'saveDraft', draft: next };
    if (writable) void save(command, success);
    else { setNotice('已临时编辑。'); setError(false); }
  }
  function editSettings(change: { servings?: number; meal?: Meal; slots?: Slot[]; vegetarian?: boolean }) {
    if (!ready || pendingRef.current) return;
    const current = currentDraft();
    const servings = change.servings ?? current.servings;
    const meal = change.meal ?? current.meal;
    const vegetarian = change.vegetarian ?? preferences.softPreferences.includes('vegetarian');
    let slots = change.slots ?? current.slots;
    if (change.vegetarian !== undefined) slots = slots.map((slot) => ({ ...slot, type: vegetarian && slot.type === 'meat' ? 'vegetable' : slot.type }));
    else if (change.servings !== undefined || change.meal !== undefined) {
      const defaults = defaultSlots(servings, meal, vegetarian);
      if (!defaults.ok) { setNotice(defaults.error.message); setError(true); return; }
      if (!defaults.value.requiresConfirmation) slots = defaults.value.slots;
    }
    const next: MealDraft = { ...current, servings, meal, slots, dishes: current.dishes.filter((dish) => slots.some((slot) => slot.id === dish.slotId)), countsConfirmed: servings <= 8, updatedAt: new Date().toISOString() as UtcIso };
    const nextPreferences = { ...preferences, servings, meal, slots, softPreferences: change.vegetarian === undefined ? preferences.softPreferences : [...preferences.softPreferences.filter((p) => p !== 'vegetarian'), ...(vegetarian ? ['vegetarian'] : [])] };
    setDraft(next); setPreferences(nextPreferences); setGeneration(null);
    draftDirtyRef.current = true; preferencesDirtyRef.current = true;
    if (writable) void save({ type: 'saveSettings', draft: next, preferences: nextPreferences }, '设置和草稿已保存');
    else { setNotice('已临时修改设置，本次内容不会保存。'); setError(false); }
  }
  function saveExclusions(raw: string) {
    if (!ready || pendingRef.current) return;
    const values = [...new Set(raw.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];
    const aliases = catalog?.ok ? catalog.value.aliases : {};
    const current = currentDraft();
    const next = {
      ...preferences,
      ...(draftDirtyRef.current ? { servings: current.servings, meal: current.meal, slots: current.slots } : {}),
      hardExclusions: values.map((text) => ({ raw: text, ingredientId: Object.hasOwn(aliases, text) ? aliases[text]! : null })),
    };
    setPreferences(next); setGeneration(null);
    preferencesDirtyRef.current = true;
    // A preference-only success cannot resolve an unsaved draft. Carry it atomically instead.
    const command: Command = draftDirtyRef.current
      ? { type: 'saveSettings', draft: current, preferences: next }
      : { type: 'savePreferences', preferences: next };
    if (writable) void save(command, '忌口已保存');
    else { setNotice('已临时修改忌口，本次内容不会保存。'); setError(false); }
  }
  function automatic(slotId?: string) {
    if (!ready || pendingRef.current) return;
    const current = currentDraft();
    const hardExclusions = preferences.hardExclusions.flatMap((e) => e.ingredientId === null ? [] : [e.ingredientId]);
    const unresolvedExclusions = preferences.hardExclusions.filter((e) => e.ingredientId === null).map((e) => e.raw);
    if (current.servings > 8 && !current.countsConfirmed) { setNotice('超过 8 人，请先确认菜数和类型组合。'); setError(true); return; }
    if (unresolvedExclusions.length) { setNotice(`忌口尚未识别，未生效：${unresolvedExclusions.join('、')}。请补全、移除或手选。`); setError(true); return; }
    if (preferences.softPreferences.includes('vegetarian')) { setNotice('当前目录没有完整配料的素食适用审核，素食自动选择不可用。可以核对配料后手选。'); setError(true); return; }
    const openSlots = current.slots.filter((slot) => slotId ? slot.id === slotId : !current.dishes.some((d) => d.slotId === slot.id && d.locked));
    const gatedSlots = openSlots.length ? openSlots : current.slots;
    if (!catalog?.ok || !gatedSlots.every((slot) => canGenerate(catalog.value, current.meal, slot.type))) { setNotice('在线目录尚未满足当前餐次和类型的可信准入，自动选择不可用。请重试在线菜谱或手选。'); setError(true); return; }
    const input: GenerateInput = { catalog: catalog.value, draft: current, hardExclusions, unresolvedExclusions, favoriteIds: data.favorites.flatMap((favorite) => typeof favorite.recipeId === 'string' ? [favorite.recipeId] : []), actualMeals: data.actualMeals, today: localDate(new Date(), zone), seed: ++seedRef.current };
    const result = slotId ? replaceSlot(input, slotId) : generateMeal(input);
    if (!result.ok) { setNotice(result.error.message); setError(true); return; }
    setGeneration(result.value);
    if (result.value.conflicts.length) { setNotice('锁定菜与当前条件冲突，请先解除锁定或移除。当前菜单已保留。'); setError(true); return; }
    if (slotId && result.value.missing.length) { setNotice('无替代菜，原菜已保留。'); setError(false); return; }
    editDraft(result.value.draft, result.value.missing.length ? '已保存部分菜单，请查看缺失原因' : slotId ? '换菜已保存' : '菜单已生成并保存');
  }
  function select(recipe: RecipeSnapshot) {
    if (!ready || pendingRef.current) return;
    const current = currentDraft();
    const compatible = current.slots.filter((slot) => recipe.types.includes(slot.type));
    const slot = compatible.find((slot) => !current.dishes.some((dish) => dish.slotId === slot.id))
      ?? compatible.find((slot) => !current.dishes.some((dish) => dish.slotId === slot.id && dish.locked))
      ?? current.slots.find((slot) => !current.dishes.some((dish) => dish.slotId === slot.id && dish.locked));
    if (!slot) { setNotice('所有槽位已锁定，请先解除锁定或调整组合。'); setError(true); return; }
    const next: MealDraft = { ...current, dishes: [...current.dishes.filter((dish) => dish.slotId !== slot.id), { slotId: slot.id, recipe: snapshotRecipe(recipe), locked: false }] };
    setGeneration(null); editDraft(next, '草稿已保存');
  }
  function toggleLock(slotId: string) {
    const current = currentDraft();
    editDraft({ ...current, dishes: current.dishes.map((dish) => dish.slotId === slotId ? { ...dish, locked: !dish.locked } : dish) }, '锁定状态已保存');
  }
  function removeDish(slotId: string) {
    const current = currentDraft(); setGeneration(null);
    editDraft({ ...current, dishes: current.dishes.filter((dish) => dish.slotId !== slotId) }, '已移除并保存');
  }
  async function savePlan(replace?:Plan) {
    if (!draft?.dishes.length) return;
    if (draftDirtyRef.current || preferencesDirtyRef.current) { setNotice('草稿仍有未保存编辑，请先保存当前编辑，保存失败时重试，再保存计划。'); setError(true); return; }
    if (draft.servings > 8 && !draft.countsConfirmed) { setNotice('超过 8 人，请先确认菜数和类型组合。'); setError(true); return; }
    const existing=data.plans.find(p=>p.date===date&&p.meal===meal);
    if(existing&&!replace){setReplacement(existing);return;}
    const saved = await save({ type: 'savePlan', expectedObjectRevision: replace?.revision??null, plan: { ...(replace?{id:replace.id}:{}),date: date as LocalDate, meal, servings: draft.servings, snapshots: draft.dishes.map((dish) => snapshotRecipe(dish.recipe)), timeZone: replace?.timeZone??zone } }, '计划已保存');
    if (saved) {setConfirming(false);setReplacement(null);}
  }
  async function readLatest():Promise<Result<PersonalData>> {
    if(!repository)return {ok:false,error:{code:'UNAVAILABLE',message:'Local storage unavailable'}};
    const result=await repository.read();if(result.ok){setData(result.value);setMetadataKnown(true);rememberRevision(result.value.meta.revision);if(latestRevisionRef.current>editingRevisionRef.current)markConflict();}return result;
  }
  async function commitLocal(command:Command,expectedRevision:number,requestId:string):Promise<Result<CommitReceipt>> {
    if(!repository||!writable||pendingRef.current)return {ok:false,error:{code:'UNAVAILABLE',message:'Local saving unavailable'}};
    pendingRef.current=true;setPending(true);
    let result:Result<CommitReceipt>;
    try{result=await repository.commit(command,expectedRevision,requestId);}
    catch{result={ok:false,error:{code:'UNAVAILABLE',message:'Commit result not confirmed'}};}
    if(result.ok){
      if(command.type==='clearAll'){
        // An exact replay acknowledges the old clear; it never clears later records or rebases newer edits backwards.
        const clearCurrentEdits=!result.value.replayed||editingRevisionRef.current<=result.value.globalRevision;
        editingRevisionRef.current=Math.max(editingRevisionRef.current,result.value.globalRevision);
        if(clearCurrentEdits){setShoppingSeed({id:crypto.randomUUID(),sources:[]});setDraft(null);setPreferences(initialPersonalData().preferences);setGeneration(null);preferencesDirtyRef.current=false;draftDirtyRef.current=false;failedSaveRef.current=null;requestRef.current=null;conflictRef.current=false;setConflict(false);setReviewedData(null);setRecording(false);setTemplating(false);setConfirming(false);setReplacement(null);}
      }else if(command.type==='replaceAll'){
        if(!result.value.replayed){
          editingRevisionRef.current=result.value.globalRevision;setShoppingSeed({id:crypto.randomUUID(),sources:[]});
          setDraft(command.data.draft?{...command.data.draft,revision:result.value.globalRevision}:null);setPreferences({...command.data.preferences,revision:result.value.globalRevision});setGeneration(null);
          preferencesDirtyRef.current=false;draftDirtyRef.current=false;failedSaveRef.current=null;requestRef.current=null;conflictRef.current=false;setConflict(false);setReviewedData(null);setRecording(false);setTemplating(false);setConfirming(false);setReplacement(null);
        }
      }else if(command.type!=='markBackupRequested'&&editingRevisionRef.current===expectedRevision)editingRevisionRef.current=result.value.globalRevision;
      else if(command.type==='markBackupRequested'&&!draftDirtyRef.current&&!preferencesDirtyRef.current&&!failedSaveRef.current&&editingRevisionRef.current===expectedRevision)editingRevisionRef.current=result.value.globalRevision;
      rememberRevision(result.value.globalRevision);
      const read=await repository.read();if(read.ok){setData(read.value);setMetadataKnown(true);rememberRevision(read.value.meta.revision);}setPresentationFailure(!read.ok);
      if(data.meta.revision===0&&command.type!=='markBackupRequested')setBackupHint(true);
      setNotice(command.type==='markBackupRequested'?'下载请求时间已记录':command.type==='replaceAll'?(result.value.replayed?'恢复请求已执行，后续记录仍保留':'个人备份已恢复'):command.type==='saveActual'?'实际记录已保存':command.type==='saveCustomRecipe'?'自定义菜谱已保存':command.type==='saveFavorite'?'已收藏':command.type==='saveTemplate'?'菜单模板已保存':command.type==='saveShoppingList'?(command.expectedObjectRevision===null?'采购清单已保存':'采购编辑已保存'):command.type==='deleteObject'?'已移入回收站，保留 30 天':command.type==='restoreTrash'?'已恢复':command.type==='clearAll'?(result.value.replayed&&read.ok&&read.value.meta.revision>result.value.globalRevision?'清空请求已执行，之后新增的记录仍保留。':'本应用个人数据已清空'):command.type==='savePlan'?'计划编辑已保存':'本地记录已保存');
      // A successful independent object write cannot erase a retained draft/settings retry.
      if(!failedSaveRef.current)setError(false);
    }
    pendingRef.current=false;setPending(false);
    if(latestRevisionRef.current>editingRevisionRef.current)markConflict();
    return result;
  }
  function useTemplate(template:MenuTemplate){
    if(!ready||pendingRef.current)return;
    const current=currentDraft();const slots=template.snapshots.map((r,index)=>({id:`template-${index+1}`,type:r.types[0]??current.slots[index]?.type??'vegetable'}));
    const next:MealDraft={...current,servings:template.servings,slots,dishes:template.snapshots.map((r,index)=>({slotId:slots[index]!.id,recipe:snapshotRecipe(r),locked:false})),countsConfirmed:template.servings<=8};
    const nextPreferences={...preferences,servings:next.servings,meal:next.meal,slots};setPreferences(nextPreferences);preferencesDirtyRef.current=true;setGeneration(null);editDraft(next,'模板已载入草稿');
  }
  let shoppingDraft:ShoppingSource|null=null;
  if(draft?.dishes.length){
    shoppingDraft=sourceFromDraft(draft);
    const persisted=data.draft;
    const same=!draftDirtyRef.current&&persisted&&canonicalShopping({snapshots:persisted.dishes.map(d=>d.recipe),servings:persisted.servings})===canonicalShopping({snapshots:shoppingDraft.snapshots,servings:shoppingDraft.servings});
    shoppingDraft.revision=same?persisted.revision:null;
  }
  function openShopping(sources:ShoppingSource[]){setShoppingSeed({id:crypto.randomUUID(),sources});history.pushState(null, '', ROUTES['我的']);setTab('我的');}
  const localActions:LocalActions={data,catalog,writable,pending,commit:commitLocal,readLatest,onSelect:select,onUseTemplate:useTemplate};
  function favorite(recipe:RecipeSnapshot){
    const existing=data.favorites.find(f=>f.recipeId===recipe.recipeId);setFavoriting(existing?null:recipe);setUnfavoriting(existing?.id??null);
  }
  const conflictFeedback = conflict && <div className="notice error">
        <p>另一个页面已修改，请查看最新内容后重试。你的输入已保留。</p>
        <button onClick={() => void refresh()} disabled={pending}>查看最新内容</button>
        {reviewedData && <div>
          <p>最新记录版本：{reviewedData.meta.revision}</p>
          <p>最新草稿：{reviewedData.draft?.dishes.map((dish) => dish.recipe.name).join('、') || '尚未选菜'}</p>
          <p>采用最新草稿会放弃本页未保存的草稿和设置编辑，日期和餐次输入保留。</p>
          <button onClick={() => resolveConflict('adoptLatest')} disabled={pending}>采用最新草稿</button>
          <p>保留本页草稿和设置后，可点击“保存当前编辑”替换最新草稿或设置。</p>
          <button onClick={() => resolveConflict('keepLocal')} disabled={pending}>保留当前编辑并继续</button>
        </div>}
      </div>;
  const recoveryFeedback = <>{conflictFeedback}
{presentationFailure&&<div className="notice error"><p>保存事务已完成，但读取更新失败。不要重复新建记录，请重新读取已保存内容。</p><button disabled={pending} onClick={()=>void readLatest().then(r=>{if(r.ok)setPresentationFailure(false);})}>重新读取已保存记录</button></div>}
      {error && failedSaveRef.current && <button disabled={pending || !writable} onClick={() => { const retry = failedSaveRef.current; if (retry) void save(retry.command, retry.success, true); }}>重试保存当前编辑</button>}
      {!conflict && !failedSaveRef.current && (draftDirtyRef.current || preferencesDirtyRef.current) && <button disabled={pending || !writable} onClick={saveCurrentEdits}>保存当前编辑</button>}
  </>;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>跳到主要内容</a>
    <header><p className="eyebrow">简单安排，好好吃饭</p><h1>吃什么</h1><p>无登录 · 个人记录只在本地</p>{ready && metadataKnown && data.meta.revision === 0 && <p>无需登录。记录保存在当前浏览器，建议定期导出备份。</p>}</header>
    <nav aria-label="主导航">{tabs.map(label => <button key={label} aria-current={tab === label ? 'page' : undefined} onClick={() => navigate(label)}>{label}</button>)}</nav>
    <main id="main-content" tabIndex={-1}>
      {!ready && <Notice text="正在读取本地记录…" />}
      {storageNotice && <><Notice text={storageNotice} error /><button onClick={() => window.location.reload()}>重新打开本地记录</button></>}
      {!(tab === '今天吃什么' && confirming) && recoveryFeedback}
      {notice && notice !== storageNotice && !(tab === '今天吃什么' && confirming) && <Notice text={notice} error={error} />}
      {backupHint&&<Notice text='建议在“我的 → 数据管理”导出备份，记录只保存在当前浏览器。'/>}

      {tab==='今天吃什么'&&recording&&<ActualEditor actions={localActions} snapshots={draft?.dishes.map(d=>d.recipe)??[]} onDone={()=>setRecording(false)}/>}
      {tab==='今天吃什么'&&templating&&<TemplateEditor actions={localActions} snapshots={draft?.dishes.map(d=>d.recipe)??[]} servings={draft?.servings??2} onDone={()=>setTemplating(false)}/>}
      {tab==='菜谱'&&favoriting&&<FavoriteEditor actions={localActions} snapshot={favoriting} onDone={()=>setFavoriting(null)}/>}
      {tab==='菜谱'&&unfavoriting&&<DeleteEditor actions={localActions} store='favorites' id={unfavoriting} onDone={()=>setUnfavoriting(null)}/>}
      {tab==='今天吃什么'&&replacement&&<Dialog title="替换已有计划" busy={pending} onClose={()=>{setReplacement(null);setConfirming(false);}}><h3>替换已有计划</h3>{notice&&<Notice text={notice} error={error}/>}{recoveryFeedback}<label>计划日期<input type="date" value={date} disabled readOnly/></label><label>计划餐次<select value={meal} disabled>{Object.entries(MEAL_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><p>此日期和餐次已有计划：{replacement.snapshots.map(s=>s.name).join('、')}。替换只修改计划，不改变实际记录。</p><button disabled={pending||!writable} onClick={()=>void savePlan(replacement)}>确认替换已有计划</button>{' '}<button disabled={pending} onClick={()=>{setReplacement(null);setConfirming(false);}}>取消替换计划</button></Dialog>}
      {tab === '今天吃什么' ? <Today draft={draft} settings={currentDraft()} preferences={preferences} generation={generation} ready={ready} catalogAvailable={catalog?.ok === true} catalogLoading={catalogLoading} notice={notice} noticeError={error} recovery={recoveryFeedback} onRetryCatalog={() => void loadOnline()} onSettings={editSettings} onExclusions={saveExclusions} onGenerate={() => automatic()} onReplace={(slotId) => automatic(slotId)} onLock={toggleLock} onRemove={removeDish} onCountsConfirm={() => editDraft({ ...currentDraft(), countsConfirmed: true }, '人数和组合确认已保存')} onDiscard={() => { setGeneration(null); editDraft({ ...currentDraft(), dishes: [] }, '已放弃菜单，设置已保留'); }} data={data} writable={writable && !conflict} pending={pending||replacement!==null} confirming={confirming && !replacement} onCancel={()=>setConfirming(false)} date={date} meal={meal} onDate={setDate} onMeal={setMeal} onConfirm={() => { setMeal(draft?.meal ?? 'dinner'); setConfirming(true); }} onSave={() => void savePlan()} onShopping={()=>{if(shoppingDraft)openShopping([shoppingDraft]);}} onRecord={()=>{setRecording(true);setTemplating(false);}} onTemplate={()=>{setTemplating(true);setRecording(false);}} />
        : tab === '菜谱' ? <Recipes preferences={preferences} catalog={catalog} loading={catalogLoading} onRetry={() => void loadOnline()} onSelect={select} onFavorite={favorite} favorites={data.favorites} writable={writable} pending={pending || !ready} />
        : tab === '日历' ? <Calendar actions={localActions} onShopping={plan=>openShopping([sourceFromPlan(plan)])}/>
        : <My actions={localActions} metadataKnown={metadataKnown} repository={repository} memoryData={{...data,preferences,draft}} shoppingSeed={shoppingSeed} draftSource={shoppingDraft} storageStatus={storageStatus} persisted={persisted} onPersistence={()=>{void requestPersistence().then(setPersisted);}}/>}
    </main>
  </div>;
}
