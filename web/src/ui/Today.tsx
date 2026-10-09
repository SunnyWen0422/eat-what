import { useEffect, useState, type ReactNode } from 'react';
import type { DishType, GenerationResult, LocalDate, Meal, MealDraft, PersonalData, Slot } from '../domain/types.ts';
import { manualWarnings } from '../menu/rules.ts';
import { CategoryIcon, Dialog, MEAL_LABELS, Notice, RecipeFacts } from './components.tsx';
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
  const [exclusionsInput, setExclusionsInput] = useState(preferences.hardExclusions.map((e) => e.raw).join('\n'));
  const [discarding, setDiscarding] = useState(false);
  useEffect(() => { setServingsInput(String(settings.servings)); }, [settings.servings]);
  useEffect(() => { setCountInput(String(settings.slots.length)); }, [settings.slots.length]);
  const savedExclusions = preferences.hardExclusions.map((e) => e.raw).join('\n');
  useEffect(() => { setExclusionsInput(savedExclusions); }, [savedExclusions]);
  const hardIds = preferences.hardExclusions.flatMap((e) => e.ingredientId === null ? [] : [e.ingredientId]);
  const unresolved = preferences.hardExclusions.filter((e) => e.ingredientId === null).map((e) => e.raw);
  const disabled = pending || !ready;
  const invalidSettings = !servingsInput || !countInput || !Number.isInteger(Number(servingsInput)) || Number(servingsInput) < 1 || Number(servingsInput) > 50 || !Number.isInteger(Number(countInput)) || Number(countInput) < 1 || Number(countInput) > 20;
  return <section aria-labelledby="today-title">
    <h2 id="today-title">今天吃什么</h2><p className="muted">配餐在本地计算。收藏优先，最近 7 个本地日期实际吃过降权。保存计划不会记录实际饮食。</p>
    <div className="workspace-grid"><div className="card"><h3>人数和组合</h3>
      <p>建议组合不代表营养或饱腹保证。类型与餐次采用在线目录约定，不能证明素食或过敏安全。来源组以数据库 ID 和同名去重，无法识别所有变体。</p>
      <label>用餐人数<input type="number" min="1" max="50" step="1" value={servingsInput} disabled={disabled} onChange={(event) => { const value = event.target.value; setServingsInput(value); const servings = Number(value); if (value && Number.isInteger(servings) && servings >= 1 && servings <= 50) props.onSettings({ servings }); }} /></label>
      <label>草稿餐次<select value={settings.meal} disabled={disabled} onChange={(event) => props.onSettings({ meal: event.target.value as Meal })}>{Object.entries(MEAL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>素食组合（完整配料需审核）<input type="checkbox" checked={preferences.softPreferences.includes('vegetarian')} disabled={disabled} onChange={(event) => props.onSettings({ vegetarian: event.target.checked })} /></label>
      {preferences.softPreferences.includes('vegetarian') && <p>荤槽已改成素槽；缺少完整配料的素食适用审核，自动选择不可用，可以核对后手选。</p>}
      <label>菜数<input type="number" min="1" max="20" step="1" value={countInput} disabled={disabled} onChange={(event) => { const value = event.target.value; setCountInput(value); const count = Number(value); if (value && Number.isInteger(count) && count >= 1 && count <= 20) { const slots = settings.slots.slice(0, count); for (let i = slots.length; i < count; i++) { let id = `slot-${i + 1}`; while (slots.some((slot) => slot.id === id)) id += '-new'; slots.push({ id, type: 'vegetable' }); } props.onSettings({ slots }); } }} /></label>
      {invalidSettings && <p role="alert">人数需为 1–50，菜数需为 1–20。当前输入尚未保存。</p>}
      <p>减少菜数会移除末尾槽位的菜。改变人数或餐次会应用 1–8 人建议组合；超过 8 人保留当前组合供你确认。</p>
      {settings.slots.map((slot, index) => <label key={slot.id}>第 {index + 1} 槽类型<select value={slot.type} disabled={disabled} onChange={(event) => props.onSettings({ slots: settings.slots.map((s) => s.id === slot.id ? { ...s, type: event.target.value as DishType } : s) })}>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>)}
      {settings.servings > 8 && <div><p>{settings.countsConfirmed ? '人数和组合已确认' : `超过 8 人：请核对 ${settings.slots.length} 道菜及各槽类型，再确认。人数或组合变化后需重新确认。`}</p><button disabled={disabled || invalidSettings || settings.countsConfirmed} onClick={props.onCountsConfirm}>确认人数和组合</button></div>}
      <label>硬忌口，每行一项<textarea value={exclusionsInput} disabled={disabled} onChange={(event) => setExclusionsInput(event.target.value)} /></label>
      <button disabled={disabled} onClick={() => props.onExclusions(exclusionsInput)}>保存忌口</button>
      {unresolved.length > 0 && <p role="alert">忌口尚未识别，未生效：{unresolved.join('、')}。当前目录没有标准原料别名，不能假装筛选已生效。请移除或核对原料后手选。</p>}
      <p>筛选依据已知食材信息，无法保证过敏安全。请核对原料、调味料及交叉接触风险。</p>
      <button className={draft?.dishes.length ? undefined : "primary"} disabled={disabled || invalidSettings} onClick={props.onGenerate}>{draft?.dishes.length ? '重生成整餐' : '生成本餐菜单'}</button>
      {!props.catalogAvailable && <p>在线菜谱不可用，已有本地记录仍可查看。<button disabled={pending || props.catalogLoading} aria-busy={props.catalogLoading} onClick={props.onRetryCatalog}>{props.catalogLoading ? '正在读取在线菜谱…' : '重试在线菜谱'}</button></p>}
    </div>
    <div className="card"><h3>当前草稿</h3>
      {draft?.dishes.length ? <><p>{draft.servings} 人 · {MEAL_LABELS[draft.meal]}</p><ul>{draft.dishes.map((dish) => <li key={dish.slotId}>
        <CategoryIcon type={dish.recipe.types[0]} /><p>{dish.recipe.name}</p><details><summary>查看食材、步骤和来源</summary><RecipeFacts snapshot={dish.recipe}/></details><p>{TYPE_LABELS[draft.slots.find((s) => s.id === dish.slotId)!.type]}{dish.locked ? ' · 已锁定' : ''}</p>
        {!dish.recipe.types.includes(draft.slots.find((slot) => slot.id === dish.slotId)!.type) && <p className="warning">此菜不匹配当前槽位类型。{dish.locked ? '请先解除锁定或移除。' : '手选保留不代表自动筛选通过。'}</p>}
        {dish.locked && preferences.hardExclusions.length > 0 && manualWarnings(dish.recipe, hardIds, unresolved).length > 0 && <p className="warning">锁定菜存在忌口或原料不确定，请先解除锁定或移除后重新检查。</p>}
        {manualWarnings(dish.recipe, hardIds, unresolved).map((warning) => <p key={warning} className="warning">{warning}</p>)}
        {manualWarnings(dish.recipe, hardIds, unresolved).length > 0 && <p>手选或保留并不代表筛选通过。来源：{dish.recipe.source.url ?? '来源链接未知'}。</p>}
        <button disabled={disabled} aria-label={`${dish.locked ? '解除锁定' : '锁定'} ${dish.recipe.name}`} onClick={() => props.onLock(dish.slotId)}>{dish.locked ? '解除锁定' : '锁定'}</button>{' '}
        <button disabled={disabled || invalidSettings || dish.locked} aria-label={`换一道 ${dish.recipe.name}`} onClick={() => props.onReplace(dish.slotId)}>换一道</button>{' '}
        <button disabled={disabled} aria-label={`移除 ${dish.recipe.name}`} onClick={() => props.onRemove(dish.slotId)}>移除</button>
      </li>)}</ul></> : <p>还没有选菜。生成本餐菜单或到“菜谱”手选一道菜开始。</p>}
      {generation?.conflicts.map((item) => <p role="alert" key={item.slotId}>槽位 {item.slotId}：{item.reason}</p>)}
      {generation?.missing.map((item) => <p key={item.slotId}>缺少槽位 {item.slotId}：{item.reason}</p>)}
      <button className={draft?.dishes.length ? "primary" : undefined} disabled={!writable || pending || invalidSettings || !draft?.dishes.length || (draft.servings > 8 && !draft.countsConfirmed)} onClick={onConfirm}>保存到日历</button>{' '}
      <button disabled={!writable||pending||!draft?.dishes.length} onClick={props.onShopping}>从当前草稿建采购清单</button>{' '}
      <button disabled={!writable||pending||!draft?.dishes.length} onClick={props.onRecord}>记录本餐实际饮食</button>{' '}
      <button disabled={!writable||pending||!draft?.dishes.length} onClick={props.onTemplate}>保存为菜单模板</button>{' '}
      <button disabled={disabled || !draft?.dishes.length} onClick={() => setDiscarding(true)}>放弃当前菜单</button>
      {discarding && <Dialog title="放弃当前菜单" busy={disabled} onClose={() => setDiscarding(false)}><p>确认会移除当前菜单的所有菜，人数、组合和忌口设置保留。</p><button disabled={disabled} onClick={() => { setDiscarding(false); props.onDiscard(); }}>确认放弃菜单</button>{' '}<button disabled={disabled} onClick={() => setDiscarding(false)}>继续编辑</button></Dialog>}
      {confirming && <Dialog title="保存到日历" busy={pending} onClose={props.onCancel}><h3>保存到日历</h3>{props.notice && <Notice text={props.notice} error={props.noticeError}/>} {props.recovery}<form onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <label>计划日期<input required type="date" disabled={pending} value={date} onChange={(event) => onDate(event.target.value as LocalDate)} /></label>
        <label>计划餐次<select disabled={pending} value={meal} onChange={(event) => onMeal(event.target.value as Meal)}>{Object.entries(MEAL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <p>确认后仅保存为计划，你仍需另行记录实际吃过。</p>
        <button type="submit" disabled={!writable || pending || invalidSettings || (draft !== null && draft.servings > 8 && !draft.countsConfirmed)}>保存计划</button>
      <button type="button" disabled={pending} onClick={props.onCancel}>取消保存计划</button></form></Dialog>}
    </div>
    </div><div className="workspace-grid"><div className="card"><h3>已保存计划</h3>{data.plans.length ? <ul>{data.plans.map((plan) => <li key={plan.id}><p>{plan.date} · {MEAL_LABELS[plan.meal]} · {plan.servings} 人</p><p>{plan.snapshots.map((snapshot) => snapshot.name).join('、')}</p></li>)}</ul> : <p>计划为空</p>}</div>
    <div className="card"><h3>实际饮食</h3><p>{data.actualMeals.length === 0 ? '实际饮食为空' : `已记录 ${data.actualMeals.length} 餐`}</p></div>
  </div></section>;
}
