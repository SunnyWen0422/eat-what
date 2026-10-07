@import "../../styles/theme.wxss";
.settings-page { min-height: 100vh; box-sizing: border-box; padding:{{space.3.px}} {{space.3.px}} {{space.6.px}}; background: #f5f7f6; color:{{text}}; }
.sync-row { display: flex; align-items: center; gap:{{space.1.px*0.875}}; margin-bottom:{{space.2.px*1.1666667}}; color:{{muted}}; font-size:{{font.caption.em}}; }
.sync-dot { width: 7px; height: 7px; border-radius:50%; background:{{brand}}; }
.sync-dot.online { background: {{brand}}; }
.section { padding:{{space.3.px*1.0625}} 0; border-bottom: 1px solid #dde3e0; }
.section-title { margin-bottom:{{space.0.px*1.25}}; font-size:{{font.card.em}}; font-weight: 700; }
.section-desc { margin-bottom:{{space.2.px}}; color:{{muted}}; font-size:{{font.caption.em}}; line-height: 1.5; }
.chip-grid { display: flex; flex-wrap: wrap; gap:{{space.1.px}}; }
.choice-chip { min-width: 66px; box-sizing: border-box; padding:{{space.1.px*1.125}} {{space.2.px}}; border: 1px solid #d5dcd8; border-radius:{{radius.0.px}}; background: {{card}}; color: {{muted}}; text-align: center; font-size:{{font.secondary.em}}; }
.choice-chip.selected { border-color: {{brand}}; background: {{brandSoft}}; color:{{brand}}; font-weight: 600; }
.choice-chip.danger.selected { border-color: #bd5143; background: {{dangerSoft}}; color:{{danger}}; }
.ingredient-row { display: flex; gap:{{space.1.px}}; }
.ingredient-input { min-width: 0; flex: 1; height: 42px; box-sizing: border-box; padding:0 {{space.2.px}}; border: 1px solid #d5dcd8; border-radius:{{radius.0.px}}; background: {{card}}; font-size:{{font.body.em}}; }
.add-btn { width: 76px; height: 42px; line-height: 42px; padding:0; border-radius:{{radius.0.px}}; background: {{brandSoft}}; color:{{brand}}; font-size:{{font.body.em}}; }
.top-gap { margin-top:{{space.1.px*1.25}}; }
.ingredient-chip { padding:{{space.1.px*0.875}} {{space.1.px*1.25}}; border-radius:{{radius.0.px*0.83333333}}; background: {{dangerSoft}}; color:{{brand}}; font-size:{{font.caption.em}}; }
.save-btn { margin-top:{{space.5.px}}; height: 46px; line-height: 46px; border-radius:{{radius.0.px}}; background: {{brand}}; color: {{card}}; font-size:{{font.body.em}}; font-weight: 600; }

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

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }

/* Warm table v2: settings */
 .settings-page { padding:20px 16px 28px; background:{{background}}; }.sync-row { padding:0 0 16px; color:{{muted}}; font-size:{{font.body.em}}; gap:8px; }.section { border:0; background:{{card}}; border-radius:18px; padding:18px 16px; margin-bottom:14px; box-shadow:none; }.section-title { font-size:{{font.section.em}}; color:{{text}}; line-height:1.5; }.section-desc { font-size:{{font.body.em}}; line-height:1.7; margin:6px 0 12px; }.chip-grid { display:flex; flex-wrap:wrap; gap:8px; }.choice-chip, .ingredient-chip { min-height:44px; border-radius:12px; padding:10px 12px; background:{{surfaceSoft}}; color:{{text}}; border:1px solid transparent; box-sizing:border-box; line-height:1.5; font-size:{{font.body.em}}; }.choice-chip.selected { background:{{brandSoft}}; color:{{brand}}; border-color:{{brand}}; }.choice-chip.danger.selected { background:{{danger}}; color:{{card}}; border-color:{{danger}}; }.ingredient-row { display:flex; gap:8px; }.ingredient-input { flex:1; min-width:0; background:{{card}}; border:1px solid {{controlBorder}}; border-radius:12px; min-height:48px; padding:0 12px; }.add-btn { padding:0 12px; min-height:48px; color:{{brand}}; background:{{brandSoft}}; border-radius:12px; }.save-btn { min-height:48px; height:auto; padding:12px 16px; border-radius:14px; background:{{brand}}; color:{{card}}; margin:20px 0; font-size:{{font.reading.em}}; }.save-btn[disabled] { background:{{disabled}}; color:{{text}}; }
