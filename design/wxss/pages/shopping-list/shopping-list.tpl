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
