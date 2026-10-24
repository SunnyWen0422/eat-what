import { completeNutrition } from '../catalog/canonical.ts';
import { fetchCanonicalScale } from '../catalog/public-transport.ts';
import { canonicalAmount, factLabels, stripStepNumber, type CanonicalScale } from '../catalog/canonical.ts';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DishType, ErrorCode, Meal, PersonalStore, RecipeSnapshot, TrashEntry } from '../domain/types.ts';
import categoryIcons from '../assets/category-icons.svg?no-inline';
export const MEAL_LABELS: Record<Meal, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
const PERSONAL_STORE_LABELS: Record<PersonalStore, string> = { customRecipes: '自定义菜谱', favorites: '收藏', menuTemplates: '菜单模板', plans: '日历计划', actualMeals: '实际饮食', shoppingLists: '采购清单' };
export function trashEntryLabel(entry: TrashEntry): string {
  const name = entry.store === 'customRecipes' || entry.store === 'favorites' ? entry.data.snapshot.name : entry.store === 'menuTemplates' ? entry.data.name : entry.store === 'shoppingLists' ? entry.data.createdAt : entry.data.snapshots.map(snapshot => snapshot.name).join('、');
  return `${PERSONAL_STORE_LABELS[entry.store]} · ${name}`;
}
export function errorMessage(code: ErrorCode): string {
  if (code === 'FUTURE_DATE') return '未来日期只能保存计划，实际记录输入已保留。';
  if (code === 'QUOTA') return '存储空间不足，输入已保留。请导出已有记录、清理可恢复内容或重试。';
  if (code === 'CONFLICT') return '另一个页面已修改，请查看最新内容后重试。你的输入已保留。';
  if (code === 'DUPLICATE') return '这一天的这个餐次已有计划。请选择其他日期或餐次，输入已保留。';
  if (code === 'LIMIT') return '内容超过保存限额，输入已保留。请减少内容后重试。';
  if (code === 'NEWER_SCHEMA') return '本地数据来自更新版本，目前只读。请使用更新应用，或保留原始数据导出。';
  if (code === 'BLOCKED') return '数据升级被旧页面阻塞，请关闭旧标签页后重试。不会清空数据。';
  return '本地保存未完成，输入已保留。请重试。';
}
export function Notice({ text, error = false }: { text: string; error?: boolean }) {
  return <p className={error ? 'notice error' : 'notice'} role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'} aria-atomic="true">{text}</p>;
}

export const TYPE_LABELS: Record<DishType, string> = { meat: '荤菜', vegetable: '素菜', staple: '主食', soup: '汤羹', breakfastSnack: '早餐/加餐' };
export function CategoryIcon({ type }: { type: DishType | undefined }) {
  return <svg className="category-icon" aria-hidden="true" focusable="false" viewBox="0 0 64 64"><use href={`${categoryIcons}#${type ?? 'vegetable'}`} /></svg>;
}
export function SourceLink({ url }: { url: string | null }) {
  let safe = false;
  try { if (url) { const parsed = new URL(url); safe = parsed.protocol === 'https:' && !!parsed.hostname && !parsed.username && !parsed.password; } } catch { /* Untrusted imported URLs remain text only. */ }
  return safe ? <a href={url!} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{url}</a> : <span>{url ?? '未知'}</span>;
}
function CanonicalRecipeFacts({snapshot}:{snapshot:RecipeSnapshot}) {
  const facts=snapshot.canonical!;
  const [scaled,setScaled]=useState<CanonicalScale|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[overrides,setOverrides]=useState<Record<string,boolean>>({});
  const epoch=useRef(0);
  useEffect(()=>{epoch.current++;setScaled(null);setError('');setBusy(false);setOverrides({});return()=>{epoch.current++;};},[snapshot.recipeId,snapshot.contentVersion]);
  async function scale(nextOverrides=overrides){const serial=++epoch.current;setBusy(true);setError('');try{const value=await fetchCanonicalScale(facts.recipeId,null,facts.revision,undefined,Object.keys(nextOverrides).length?nextOverrides:undefined);if(serial===epoch.current){if(snapshot.contentVersion&&value.contentVersion!==snapshot.contentVersion)throw Error('菜谱已更新，请重新读取');setScaled(value);setOverrides(nextOverrides);}}catch(e){if(serial===epoch.current)setError(e instanceof Error?e.message:'用量更新未完成');}finally{if(serial===epoch.current)setBusy(false);}}
  const ingredients=scaled?scaled.ingredients.filter(i=>i.enabled).map(i=>({name:i.name,amount:canonicalAmount(i.quantity,i.unit,i.quantityKind)})):snapshot.ingredients.map(i=>({name:i.raw,amount:i.quantityDisplay||canonicalAmount(i.quantity?.kind==='exact'?i.quantity.value:null,i.quantity?.unit||'')}));
  const nutrition=scaled?(scaled.nutrition.completeness==='complete'?scaled.nutrition.total:null):facts.nutrition;
  const dietary=scaled?scaled.dietaryCodes:facts.dietaryCodes,allergens=scaled?scaled.allergenCodes:facts.allergenCodes;
  return <><p className="muted">{[snapshot.types.map(type=>TYPE_LABELS[type]).join('、'),facts.totalMinutes===null?'':`${facts.totalMinutes} 分钟`,'整道菜用量'].filter(Boolean).join(' · ')}</p>
    {error&&<Notice text={error} error/>}
    <h4>食材</h4><ul className="ingredient-facts">{ingredients.map((i,index)=><li key={index}><span>{i.name}</span> <span>{i.amount}</span></li>)}</ul>
    {!!facts.optionalIngredients?.length&&<div>{facts.optionalIngredients.map(i=><label key={i.lineId}><input type="checkbox" checked={scaled?scaled.ingredients.some(row=>row.lineId===i.lineId&&row.enabled):i.defaultEnabled} disabled={busy} onChange={e=>void scale({...overrides,[i.lineId]:e.target.checked})}/>{i.name}（可选）</label>)}</div>}
    <h4>做法</h4><ol>{(scaled?.steps||snapshot.steps.map(text=>({text}))).map((step,index)=><li key={index}>{/\{\{\s*amount\b/.test(step.text)?'步骤用量暂未读到，请重新读取':stripStepNumber(step.text)}{'ingredientQuantities' in step&&!!step.ingredientQuantities&&<p>本步用量：{Object.entries(step.ingredientQuantities).map(([id,q])=>{const i=scaled!.ingredients.find(i=>i.lineId===id),v=q!==null&&typeof q==='object'?q:null;return i?`${i.name} ${canonicalAmount(v?v.quantity:typeof q==='number'?q:null,v?v.unit:i.unit,v?v.quantityKind:i.quantityKind)}`:'';}).filter(Boolean).join('、')}</p>}</li>)}</ol>
    {!!dietary?.length&&<p>{dietary.map(code=>factLabels[code]||code).join('、')}</p>}{allergens?.length?<p>过敏原：{allergens.map(code=>factLabels[code]||code).join('、')}</p>:allergens==null&&<p className="muted">过敏原资料未提供</p>}
    {completeNutrition(nutrition)&&<p className="muted">整道菜合计约 {Number(nutrition.energyKcal.toFixed(1))} 千卡 · 按食材成分计算</p>}</>;
}
export function RecipeFacts({ snapshot }: { snapshot: RecipeSnapshot }) {
  if(snapshot.canonical)return <CanonicalRecipeFacts snapshot={snapshot}/>;
  return <><p className="muted">{snapshot.types.map(type=>TYPE_LABELS[type]).join('、')} · 保存时的菜谱</p><h4>食材</h4><ul className="ingredient-facts">{snapshot.ingredients.map((i,index)=><li key={index}>{i.raw}</li>)}</ul><h4>做法</h4><ol>{snapshot.steps.map((step,index)=><li key={index}>{stripStepNumber(step)}</li>)}</ol>
    <details><summary>来源与用料说明</summary>
      <p>来源链接：<SourceLink url={snapshot.source.url}/></p><p>许可：{snapshot.source.license??'未知'}</p>
      <p>来源版本：{snapshot.source.commit??'未知'} · 菜品内容版本：{snapshot.contentVersion??'未知'} · 菜库版本：{snapshot.catalogVersion??'未知'}</p>
      <p>筛选无法保证过敏安全，请核对原料、调味料及交叉接触风险。</p>
    </details></>;
}

/** The form owns one discard decision for both its cancel button and Escape. */
export function useDirtyClose(value: unknown, onClose: () => void, busy = false) {
  const original = useRef(JSON.stringify(value));
  return () => { if (!busy && (original.current === JSON.stringify(value) || window.confirm('放弃尚未保存的修改？'))) onClose(); };
}

const dialogs: HTMLElement[] = [];
const originalInert = new Map<HTMLElement, boolean>();
function updateModalBackground() {
  const top = dialogs.at(-1);
  if (!top) { for (const [node, inert] of originalInert) { node.inert = inert; node.toggleAttribute('inert', inert); } originalInert.clear(); return; }
  for (const child of document.body.children) if (child instanceof HTMLElement) {
    if (!originalInert.has(child)) originalInert.set(child, child.inert === true || child.hasAttribute('inert'));
    child.inert = child !== top; child.toggleAttribute('inert', child !== top);
  }
}
const focusable = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], summary, [tabindex="0"]';
/** Presentation only: closing never commits and a pending transaction cannot be dismissed. */
export function Dialog({ title, children, onClose, onRequestClose, busy = false, initialFocus='first' }: { title: string; children: ReactNode; onClose: () => void; onRequestClose?: () => void; busy?: boolean; initialFocus?:'first'|'panel' }) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const close = useRef(onRequestClose ?? onClose); close.current = onRequestClose ?? onClose;
  const pending = useRef(busy); pending.current = busy;
  useEffect(() => {
    const node = panel.current!; const backdrop = node.parentElement!;
    dialogs.push(backdrop); updateModalBackground();
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const controls = () => Array.from(node.querySelectorAll<HTMLElement>(focusable)).filter(item => !item.matches(':disabled') && (!item.closest('details:not([open])') || item.tagName === 'SUMMARY'));
    (initialFocus==='panel'?node:controls()[0]??node).focus({preventScroll:initialFocus==='panel'});
    function keyboard(event: KeyboardEvent) {
      if (dialogs.at(-1) !== backdrop) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!pending.current) close.current(); }
      if (event.key !== 'Tab') return;
      const items = controls(); const first = items[0] ?? node; const last = items.at(-1) ?? node;
      if (!node.contains(document.activeElement) || document.activeElement === node || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last || items.length === 0) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    }
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard); dialogs.splice(dialogs.indexOf(backdrop), 1); updateModalBackground(); document.body.style.overflow = previousOverflow;
      if (opener.current?.isConnected && !opener.current.closest('[inert]')) opener.current.focus();
      else document.getElementById('main-content')?.focus();
    };
  }, []);
  return createPortal(<div className="dialog-backdrop"><div className="dialog-panel" ref={panel} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} tabIndex={-1}>{children}</div></div>, document.body);
}
