import { useState } from 'react';
import { manualWarnings } from '../menu/rules.ts';
import type { Catalog, CatalogRecipe, DishType, Favorite, PersonalData, RecipeSnapshot, Result } from '../domain/types.ts';
import { CategoryIcon, Dialog, Notice, RecipeFacts, SourceLink, TYPE_LABELS } from './components.tsx';
export function Recipes({ catalog, loading, onRetry, onSelect, onFavorite, favorites, writable, pending, preferences }: {
  catalog: Result<Catalog> | null; loading: boolean; onRetry: () => void; onSelect: (recipe: CatalogRecipe) => void; onFavorite: (recipe: RecipeSnapshot) => void; favorites: Favorite[]; writable: boolean; pending: boolean; preferences: PersonalData['preferences'];
}) {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<DishType | ''>('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selected, setSelected] = useState<CatalogRecipe | null>(null);
  const recipes = catalog?.ok ? catalog.value.recipes : [];
  const query = keyword.trim().toLocaleLowerCase();
  const matches = recipes.filter(recipe => (!query || [recipe.name, ...recipe.ingredients.map(i => i.raw)].some(text => text.toLocaleLowerCase().includes(query))) && (!category || recipe.types.includes(category)) && (!favoritesOnly || favorites.some(f => f.recipeId === recipe.recipeId)));
  const warnings = (recipe: RecipeSnapshot) => manualWarnings(recipe, preferences.hardExclusions.flatMap(e => e.ingredientId === null ? [] : [e.ingredientId]), preferences.hardExclusions.filter(e => e.ingredientId === null).map(e => e.raw));
  function buttons(recipe: CatalogRecipe, detail = false) {
    const favorite = favorites.some(f => f.recipeId === recipe.recipeId);
    return <div className="actions"><button onClick={() => { onSelect(recipe); if (detail) setSelected(null); }} disabled={pending} aria-label={`手选 ${recipe.name}`}>手选这道菜</button>
      <button disabled={pending || !writable} aria-label={`${favorite ? '取消收藏' : '收藏'} ${recipe.name}`} onClick={() => { if (detail) setSelected(null); onFavorite(recipe); }}>{favorite ? '取消收藏' : '收藏'}</button></div>;
  }
  return <section aria-labelledby="recipes-title">
    <h2 id="recipes-title">菜谱</h2><p className="muted">在线菜谱可浏览和手选，满足审核准入时可本地配餐。个人记录保存在当前浏览器。</p>
    <div className="card filters"><label>搜索名称或食材<input type="search" value={keyword} onChange={event => setKeyword(event.target.value)} /></label>
      <label>菜谱分类<select value={category} onChange={event => setCategory(event.target.value as DishType | '')}><option value="">全部分类</option>{Object.entries(TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
      <label>仅看收藏<input type="checkbox" checked={favoritesOnly} onChange={event => setFavoritesOnly(event.target.checked)} /></label>
      <button onClick={() => { setKeyword(''); setCategory(''); setFavoritesOnly(false); }}>清除筛选</button><p>筛选仅在本地进行，不发送关键词或收藏。</p>
    </div>
    {loading ? <Notice text="正在读取在线菜谱…" /> : !catalog?.ok ? <div className="notice"><p>在线菜谱暂时无法读取。已有个人计划仍可查看，可在“我的”新建自定义菜谱。</p><button disabled={loading} onClick={onRetry}>重试在线菜谱</button></div>
      : <><Notice text={`已读取 ${recipes.length} 道在线菜谱 · 当前显示 ${matches.length} 道 · 具备单菜准入标记 ${recipes.filter(recipe => recipe.generationEligible).length} 道。自动配餐仍需当前餐次和类型的整体准入。`} />
        {!recipes.length ? <p>当前没有可浏览的在线菜谱。</p> : !matches.length ? <p>没有匹配的菜谱，试试调整筛选。</p>
          : <ul className="recipe-list">{matches.map(recipe => <li className="card" key={recipe.recipeId}><CategoryIcon type={recipe.types[0]} /><h3>{recipe.name}</h3><p className="muted">{recipe.types.map(type => TYPE_LABELS[type]).join('、') || '分类未知'} · {recipe.baseServings === null ? '基准人数未知' : `基准 ${recipe.baseServings} 人`} · {recipe.reviewStatus === 'VERIFIED' ? '有审核记录' : '审核状态未知'}</p>
            <p>份量和复合食材信息可能未知，请按实际需求核对。</p>{warnings(recipe).map(warning => <p className="warning" key={warning}>{warning}</p>)}
            <p>手选不代表通过忌口筛选。来源：<SourceLink url={recipe.source.url} />。</p>
            <button aria-label={`查看详情 ${recipe.name}`} onClick={() => setSelected(recipe)}>查看食材、步骤和来源</button>{buttons(recipe)}
          </li>)}</ul>}</>}
    {selected && <Dialog title={selected.name} busy={pending} onClose={() => setSelected(null)}><h3>{selected.name}</h3><RecipeFacts snapshot={selected} />
      <p>审核状态：{selected.reviewStatus === 'VERIFIED' ? '有审核记录' : '未知或未通过'} · 标准原料身份、菜品变体和素食适用仍缺少完整审核。</p>{selected.issues.map((issue, index) => <p key={index}>来源限制：{issue}</p>)}{warnings(selected).map(warning => <p className="warning" key={warning}>{warning}</p>)}{buttons(selected, true)}<button disabled={pending} onClick={() => setSelected(null)}>关闭菜谱详情</button></Dialog>}
  </section>;
}
