import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('declares 44px source-link targets and defers seven-column days until the two-column pane can fit them', async () => {
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  expect(css).toMatch(/(?:^|\n)a\s*\{[^}]*min-height:\s*44px/);
  expect(css).toMatch(/@media\s*\(min-width:\s*1000px\)\s*\{\s*\.month-days\s*\{\s*grid-template-columns:\s*repeat\(7/);
  expect(css).toMatch(/max-width:\s*1200px/); expect(css).toMatch(/font-size:\s*16px/);
  // Source declarations only. This test does not simulate layout, zoom or touch.
});
