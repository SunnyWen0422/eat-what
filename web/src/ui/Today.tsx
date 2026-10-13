import { RecipeImage } from './RecipeImage.tsx';
import { useEffect, useState, type ReactNode } from 'react';
import type { DishType, GenerationResult, LocalDate, Meal, MealDraft, PersonalData, Slot } from '../domain/types.ts';
import { manualWarnings } from '../menu/rules.ts';
import { Dialog, MEAL_LABELS, Notice, RecipeFacts } from './components.tsx';
const TYPE_LABELS: Record<DishType, string> = { meat: '荤菜', vegetable: '素菜', staple: '主食', soup: '汤羹', breakfastSnack: '早餐/加餐' };
interface TodayProps {
  draft: MealDraft | null; settings: MealDraft; preferences: PersonalData['preferences']; generation: GenerationResult | null;
  data: PersonalData; ready: boolean; catalogAvailable: boolean; catalogLoading: boolean; notice: string; noticeError: boolean; recovery: ReactNode; writable: boolean; pending: boolean; confirming: boolean; date: string; meal: Meal;
  onShopping:()=>void; onRecord:()=>void; onTemplate:()=>void; onConfirm: () => void; onDate: (date: LocalDate) => void; onMeal: (meal: Meal) => void; onSave: () => void; onCancel: () => void;
  onSettings: (change: { servings?: number; meal?: Meal; slots?: Slot[]; vegetarian?: boolean }) => void;
  onExclusions: (text: string) => void; onGenerate: () => void; onReplace: (slotId: string) => void;
  onLock: (slotId: string) => void; onRemove: (slotId: string) => void; onCountsConfirm: () => void; onDiscard: () => void; onRetryCatalog: () => void;
}
export function Today(props: TodayProps) {
  const { draft, settings, preferences, generation, data, ready, writable, pending, confirming, date, meal, onConfirm, onDate, onMeal, onSave } = props;
  const [servingsInput, setServingsInput] = useState(String(settings.servings));
  const [countInput, setCountInput] = useState(String(settings.slots.length));
  const [servingsEdited, setServingsEdited] = useState(false);
  const [countEdited, setCountEdited] = useState(false);
  const [exclusionsInput, setExclusionsInput] = useState(preferences.hardExclusions.map((e) => e.raw).join('\n'));
  const [discarding, setDiscarding] = useState(false);
  useEffect(() => { if (!servingsEdited) setServingsInput(String(settings.servings)); }, [settings.servings, servingsEdited]);
  useEffect(() => { if (!countEdited) setCountInput(String(settings.slots.length)); }, [settings.slots.length, countEdited]);
  const savedExclusions = preferences.hardExclusions.map((e) => e.raw).join('\n');
  useEffect(() => { setExclusionsInput(savedExclusions); }, [savedExclusions]);
  const hardIds = preferences.hardExclusions.flatMap((e) => e.ingredientId === null ? [] : [e.ingredientId]);
  const unresolved = preferences.hardExclusions.filter((e) => e.ingredientId === null).map((e) => e.raw);
  const disabled = pending || !ready;
  const invalidSettings = !servingsInput || !countInput || !Number.isInteger(Number(servingsInput)) || Number(servingsInput) < 1 || Number(servingsInput) > 50 || !Number.isInteger(Number(countInput)) || Number(countInput) < 1 || Number(countInput) > 20;
  const unappliedNumbers = servingsEdited || countEdited;
  const settingsBlocked = disabled || invalidSettings || unappliedNumbers;
  function applyNumbers() {
    if (disabled || invalidSettings || !unappliedNumbers) return;
    const change: Parameters<TodayProps['onSettings']>[0] = {};
    if (servingsEdited) change.servings = Number(servingsInput);
    if (countEdited) {
      const count = Number(countInput), slots = settings.slots.slice(0, count);
      for (let index = slots.length; index < count; index++) {
        let id = `slot-${index + 1}`;
        while (slots.some(slot => slot.id === id)) id += '-new';
        slots.push({ id, type: 'vegetable' });
      }
      change.slots = slots;
    }
    setServingsEdited(false); setCountEdited(false);
    props.onSettings(change);
  }
  function undoNumbers() {
    setServingsInput(String(settings.servings)); setCountInput(String(settings.slots.length));
    setServingsEdited(false); setCountEdited(false);
  }
  return <section className="dish-surface today-page" aria-labelledby="today-title">
    <h2 id="today-title">{draft?.dishes.length ? '本餐菜单' : '今天吃什么？'}</h2><div className="meal-tabs" aria-label="本餐餐次">{Object.entries(MEAL_LABELS).map(([key, label]) => <button key={key} aria-pressed={settings.meal === key} disabled={disabled} onClick={() => props.onSettings({meal:key as Meal})}>{label}</button>)}</div>
    <div className="today-workspace"><div className="meal-settings"><details className="settings-disclosure"><summary>人数与本餐搭配 <strong>{settings.servings} 人 · {settings.slots.length} 道菜</strong></summary><div className="settings-content">

      <label>用餐人数<input type="number" min="1" max="50" step="1" value={servingsInput} disabled={disabled} onChange={(event) => { const value = event.target.value; setServingsInput(value); setServingsEdited(value !== String(settings.servings)); }} /></label>
      <label>草稿餐次<select value={settings.meal} disabled={disabled} onChange={(event) => props.onSettings({ meal: event.target.value as Meal })}>{Object.entries(MEAL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>素食组合（完整配料需审核）<input type="checkbox" checked={preferences.softPreferences.includes('vegetarian')} disabled={disabled} onChange={(event) => props.onSettings({ vegetarian: event.target.checked })} /></label>
      {preferences.softPreferences.includes('vegetarian') && <p>已改为素菜组合。完整配料尚未核实，请核对后手选。</p>}
      <label>菜数<input type="number" min="1" max="20" step="1" value={countInput} disabled={disabled} onChange={(event) => { const value = event.target.value; setCountInput(value); setCountEdited(value !== String(settings.slots.length)); }} /></label>
      {invalidSettings && <p role="alert">人数需为 1–50，菜数需为 1–20。当前输入尚未应用。</p>}
      <button disabled={disabled || invalidSettings || !unappliedNumbers} onClick={applyNumbers}>应用人数和菜数</button>
      {unappliedNumbers && <><button disabled={disabled} onClick={undoNumbers}>撤销人数和菜数修改</button><p role="status">人数或菜数尚未应用。请先应用，再生成菜单或保存本餐内容。</p></>}
      <p className="muted">应用后保留配置。减少菜数会移除末尾的菜。</p>
      {settings.slots.map((slot, index) => <label key={slot.id}>第 {index + 1} 道菜类型<select value={slot.type} disabled={disabled} onChange={(event) => props.onSettings({ slots: settings.slots.map((s) => s.id === slot.id ? { ...s, type: event.target.value as DishType } : s) })}>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>)}
      {settings.servings > 8 && <div><p>{settings.countsConfirmed ? '人数和组合已确认' : `超过 8 人：请核对 ${settings.slots.length} 道菜及各槽类型，再确认。人数或组合变化后需重新确认。`}</p><button disabled={settingsBlocked || settings.countsConfirmed} onClick={props.onCountsConfirm}>确认人数和组合</button></div>}
      <label>硬忌口，每行一项<textarea value={exclusionsInput} disabled={disabled} onChange={(event) => setExclusionsInput(event.target.value)} /></label>
      <button disabled={disabled} onClick={() => props.onExclusions(exclusionsInput)}>保存忌口</button>
      {unresolved.length > 0 && <p role="alert">忌口尚未识别，未生效：{unresolved.join('、')}。请调整忌口或核对原料后手选。</p>}
      <p className="muted">有忌口时，请核对完整配料与交叉接触风险。</p></div></details>
      {unappliedNumbers && <p role="status">人数或菜数尚未应用，请展开本餐搭配确认。</p>}
      {unresolved.length > 0 && <p role="alert">忌口尚未生效：{unresolved.join('、')}。请核对后选菜。</p>}
      <button className={draft?.dishes.length ? undefined : "primary"} disabled={settingsBlocked} onClick={props.onGenerate}>{draft?.dishes.length ? '重生成整餐' : '生成本餐菜单'}</button>
      {!props.catalogAvailable && <p>在线菜谱不可用，已有本地记录仍可查看。<button disabled={pending || props.catalogLoading} aria-busy={props.catalogLoading} onClick={props.onRetryCatalog}>{props.catalogLoading ? '正在读取在线菜谱…' : '重试在线菜谱'}</button></p>}
    </div>
    <div className="current-menu"><h3>{draft?.dishes.length ? '搭配好了 · 看看菜单' : '这一餐，慢慢选'}</h3>
      {draft?.dishes.length ? <><p>{draft.servings} 人 · {MEAL_LABELS[draft.meal]}</p><ul className="menu-dishes">{draft.dishes.map((dish) => <li className="recipe-card" key={dish.slotId}>
        <div className="dish-identity"><RecipeImage snapshot={dish.recipe}/><h3>{dish.recipe.name}</h3></div><details><summary>查看食材、步骤和来源</summary><RecipeFacts snapshot={dish.recipe}/></details><p>{TYPE_LABELS[draft.slots.find((s) => s.id === dish.slotId)!.type]}{dish.locked ? ' · 已锁定' : ''}</p>
        {!dish.recipe.types.includes(draft.slots.find((slot) => slot.id === dish.slotId)!.type) && <p className="warning">此菜不匹配当前分类。{dish.locked ? '请先解除锁定或移除。' : '手选保留不代表自动筛选通过。'}</p>}
        {dish.locked && preferences.hardExclusions.length > 0 && manualWarnings(dish.recipe, hardIds, unresolved).length > 0 && <p className="warning">锁定菜存在忌口或原料不确定，请先解除锁定或移除后重新检查。</p>}
        {(preferences.hardExclusions.length || preferences.softPreferences.includes('vegetarian') ? manualWarnings(dish.recipe, hardIds, unresolved) : []).map((warning) => <p key={warning} className="warning">{warning}</p>)}

        <details className="dish-more"><summary>保留或移除</summary><button disabled={disabled} aria-label={`${dish.locked ? '解除锁定' : '锁定'} ${dish.recipe.name}`} onClick={() => props.onLock(dish.slotId)}>{dish.locked ? '解除锁定' : '锁定'}</button>{' '}

        <button disabled={disabled} aria-label={`移除 ${dish.recipe.name}`} onClick={() => props.onRemove(dish.slotId)}>移除</button></details>        <button disabled={settingsBlocked || dish.locked} aria-label={`换一道 ${dish.recipe.name}`} onClick={() => props.onReplace(dish.slotId)}>换一道</button>{' '}
      </li>)}</ul></> : <p>还没有选菜。生成本餐菜单或到“菜谱”手选一道菜开始。</p>}
      {generation?.conflicts.map((item) => <p role="alert" key={item.slotId}>菜品 {item.slotId}：{item.reason}</p>)}
      {generation?.missing.map((item) => <p key={item.slotId}>缺少菜品 {item.slotId}：{item.reason}</p>)}
      {!!draft?.dishes.length && <><button className="primary" disabled={!writable || settingsBlocked || (draft.servings > 8 && !draft.countsConfirmed)} onClick={onConfirm}>保存到日历</button><details className="menu-more"><summary>更多本餐操作</summary>
      <button disabled={!writable||settingsBlocked||!draft?.dishes.length} onClick={props.onShopping}>从当前草稿建采购清单</button>{' '}
      <button disabled={!writable||settingsBlocked||!draft?.dishes.length} onClick={props.onRecord}>记录本餐实际饮食</button>{' '}
      <button disabled={!writable||settingsBlocked||!draft?.dishes.length} onClick={props.onTemplate}>保存为菜单模板</button>{' '}
      <button disabled={disabled} onClick={() => setDiscarding(true)}>放弃当前菜单</button></details></>}
      {discarding && <Dialog title="放弃当前菜单" busy={disabled} onClose={() => setDiscarding(false)}><p>确认会移除当前菜单的所有菜，人数、组合和忌口设置保留。</p><button disabled={disabled} onClick={() => { setDiscarding(false); props.onDiscard(); }}>确认放弃菜单</button>{' '}<button disabled={disabled} onClick={() => setDiscarding(false)}>继续编辑</button></Dialog>}
      {confirming && <Dialog title="保存到日历" busy={pending} onClose={props.onCancel}><h3>保存到日历</h3>{props.notice && <Notice text={props.notice} error={props.noticeError}/>} {props.recovery}<form onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <label>计划日期<input required type="date" disabled={pending} value={date} onChange={(event) => onDate(event.target.value as LocalDate)} /></label>
        <label>计划餐次<select disabled={pending} value={meal} onChange={(event) => onMeal(event.target.value as Meal)}>{Object.entries(MEAL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <p>确认后仅保存为计划，你仍需另行记录实际吃过。</p>
        <button type="submit" disabled={!writable || settingsBlocked || (draft !== null && draft.servings > 8 && !draft.countsConfirmed)}>保存计划</button>
      <button type="button" disabled={pending} onClick={props.onCancel}>取消保存计划</button></form></Dialog>}
    </div>
    </div><details className="saved-records"><summary>查看已保存记录</summary><div className="workspace-grid"><div className="card"><h3>已保存计划</h3>{data.plans.length ? <ul>{data.plans.map((plan) => <li key={plan.id}><p>{plan.date} · {MEAL_LABELS[plan.meal]} · {plan.servings} 人</p><p>{plan.snapshots.map((snapshot) => snapshot.name).join('、')}</p></li>)}</ul> : <p>计划为空</p>}</div>
    <div className="card"><h3>实际饮食</h3><p>{data.actualMeals.length === 0 ? '实际饮食为空' : `已记录 ${data.actualMeals.length} 餐`}</p></div>
  </div></details></section>;
}
