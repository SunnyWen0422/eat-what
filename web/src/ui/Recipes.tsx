import type { WebViewState } from './App.tsx';
import { RecipeImage } from './RecipeImage.tsx';
import { useState } from 'react';
import { manualWarnings } from '../menu/rules.ts';
import type { Catalog, CatalogRecipe, DishType, Favorite, PersonalData, RecipeSnapshot, Result } from '../domain/types.ts';
import { Dialog, RecipeFacts, TYPE_LABELS } from './components.tsx';
const REVIEW_LABELS = { VERIFIED:'有审核记录', UNREVIEWED:'尚未审核', UNKNOWN:'审核情况未知', BROWSE_ONLY:'仅供浏览', REJECTED:'未通过审核' };
const ISSUE_LABELS: Record<string,string> = {
  FAMILY_DATABASE_ID_FALLBACK:'相近菜谱可能是同一道菜的不同做法。', MEALS_LOCAL_CONVENTION:'餐次分类供搭配参考。',
  STANDARD_INGREDIENT_IDS_UNKNOWN:'食材名称尚未完成统一核对。', COMPOUND_COMPOSITION_UNKNOWN:'复合食材的完整配料尚未核实。',
  UNMAPPED_TYPE:'暂未明确菜品分类。', AUTOMATIC_SELECTION_UNAVAILABLE:'这道菜暂不参与自动推荐。', BASE_SERVINGS_UNKNOWN:'原配方人数尚未明确。',
};
export function Recipes({ catalog, loading, onRetry, onSelect, onFavorite, favorites, writable, pending, preferences, viewState, onViewState }: {
  viewState?: WebViewState['recipes']; onViewState?: (state: WebViewState['recipes']) => void;
  catalog: Result<Catalog> | null; loading: boolean; onRetry: () => void; onSelect: (recipe: CatalogRecipe) => void; onFavorite: (recipe: RecipeSnapshot) => void; favorites: Favorite[]; writable: boolean; pending: boolean; preferences: PersonalData['preferences'];
}) {
  const [localView, setLocalView] = useState<WebViewState['recipes']>({ keyword: '', category: '', favoritesOnly: false });
  const { keyword, category, favoritesOnly } = viewState ?? localView;
  function update(patch: Partial<WebViewState['recipes']>) { const next = { ...(viewState ?? localView), ...patch }; if (onViewState) onViewState(next); else setLocalView(next); }
  const setKeyword = (keyword: string) => update({ keyword });
  const setCategory = (category: DishType | '') => update({ category });
  const setFavoritesOnly = (favoritesOnly: boolean) => update({ favoritesOnly });
  const [selected, setSelected] = useState<CatalogRecipe | null>(null);
  const recipes = catalog?.ok ? catalog.value.recipes : [];
  const query = keyword.trim().toLocaleLowerCase();
  const matches = recipes.filter(recipe => (!query || [recipe.name, ...recipe.ingredients.map(i => i.raw)].some(text => text.toLocaleLowerCase().includes(query))) && (!category || recipe.types.includes(category)) && (!favoritesOnly || favorites.some(f => f.recipeId === recipe.recipeId)));
  const warnings = (recipe: RecipeSnapshot) => manualWarnings(recipe, preferences.hardExclusions.flatMap(e => e.ingredientId === null ? [] : [e.ingredientId]), preferences.hardExclusions.filter(e => e.ingredientId === null).map(e => e.raw));
  function buttons(recipe: CatalogRecipe, detail = false) {
    const favorite = favorites.some(f => f.recipeId === recipe.recipeId);
    return <div className="actions"><button className={detail?'primary':undefined} onClick={() => { onSelect(recipe); if (detail) setSelected(null); }} disabled={pending} aria-label={`手选 ${recipe.name}`}>手选这道菜</button>
      <button disabled={pending || !writable} aria-label={`${favorite ? '取消收藏' : '收藏'} ${recipe.name}`} onClick={() => { if (detail) setSelected(null); onFavorite(recipe); }}>{favorite ? '取消收藏' : '收藏'}</button></div>;
  }
  return <section className="dish-surface recipes-page" aria-labelledby="recipes-title">
    <h2 id="recipes-title">菜谱</h2>
    <div className="card filters"><label>搜索名称或食材<input data-view-anchor="recipe-search" type="search" value={keyword} onChange={event => setKeyword(event.target.value)} /></label>
      <label>菜谱分类<select data-view-anchor="recipe-category" value={category} onChange={event => setCategory(event.target.value as DishType | '')}><option value="">全部分类</option>{Object.entries(TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
      <details className="catalog-filter-options"><summary>更多筛选{favoritesOnly ? ' · 仅看收藏' : ''}</summary><label>仅看收藏<input data-view-anchor="recipe-favorites" type="checkbox" checked={favoritesOnly} onChange={event => setFavoritesOnly(event.target.checked)} /></label>
      <button onClick={() => { update({ keyword: '', category: '', favoritesOnly: false }); }}>清除筛选</button></details>
    </div>
    {!catalog?.ok && loading ? <p className="muted">正在准备菜谱，可先查看个人记录。</p> : !catalog?.ok ? <div className="notice"><p>在线菜谱暂时无法读取。已有个人计划仍可查看，可在“我的”新建自定义菜谱。</p><button disabled={loading} onClick={onRetry}>重试在线菜谱</button></div>
      : <><p className="result-count muted">{matches.length} 道菜</p>
        {!recipes.length ? <p>当前没有可浏览的在线菜谱。</p> : !matches.length ? <p>没有匹配的菜谱，试试调整筛选。</p>
          : <ul className="recipe-list">{matches.map(recipe => <li className="card recipe-card" key={recipe.recipeId}><div className="dish-identity"><RecipeImage snapshot={recipe}/><div><h3>{recipe.name}</h3><p className="muted">{recipe.types.map(type => TYPE_LABELS[type]).join('、') || '菜谱'}</p></div></div>
            {(preferences.hardExclusions.length || preferences.softPreferences.includes('vegetarian') ? warnings(recipe) : []).map(warning => <p className="warning" key={warning}>{warning}</p>)}

            <button data-view-anchor={`recipe-detail-${recipe.recipeId}`} aria-label={`查看详情 ${recipe.name}`} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setSelected(recipe); }}>查看做法</button>{buttons(recipe)}
          </li>)}</ul>}</>}
    {selected && <Dialog title={selected.name} initialFocus="panel" busy={pending} onClose={() => setSelected(null)}><h3>{selected.name}</h3><RecipeImage snapshot={selected} hero/><RecipeFacts snapshot={selected} />
      <details><summary>菜谱信息说明</summary><p>{REVIEW_LABELS[selected.reviewStatus]}</p>{selected.issues.map((issue,index)=><p key={index}>{ISSUE_LABELS[issue] ?? (/^[A-Z_0-9]+$/.test(issue) ? '部分菜谱资料仍需核对。' : issue)}</p>)}</details>{warnings(selected).map(warning => <p className="warning" key={warning}>{warning}</p>)}{buttons(selected, true)}<button disabled={pending} onClick={() => setSelected(null)}>关闭菜谱详情</button></Dialog>}
  </section>;
}
