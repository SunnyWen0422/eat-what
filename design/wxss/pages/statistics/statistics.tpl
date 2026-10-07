@import "../../styles/theme.wxss";
.period { gap:{{space.0.rpx}}; font-size:{{font.caption.em}}; color:{{muted}}; margin-bottom:{{space.2.rpx}}; } .period-nav { width:88rpx; margin:0; background:{{brandSoft}}; color:{{brand}}; font-size:{{font.section.em}}; border-radius:{{radius.1.rpx}}; padding:0; } .metrics .ew-card { margin-bottom:0; } .metric-label { display:block; margin-top:{{space.0.rpx*1.5}}; color:{{muted}}; font-size:{{font.secondary.em}}; } .metrics { margin:{{space.2.rpx}} 0; } .bar-row { display:flex; align-items:center; gap:{{space.1.rpx}}; min-height:64rpx; font-size:{{font.caption.em}}; } .bar-row>text:first-child { width:90rpx; } .bar-track { height:16rpx; border-radius:{{radius.0.rpx*0.66666667}}; background:{{brandSoft}}; flex:1; overflow:hidden; } .bar-fill { height:100%; background:{{brand}}; border-radius:{{radius.0.rpx*0.66666667}}; } .ranking { padding:{{space.1.rpx*1.25}} 0; border-bottom:1rpx solid {{brandSoft}}; } .record { border-bottom:1rpx solid {{border}}; padding:{{space.2.rpx}} 0; } .record>text { display:block; line-height:1.6; }

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

/* Warm table v2: statistics */
 .metrics { gap:10px; margin:16px 0; }.metrics .ew-card { padding:16px; margin:0; background:{{warmSoft}}; }.ew-number { font-size:{{font.display.em}}; color:{{text}}; }.metric-label { font-size:{{font.body.em}}; line-height:1.5; }.bar-row { gap:8px; min-height:44px; }.bar-row > text:first-child { flex:0 0 4em; }.bar-track { min-width:0; background:{{surfaceSoft}}; height:8px; border-radius:8px; }.bar-fill { background:{{brand}}; height:8px; border-radius:8px; }.ranking { padding:12px 0; border-bottom:1px solid {{divider}}; gap:12px; }.record { padding:14px 0; border-bottom:1px solid {{divider}}; }.record > text { display:block; line-height:1.7; }.period { gap:8px; }.period > text { flex:1; min-width:0; text-align:center; line-height:1.5; }
