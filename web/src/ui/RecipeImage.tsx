import { createContext, useContext, useState } from 'react';
import type { Catalog, RecipeSnapshot } from '../domain/types.ts';
import { recipeImage } from '../catalog/media.ts';
import { CategoryIcon } from './components.tsx';

export const RecipeMediaContext = createContext<Catalog | null>(null);
function ImageContent({ source, snapshot }: { source: string | null; snapshot: RecipeSnapshot }) {
  const [failed, setFailed] = useState(false);
  return source && !failed
    ? <img src={source} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <CategoryIcon type={snapshot.types[0]} />;
}
export function RecipeImage({ snapshot, hero = false }: { snapshot: RecipeSnapshot; hero?: boolean }) {
  const catalog = useContext(RecipeMediaContext);
  const current = catalog?.recipes.find(row => row.recipeId === snapshot.recipeId && row.name === snapshot.name && row.contentVersion === snapshot.contentVersion);
  const source = current ? recipeImage(current) : null;
  return <span className={hero ? 'recipe-photo recipe-hero' : 'recipe-photo'} aria-hidden="true"><ImageContent key={JSON.stringify([snapshot.recipeId,snapshot.contentVersion,source])} source={source} snapshot={snapshot} /></span>;
}
