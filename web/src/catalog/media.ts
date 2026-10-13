import type { CatalogRecipe } from '../domain/types.ts';

// Display-only metadata: never copied into local plans, backups or recommendation facts.
const images = new WeakMap<CatalogRecipe, string>();
export function safeRecipeImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim().replace(/^http:/i, 'https:'));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.includes(':')) return null;
    return url.href;
  } catch { return null; }
}
export function rememberRecipeImage(recipe: CatalogRecipe, value: unknown): void {
  const image = safeRecipeImage(value); if (image) images.set(recipe, image);
}
export function recipeImage(recipe: CatalogRecipe): string | null { return images.get(recipe) ?? null; }
