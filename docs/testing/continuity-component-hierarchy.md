# E02 component hierarchy verification

2026-10-16, source baseline `4ae3cdd8e64f656147fb379640eb3b83ed92eef7`.

Assistant menus retain one outer F surface. Inner dish rows now use spacing and
dividers; dish names have the same 16px body scale with stronger weight. Main
confirmation buttons stay solid; choices stay outlined on a soft background.
Compact-row press feedback belongs to the pressed control rather than the whole
card. It uses the existing 100ms token and existing reduced-motion duration.
56px image reservations, image URLs, events, handlers, 180ms row fade and 200ms
keyboard-aware sheet behavior are retained. Styles are generated from templates.

## Reproduce offline checks

```powershell
python scripts/build_ui_assets.py
python scripts/verify_miniapp_experience.py --templates --assets
node --test tests/motion-contract.test.js tests/component-accessibility.test.js tests/fixed-action-layout.test.js tests/component-native-contracts.test.js
node scripts/acceptance/continuity-component-layout.cjs <output-directory> 4ae3cdd
```

The layout script uses an existing Playwright installation; `PLAYWRIGHT_MODULE`
can identify its module and `CHROMIUM_EXECUTABLE` an existing Chromium browser.
It does not install dependencies or connect to any service. The baseline argument
only reads the three baseline component styles plus the field error style from
Git. Its HTML fixture uses the generated component selectors and synthetic names;
the one-pixel local image tests load geometry, not food photography.

Named assertions cover:

- `changed dish keeps surrounding geometry`: component replacement preserves
  neighboring data/order; rendered row rectangles remain equal through busy,
  replacement and image decode for the fixed fixture labels.
- `large labels preserve hit area`: 320/390px widths at 1/1.3/2 font scales,
  no horizontal overflow, controls at least 44px, primary at least 48px; 56px image
  reservations. The 390px normal compact rows match the baseline rectangles and
  at least two complete rows fit in the 844px fixture viewport.
- `reduced motion preserves outcomes`: the same receipt, undo event and
  destination remain available with duration zero. Existing keyboard, safe-area,
  wrapped-footer measurement and focus-forwarding tests are retained.
- Pressed More retains visible feedback while the surrounding card stays still.
  Fixtures include normal, pressed, busy, disabled, error and large text states.

Observed on Windows, Node 24.15.0 and Edge 155.0.4283.45: 6 layout fixtures passed;
13 focused tests passed; the complete offline frontend suite passed 1077 tests
with no failures or skips. Template registration/handlers passed for 50 templates;
asset/token checks passed. The initial full suite caught unsupported component
attribute selectors introduced in this task; these were replaced with existing
state classes and the full suite was rerun successfully.

## Scope and remaining acceptance

K01–K08 are retained: canonical source, A/F separation, colors, typography,
geometry, real-image fallback, template generation and motion. No tab, source
image, interaction command, runtime configuration or data contract changed.
F01–F05 have other task owners; this style increment does not claim their coverage.
All K01–K32 and existing maturity cases remain intact.

Chromium fixtures provide CSS smoke evidence only. Native WeChat first-screen
layout, real loading spinner geometry, device keyboard/safe-area/font scaling,
screen-reader focus and real users were not run. The complete page first-screen
baseline remains native acceptance work; these fixtures only establish component
geometry. No application package, backend, database, model, production or release
validation was performed. Controller-owned aggregate verification is separate.
