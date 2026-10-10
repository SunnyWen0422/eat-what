@import "../../styles/theme.wxss";
.filter-page { height: 100%; min-height: 100vh; box-sizing: border-box; background: linear-gradient(180deg,{{brandSoft}} 0,{{card}} 300px); color:{{text}}; }
.filter-page .mobile-scroll-content { padding-bottom:calc({{space.6.px*3.375}} + env(safe-area-inset-bottom)); }
.offline-tip { margin-bottom:{{space.2.px}}; padding:{{space.1.px*1.125}} {{space.2.px}}; background: #fff5d9; color:{{brand}}; font-size:{{font.caption.em}}; border-left: 3px solid #e6b73d; }
.mode-row { display: grid; grid-template-columns: 1fr 1fr; padding:{{space.0.px*0.75}}; margin-bottom:{{space.3.px}}; background: #e9eeeb; border-radius:{{radius.0.px}}; }
.mode-btn { padding:{{space.1.px*1.25}}; text-align: center; color:{{muted}}; font-size:{{font.body.em}}; }
.mode-btn.active { background: {{card}}; color:{{brand}}; font-weight: 600; border-radius:{{radius.0.px*0.66666667}}; }
.filter-section { padding:{{space.3.px}} 0; border-bottom: 1px solid #e4e8e6; }
.section-title { margin-bottom:{{space.2.px}}; font-size:{{font.card.em}}; font-weight: 700; }
.option-grid { display: flex; flex-wrap: wrap; gap:{{space.1.px*1.125}}; }
.option-chip { min-width: 64px; max-width: 100%; box-sizing: border-box; padding:{{space.1.px*1.125}} {{space.2.px}}; border: 1px solid #d9dfdc; border-radius:{{radius.0.px}}; background: {{card}}; color: {{muted}}; text-align: center; font-size:{{font.secondary.em}}; white-space: normal; word-break: break-word; }
.option-chip.selected { border-color: {{brand}}; background: {{brandSoft}}; color:{{brand}}; font-weight: 600; }
.option-count { margin-left:{{space.0.px*1.25}}; color:{{muted}}; font-size:{{font.caption.em}}; }
.ingredient-row { display: flex; gap:{{space.1.px}}; }
.ingredient-input { min-width: 0; flex: 1; height: 42px; box-sizing: border-box; padding:0 {{space.2.px}}; border: 1px solid #d9dfdc; background: {{card}}; border-radius:{{radius.0.px}}; font-size:{{font.body.em}}; }
.add-btn { width: 76px; height: 42px; line-height: 42px; padding:0; background: {{brandSoft}}; color:{{brand}}; border-radius:{{radius.0.px}}; font-size:{{font.body.em}}; }
.ingredient-list { display: flex; flex-wrap: wrap; gap:{{space.1.px}}; margin-top:{{space.1.px*1.25}}; }
.ingredient-chip { padding:{{space.1.px*0.875}} {{space.1.px*1.25}}; background: {{dangerSoft}}; color:{{brand}}; border-radius:{{radius.0.px*0.83333333}}; font-size:{{font.caption.em}}; }
.action-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; display: grid; grid-template-columns: 1fr 2fr; gap:{{space.1.px*1.25}}; padding:{{space.1.px*1.25}} {{space.3.px}} calc({{space.1.px*1.25}} + env(safe-area-inset-bottom)); box-sizing:border-box; background: {{card}}; border-top: 1px solid #e1e6e3; }
.clear-btn, .apply-btn { height: {{controls.touchSize.px}}; line-height: {{controls.touchSize.px}}; border-radius:{{radius.0.px}}; font-size:{{font.body.em}}; }
.clear-btn { background: #eef1ef; color:{{text}}; }
.apply-btn { background: {{brand}}; color: {{card}}; font-weight: 600; }

/* 页面共享主题，适用于本页详情、表单和弹层。 */

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:{{radius.1.rpx*1.2}}; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:{{controls.touchSize.px}}; min-width:{{controls.touchSize.px}}; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:{{controls.touchSize.px}};box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:{{controls.primaryHeight.px}}}

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.apply-btn { height:{{controls.primaryHeight.px}}; min-height:{{controls.primaryHeight.px}}; line-height:{{controls.primaryHeight.px}}; }

.mode-btn { background:{{brandSoft}}; }

.offline-tip { color:{{warning}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }

/* Warm table v2: recommend-filter */
 .filter-page { padding:0; background:{{background}}; }.mobile-scroll-content { padding:20px 16px 28px; }.filter-section { padding:18px 16px; border:0; border-radius:18px; margin-bottom:14px; box-shadow:none; background:{{card}}; }.section-title { font-size:{{font.section.em}}; line-height:1.5; }.mode-row { display:flex; gap:8px; margin-bottom:16px; }.mode-btn { flex:1; padding:12px; background:{{surfaceSoft}}; border-radius:12px; text-align:center; }.mode-btn.active { background:{{brandSoft}}; color:{{brand}}; }.option-grid, .ingredient-list { display:flex; flex-wrap:wrap; gap:8px; }.option-chip, .ingredient-chip { min-height:44px; border-radius:12px; padding:10px 12px; box-sizing:border-box; font-size:{{font.body.em}}; line-height:1.5; background:{{surfaceSoft}}; color:{{text}}; border:1px solid transparent; }.option-chip.selected { background:{{brandSoft}}; color:{{brand}}; border-color:{{brand}}; }.ingredient-row { display:flex; gap:8px; }.ingredient-input { flex:1; min-width:0; border:1px solid {{controlBorder}}; border-radius:12px; min-height:48px; padding:0 12px; background:{{card}}; }.add-btn { background:{{brandSoft}}; color:{{brand}}; border-radius:12px; padding:0 12px; }.action-bar { display:flex; gap:12px; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); background:{{card}}; border-top:1px solid {{divider}}; }.clear-btn, .apply-btn { min-height:48px; height:auto; border-radius:14px; padding:12px 16px; }.apply-btn { flex:1; background:{{brand}}; color:{{card}}; }.clear-btn { background:transparent; color:{{muted}}; }

.filter-page .clear-btn { border:1px solid {{controlBorder}}; background:{{card}}; color:{{brand}}; }
.filter-page .option-chip,.filter-page .ingredient-chip { border-color:{{border}}; }
.filter-page .option-chip.selected { border-color:{{brand}}; }

/* Longer explicit meal-scoped labels wrap instead of shrinking text. */
.filter-page .action-bar { flex-wrap:wrap; }
.filter-page .clear-btn, .filter-page .apply-btn { flex:1 1 140px; min-width:0; margin:0; font-size:{{font.body.em}}; line-height:1.5; white-space:normal; overflow-wrap:anywhere; }
