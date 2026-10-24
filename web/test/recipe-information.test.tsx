// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Recipes } from '../src/ui/Recipes.tsx';
import { normalizePublicDish } from '../src/catalog/catalog.ts';
import type { Catalog, PublicDish } from '../src/domain/types.ts';
import { personalData } from './fixtures.ts';
import { canonicalPublicDish, canonicalRecipeFixture } from './canonical-fixture.ts';

afterEach(cleanup);

function information(row: PublicDish) {
  const parsed = normalizePublicDish(row);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const catalog = { origin: 'online-provider', version: null, recipes: [parsed.value], aliases: {}, recipeAliases: {}, availability: {} } as Catalog;
  render(<Recipes catalog={{ ok: true, value: catalog }} loading={false} onRetry={() => {}} onSelect={() => {}} onFavorite={() => {}}
    favorites={[]} writable pending={false} preferences={{ ...personalData().preferences, servings: 8 }} />);
  fireEvent.click(screen.getByRole('button', { name: `查看详情 ${row.name}` }));
  return within(screen.getByRole('dialog'));
}

it('shows fixed whole-recipe quantities and preserves fractions in natural-language steps', () => {
  const details = information(canonicalPublicDish(1, {}, {
    name: '固定配方青菜', baseServings: 2,
    steps: [{ id: 's1', text: '1/2 勺盐拌匀，再煮 2.5 分钟。', ingredientLineIds: ['i1'] }],
  }));
  expect(details.getByText('整道菜用量', { exact: false })).not.toBeNull();
  expect(details.getByText('100克')).not.toBeNull();
  expect(details.queryByText('400克')).toBeNull();
  expect(details.getByText('1/2 勺盐拌匀，再煮 2.5 分钟。')).not.toBeNull();
});

it('preserves discretionary amounts and unknown nutrition and allergens in canonical details', () => {
  const details = information(canonicalPublicDish(2, {}, {
    name: '未知资料青菜', baseServings: null, dietaryCodes: null, allergenCodes: null,
    ingredients: canonicalRecipeFixture().ingredients.map(line => ({ ...line, quantity: null, quantityKind: 'discretionary' as const, quantityDisplay: '适量' })),
  }));
  expect(details.getByText('适量')).not.toBeNull();
  expect(details.getByText('过敏原资料未提供')).not.toBeNull();
  expect(details.queryByText(/千卡/)).toBeNull();
  expect(details.queryByText('0克')).toBeNull();
});
