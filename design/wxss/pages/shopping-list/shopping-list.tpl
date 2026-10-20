@import "../../styles/theme.wxss";
.check { width:88rpx; height:88rpx; padding:0; flex-shrink:0; background:#F1F4ED; color:{{brand}}; font-size:{{font.section.em}}; border-radius:{{radius.4.rpx*0.91666667}}; }
.check.checked { background:{{brand}}; color:{{card}}; }
.item-row { display:flex; align-items:center; gap:{{space.0.rpx*1.5}}; padding:{{space.1.rpx*1.25}} 0; border-bottom:1rpx solid #E7ECE5; }
.item-row .ew-link { padding:0 {{space.0.rpx*1.25}}; }
.source { margin-top:{{space.1.rpx}}; white-space:normal; overflow-wrap:anywhere; }
.compact { min-width:112rpx; padding:0 {{space.1.rpx}}; }
.danger { color:{{danger}}; }

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:{{radius.1.rpx*1.2}}; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:{{controls.touchSize.px}}; min-width:{{controls.touchSize.px}}; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:{{controls.touchSize.px}};box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:{{controls.primaryHeight.px}}}

.quantity-warning { color:{{warning}}; background:{{warningSoft}}; padding:{{space.1.px}} {{space.2.px}}; margin-top:{{space.1.px}}; border-radius:{{radius.0.px}}; font-size:{{font.secondary.em}}; }

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }

/* Warm table v2: one ingredient, one readable row. */
.shopping-page { padding-bottom:calc(104px + env(safe-area-inset-bottom)); }
.shopping-row { background:{{card}}; padding:0 8px; border-bottom:1px solid {{divider}}; }
.shopping-row .ew-title { font-size:{{font.reading.em}}; }
.shopping-row .ew-row { align-items:flex-start; gap:10px; }
.shopping-row .ew-link { justify-content:flex-start; text-align:left; }
.check, .check.checked { width:44px; min-width:44px; height:44px; min-height:44px; padding:0; background:transparent; border-radius:10px; display:flex; align-items:center; justify-content:center; }
.check-box { width:24px; height:24px; border:1.5px solid {{controlBorder}}; border-radius:7px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; }
.check-box.selected { background:{{brandSoft}}; border-color:{{brand}}; color:{{brand}}; }
.ingredient-details { background:{{surfaceSoft}}; padding:12px; border-radius:12px; margin-top:8px; }
.ingredient-details text { display:block; overflow-wrap:anywhere; }
.cost-overview { background:{{warmSoft}}; border:0; padding:14px 16px; border-radius:16px; margin:12px 0; }
.cost-overview > text { font-size:{{font.reading.em}}; line-height:1.6; }
.shopping-bottom { display:flex; gap:10px; }.shopping-bottom > ui-button:first-child { flex:1; min-width:0; }
.item-row { flex-wrap:wrap; gap:6px; }.item-row .ew-grow { min-width:110px; }.item-row .ew-link { flex:0 0 auto; }

.shopping-bottom { position:fixed; left:0; right:0; bottom:0; z-index:35; background:{{background}}; border-top:1px solid {{divider}}; }

.shopping-page button.check { width:44px; max-width:44px; flex:0 0 44px; }
.shopping-page .ew-tabs { margin:12px 0; }
.shopping-page .shopping-bottom > ui-button { flex:1; min-width:0; }

.shopping-page button.compact { width:auto; max-width:80px; flex:0 0 auto; }

/* Compact source groups expand naturally at large font sizes. */
.view-count { margin:8px 0; }
.dish-group { background:{{card}}; margin:8px 0; border-radius:12px; overflow:hidden; }
.dish-header { display:flex; align-items:center; gap:8px; width:100%; padding:8px 12px; text-align:left; font-size:1em; line-height:1.5; background:transparent; }
.source-text { flex:1; min-width:0; white-space:normal; overflow-wrap:anywhere; }
.source-row { display:flex; flex-wrap:wrap; align-items:center; gap:4px; padding:4px 0; }
.row-result { color:{{brand}}; font-size:1em; padding:0 8px 4px; }
.just-checked { background:{{background}}; }

.dish-chevron { display:block; flex:0 0 auto; }
.dish-chevron.expanded { transform:rotate(90deg); }

/* Secondary view controls and source text reflow without reducing touch targets. */
.shopping-page > .ew-between { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.shopping-page > .ew-between > view { flex:1 1 180px; min-width:0; }
.shopping-page .ew-heading { font-size:1.5em; }
.shopping-page .ew-tabs { display:flex; flex-wrap:wrap; gap:4px; }
.shopping-page .ew-tabs button { min-width:0; flex:1 1 100px; margin:0; white-space:normal; font-size:0.875em; line-height:1.5; }
.shopping-page .quantity-warning { background:transparent; padding:0 8px 6px; margin-top:0; font-size:0.8125em; }
.shopping-page .dish-header { margin:0; white-space:normal; }
.shopping-page .view-count { font-size:0.8125em; }
.shopping-page button.dish-header { width:100%; max-width:100%; margin:0; font-family:inherit; font-weight:400; box-sizing:border-box; }

.shopping-costs { margin:12px 0 24px; padding:16px; border:1px solid {{border}}; border-radius:16px; background:{{card}}; }
.cost-totals { display:flex; flex-wrap:wrap; gap:8px 16px; padding:8px 0; }
.cost-row { display:flex; gap:8px; align-items:center; padding:12px 0; border-top:1px solid {{divider}}; }
.cost-row .ew-grow { min-width:0; flex:1; overflow-wrap:anywhere; }
.cost-row text { display:block; }
.cost-row button { flex:0 0 auto; max-width:45%; white-space:normal; }

.shopping-page .shopping-context { display:block; margin:4px 0 8px; padding:4px 0; text-align:left; font-size:0.875em; line-height:1.5; white-space:normal; overflow-wrap:anywhere; }
.shopping-page button.quantity-warning { display:block; margin:0; padding:0 8px; text-align:left; line-height:1.5; white-space:normal; overflow-wrap:anywhere; }
.shopping-page button.quantity-warning::after { border:0; }

/* Native font-2 evidence: keep labels whole and reserve the stacked footer. */
.shopping-page button.compact { max-width:none; white-space:nowrap; }
.shopping-page.shopping-large > .ew-between > view:first-child { flex:0 0 100%; width:100%; }
.shopping-large .shopping-bottom { flex-direction:column; align-items:stretch; }
.shopping-page.shopping-large .shopping-bottom > ui-button { flex:none; width:100%; }
.shopping-page.shopping-large { padding-bottom:calc(3em + 96px + env(safe-area-inset-bottom)); }

/* Keep state selection prominent and the secondary view switch quiet. */
.shopping-page .shopping-status-tabs button.active { background:{{brand}}; color:{{card}}; }
.shopping-page .shopping-view-tabs { padding:0; background:transparent; border:0; border-bottom:1px solid {{divider}}; border-radius:0; gap:16px; }
.shopping-page .shopping-view-tabs button.ew-hit-target { background:transparent; border:0; border-bottom:2px solid transparent; border-radius:0; }
.shopping-page .shopping-view-tabs button.active { border-bottom-color:{{brand}}; color:{{brand}}; }
.shopping-ingredients { background:{{card}}; border-radius:{{radius.3.px}}; overflow:hidden; padding:0 {{space.1.px}}; }

/* Compact shopping reading: no raw source/provenance in the primary rows. */
.shopping-page .shopping-row { padding:0; }
.shopping-page .shopping-delete-toggle { flex:0 0 auto; display:flex; align-items:center; justify-content:center; min-width:44px; min-height:44px; margin:0; padding:0 10px; border:0; border-radius:12px; background:{{brandSoft}}; color:{{brand}}; font-size:.875em; line-height:1.4; }
.shopping-delete-toggle.selected { background:{{brand}}; color:{{card}}; }
.shopping-page .shopping-context { display:flex; align-items:center; gap:8px; width:100%; min-height:44px; padding:6px 10px; margin:8px 0 12px; border-radius:10px; background:{{surfaceSoft}}; border:0; color:{{muted}}; font-size:.8125em; line-height:1.4; }
.context-primary { flex:1; min-width:0; text-align:left; }
.context-count { flex:0 0 auto; color:{{brand}}; }
.shopping-page .source-meal-choice { display:flex; align-items:center; gap:10px; width:100%; margin:0; padding:10px 0; text-align:left; border-radius:0; border-bottom:1px solid {{divider}}; background:transparent; font-size:.875em; line-height:1.4; }
.source-meal-date { flex:1; min-width:0; }
.source-meal-type { color:{{brand}}; font-size:.92857em; padding:5px 10px; border-radius:8px; background:{{brandSoft}}; }
.shopping-page .dish-header { font-size:.875em; padding:10px 12px; }
.dish-header .ew-muted { font-size:.92857em; }
.shopping-page .cost-toggle { display:flex; align-items:center; margin:8px 0 0; padding:0; background:transparent; font-size:.8125em; color:{{brand}}; }
.shopping-costs { padding:10px 12px; border:0; border-radius:14px; margin:4px 0 20px; }
.cost-totals { display:flex; flex-wrap:nowrap; gap:16px; padding:4px 0 8px; }
.cost-totals > view { flex:1; min-width:0; }
.cost-caption { display:block; font-size:.75em; color:{{muted}}; line-height:1.5; }
.cost-total-value { display:block; font-size:1.125em; font-weight:500; line-height:1.5; }
.cost-note { display:block; color:{{muted}}; font-size:.75em; line-height:1.45; margin-bottom:6px; }
.cost-row { gap:8px; padding:4px 0; min-height:44px; }
.cost-name { font-size:.875em; line-height:1.45; font-weight:400; }
.cost-reference { font-size:.75em; line-height:1.45; color:{{muted}}; }
.shopping-page .cost-row button { min-height:44px; margin:0; padding:0 10px; font-size:.8125em; line-height:1.4; background:{{brandSoft}}; }
.ingredient-details { margin:0 0 6px; padding:8px 10px; }
.source-row { font-size:.8125em; }
.source-row .ew-muted { font-size:1em; }
.shopping-page .source-row button { min-height:44px; font-size:1em; padding:0 6px; background:transparent; }

/* Paired purchase/delete actions share the same touch area and center line. */
.shopping-page > .shopping-header > .shopping-title { flex:1 1 150px; min-width:0; }
.shopping-page > .shopping-header > .shopping-header-actions { display:flex; flex:0 0 auto; align-items:center; gap:8px; }
.shopping-page .shopping-complete-toggle { display:flex; align-items:center; justify-content:center; flex:0 0 44px; width:44px; min-height:44px; padding:0; margin:0; border:0; border-radius:12px; background:{{brandSoft}}; color:{{brand}}; }
.shopping-complete-toggle[disabled] { opacity:.4; }
.purchase-icon { display:flex; align-items:center; justify-content:center; position:relative; width:26px; height:26px; }
.purchase-check { position:absolute; right:-3px; bottom:-2px; display:flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:50%; background:{{brandSoft}}; }

/* Delete mode uses the existing header action slot, without an extra toolbar. */
.shopping-page .shopping-clear-all { display:flex; align-items:center; justify-content:center; flex:0 0 auto; min-width:44px; min-height:44px; margin:0; padding:0 10px; border:0; border-radius:12px; background:{{dangerSoft}}; color:{{danger}}; font-size:.8125em; line-height:1.4; white-space:nowrap; }
.shopping-clear-all::after { border:0; }
.shopping-clear-all[disabled] { opacity:.4; }

.shopping-page > .shopping-header > view.shopping-title { flex:1 0 auto; white-space:nowrap; }
.shopping-page > .shopping-header > .shopping-header-actions { margin-left:auto; }
