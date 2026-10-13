// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createPublicCatalogProvider, loadCatalog } from '../src/catalog/catalog.ts';
import { safeRecipeImage } from '../src/catalog/media.ts';
import { snapshotRecipe } from '../src/domain/snapshots.ts';
import { RecipeImage, RecipeMediaContext } from '../src/ui/RecipeImage.tsx';
afterEach(cleanup);
it('rejects executable, credential-bearing and local image URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:image/png,x', 'https://user:secret@example.com/a', 'https://127.0.0.1/a', 'https://localhost/a', 'https://server.local/a']) expect(safeRecipeImage(url)).toBeNull();
  expect(safeRecipeImage('http://images.example.com/food.jpg')).toBe('https://images.example.com/food.jpg');
});
it('shows verified catalog media, falls back on failure, and excludes media from snapshots', async () => {
  const catalog = await loadCatalog(createPublicCatalogProvider(async query => ({ ...query, total: 1, list: [{ id: 1, name: '番茄炒蛋', type: 'meat', image: 'https://images.example.com/food.jpg', cl: '番茄、鸡蛋', steps: '炒熟' }] })));
  if (!catalog.ok) throw new Error('fixture catalog failed');
  const recipe = catalog.value.recipes[0]!, snapshot = snapshotRecipe(recipe);
  expect(snapshot).not.toHaveProperty('image'); expect(recipe).not.toHaveProperty('image');
  const { container, rerender } = render(<RecipeMediaContext value={catalog.value}><RecipeImage snapshot={snapshot}/></RecipeMediaContext>);
  expect(container.querySelector('img')?.src).toBe('https://images.example.com/food.jpg');
  fireEvent.error(container.querySelector('img')!);
  expect(container.querySelector('img')).toBeNull(); expect(container.querySelector('svg')).not.toBeNull();
  rerender(<RecipeMediaContext value={null}><RecipeImage snapshot={{...snapshot, source:{...snapshot.source,url:'https://untrusted.example/picture.jpg'}}}/></RecipeMediaContext>);
  expect(container.querySelector('img')).toBeNull();
});
