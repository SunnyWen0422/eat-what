@import "../../styles/theme.wxss";
.avatar-btn { width:160rpx;height:160rpx;margin:0 0 {{space.1.rpx*1.25}};padding:0;border-radius:{{radius.4.rpx*1.6666667}};background:{{brandSoft}};display:flex;align-items:center;justify-content:center; }
.avatar-img { width:160rpx;height:160rpx; }
.avatar-placeholder { color:{{brand}};font-size:{{font.page.em*1.00001}}; }

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

/* Warm table v2: profile-edit */
 .avatar-btn { width:88px; height:88px; min-width:88px; min-height:88px; padding:0; margin:0 auto 12px; border-radius:26px; background:{{warmSoft}}; }.avatar-img, .avatar-placeholder { width:88px; height:88px; border-radius:26px; }.avatar-placeholder { display:flex; align-items:center; justify-content:center; font-size:{{font.display.em}}; color:{{warm}}; }.ew-card { border:0; padding:20px 16px; }.ew-field { margin-top:24px; }.ew-actions { gap:12px; margin-top:24px; }

.ew-page button.avatar-btn { width:88px; max-width:88px; height:88px; padding:0; border-radius:24px; margin:4px auto 16px; }
