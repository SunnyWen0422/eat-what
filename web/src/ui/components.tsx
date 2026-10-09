import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DishType, ErrorCode, Meal, RecipeSnapshot } from '../domain/types.ts';
import categoryIcons from '../assets/category-icons.svg?no-inline';
export const MEAL_LABELS: Record<Meal, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
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
export function RecipeFacts({ snapshot }: { snapshot: RecipeSnapshot }) {
  return <><p>基准人数：{snapshot.baseServings ?? '未知'} · 分类：{snapshot.types.map(type => TYPE_LABELS[type]).join('、') || '未知'}</p>
    <h4>原料原文</h4>{snapshot.ingredients.length ? <ul>{snapshot.ingredients.map((ingredient, index) => <li key={index}>{ingredient.raw}<p>结构用量：{ingredient.quantity === null ? '未知' : ingredient.quantity.kind === 'exact' ? `${ingredient.quantity.value} ${ingredient.quantity.unit}` : `${ingredient.quantity.min}–${ingredient.quantity.max} ${ingredient.quantity.unit}`} · {ingredient.trust === 'reviewed' ? '来源有审核记录' : '未经审核'} · 复合成分{ingredient.compoundResolved ? '已解析' : '未知'}</p></li>)}</ul> : <p>食材信息未知</p>}
    <h4>步骤</h4>{snapshot.steps.length ? <ol>{snapshot.steps.map((step, index) => <li key={index}>{step}</li>)}</ol> : <p>步骤未知</p>}
    <h4>来源与限制</h4><p>来源链接：<SourceLink url={snapshot.source.url} /></p><p>来源版本：{snapshot.source.commit ?? '未知'} · 许可：{snapshot.source.license ?? '未知'}</p><p>菜品内容版本：{snapshot.contentVersion ?? '未知'} · 菜库版本：{snapshot.catalogVersion ?? '未知'}</p>
    <p>份量、标准原料身份和复合成分可能未知。筛选无法保证过敏安全，请核对原料、调味料及交叉接触风险。</p></>;
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
export function Dialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const close = useRef(onClose); close.current = onClose;
  const pending = useRef(busy); pending.current = busy;
  useEffect(() => {
    const node = panel.current!; const backdrop = node.parentElement!;
    dialogs.push(backdrop); updateModalBackground();
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const controls = () => Array.from(node.querySelectorAll<HTMLElement>(focusable)).filter(item => !item.matches(':disabled') && (!item.closest('details:not([open])') || item.tagName === 'SUMMARY'));
    (controls()[0] ?? node).focus();
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
