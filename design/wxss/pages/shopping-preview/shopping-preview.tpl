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

.preview-bottom { position:fixed; left:0; right:0; bottom:0; z-index:35; background:{{background}}; border-top:1px solid {{divider}}; }

/* Compact read-only quantities; expand only the source being edited. */
.shopping-preview-page .ingredient-row { min-height:52px; padding:0; gap:4px; }
.shopping-preview-page .ingredient-row .ew-grow { flex:1 1 80px; min-width:0; overflow-wrap:anywhere; }
.quantity-readonly { flex:0 1 auto; max-width:45%; overflow-wrap:anywhere; color:#56645B; }
.people-row,.view-tabs { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.people-row input { width:72px; }
.meal-label { overflow-wrap:anywhere; line-height:1.5; }

/* Keep menu context compact, quantities read-only and source groups folded. */
.preview-context { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; margin:8px 0; }
.preview-context .ew-grow { flex:1 1 160px; min-width:0; overflow-wrap:anywhere; font-size:0.875em; color:#56645B; }
.preview-context .ew-link { margin:0; padding:0; font-size:0.875em; }
.shopping-preview-page .ingredient-row { min-height:52px; padding:0; gap:0 4px; }
.shopping-preview-page .ingredient-row .ew-grow { flex:1 1 70px; min-width:0; white-space:normal; overflow-wrap:anywhere; }
.shopping-preview-page .quantity-readonly { flex:0 1 auto; max-width:48%; min-width:44px; min-height:44px; margin:0; padding:4px; color:#56645B; background:transparent; font-size:0.875em; line-height:1.5; white-space:normal; overflow-wrap:anywhere; border-radius:0; }
.quantity-readonly::after,.source-toggle::after,.dish-header::after { border:0; }
.shopping-preview-page .source-toggle { display:flex; align-items:center; justify-content:center; flex:0 0 44px; min-width:44px; width:44px; min-height:44px; margin:0; padding:0; background:transparent; }
.view-tabs { gap:4px; margin:8px 0; border-bottom:1px solid #E6EAE1; }
.view-tabs .ew-link { flex:1; min-width:0; margin:0; font-size:0.875em; color:#56645B; }
.view-tabs .active { color:#28634E; border-bottom:2px solid #28634E; border-radius:0; }
.view-count { margin-bottom:8px; font-size:0.8125em; }
.preview-ingredients { background:#FFFFFF; }
.preview-dish-group { border-bottom:1px solid #E6EAE1; }
.shopping-preview-page .dish-header { display:flex; align-items:center; gap:8px; width:100%; margin:0; padding:8px 0; text-align:left; background:transparent; font-size:1em; line-height:1.5; white-space:normal; }
.dish-header .ew-grow { flex:1; min-width:0; overflow-wrap:anywhere; }
.dish-header .ew-muted { font-size:0.8125em; }
.dish-chevron { flex:0 0 auto; }.dish-chevron.expanded { transform:rotate(90deg); }
.source-item { border-bottom:1px solid #E6EAE1; padding:8px 0; overflow-wrap:anywhere; }
.source-actions { display:flex; flex-wrap:wrap; align-items:center; gap:4px; }.source-actions .ew-grow { flex:1; min-width:0; }.source-actions .ew-link { padding:0 4px; margin:0; font-size:0.875em; }
.preparation-hint { display:block; margin:12px 0; font-size:0.8125em; }
.preview-bottom > ui-button { width:100%; flex:1; min-width:0; }
.shopping-preview-page { padding-bottom:calc(176px + env(safe-area-inset-bottom)); }
.shopping-preview-page .ew-heading { font-size:1.5em; }
