@import "../../styles/theme.wxss";
.ingredient-row { display:flex; align-items:center; gap:{{space.0.rpx*1.5}}; padding:{{space.2.rpx}} 0; border-bottom:1rpx solid #E7ECE5; }
.ingredient-row .ew-link { padding:0 {{space.0.rpx*1.5}}; }

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

/* Warm table v2: source context before quantity edits. */
.shopping-preview-page { padding-bottom:calc(114px + env(safe-area-inset-bottom)); }
.shopping-preview-page .ew-card { padding:16px; border:0; border-radius:18px; }
.ingredient-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:12px 0; border-bottom:1px solid {{divider}}; }
.ingredient-row .ew-grow { min-width:110px; }.ingredient-row .ew-link { padding:6px; }
.preview-bottom { display:flex; gap:10px; }.preview-bottom > ui-button:last-child { flex:1; min-width:0; }
