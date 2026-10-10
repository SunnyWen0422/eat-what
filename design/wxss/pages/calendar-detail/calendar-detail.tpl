@import "../../styles/theme.wxss";
.dish-links { display:flex; gap:{{space.0.rpx*1.5}}; flex-wrap:wrap; margin-top:{{space.1.rpx*1.25}}; } .danger-link { color:{{danger}}; } .ew-error { display:block; }

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

.ew-page{background:{{background}}}.dish-links{display:flex;gap:{{space.1.px}};flex-wrap:wrap;margin:{{space.2.px}} 0}.dish-links .ew-chip{background:transparent;border:1px solid {{border}};display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;box-sizing:border-box;padding:{{space.1.px}};font-size:{{font.secondary.em}}}.ew-actions{margin:{{space.2.px}} 0;gap:{{space.1.px}}}.meal-more{border-top:1px solid {{divider}};padding-top:{{space.1.px}}}.meal-more-toggle{margin-top:{{space.1.px}}}

/* Read-first meal rows expand for long names and larger text. */
.calendar-dish-row { min-height:80px; display:flex; align-items:center; border-bottom:1px solid {{divider}}; padding:{{space.1.px}} 0; box-sizing:border-box; }
.dish-recipe-link { width:100%; min-height:64px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:{{space.1.px}}; padding:{{space.1.px}}; text-align:left; white-space:normal; word-break:break-word; background:transparent; font-size:1em; color:{{text}}; }
.dish-recipe-link::after { border:0; }
.original-plan .ew-reading { display:block; }
.meal-more-panel { padding:{{space.2.px}}; background:{{card}}; border-radius:{{radius.2.px}}; }

/* One meal remains the reading subject; secondary actions use rows and a sheet. */
.calendar-meal { margin:12px 0 24px; }
.meal-heading { display:flex; align-items:center; gap:8px; }
.meal-heading .ew-grow { min-width:0; flex:1; }
.meal-status { display:block; font-size:0.875em; }
.calendar-dish-row > compact-dish-row { width:100%; min-width:0; }
.calendar-detail-page .meal-action-row { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; min-height:48px; margin:0; padding:8px 0; text-align:left; white-space:normal; overflow-wrap:anywhere; background:transparent; border-radius:0; border-bottom:1px solid #E6EAE1; font-size:1em; line-height:1.5; color:#28634E; }
.meal-action-row::after { border:0; }
.meal-action-row > ui-icon { flex:0 0 auto; }
.meal-status-actions { display:flex; flex-wrap:wrap; gap:4px 12px; margin-top:8px; }
.meal-status-actions .ew-link { margin:0; font-size:0.875em; padding:0; }
.meal-sheet-list .danger-link { color:#A94442; }
.sheet-explanation { display:block; padding:8px 0; }
.calendar-detail-page .ew-reading,.original-plan { overflow-wrap:anywhere; white-space:normal; }
.calendar-detail-page .ew-heading { font-size:1.5em; }
