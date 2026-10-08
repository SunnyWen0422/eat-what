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
