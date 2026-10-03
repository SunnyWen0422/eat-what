@import "../../styles/theme.wxss";
.period { gap:8rpx; font-size:0.8571em; color:{{muted}}; margin-bottom:24rpx; } .period-nav { width:88rpx; margin:0; background:{{brandSoft}}; color:{{brand}}; font-size:1.4286em; border-radius:20rpx; padding:0; } .metrics .ew-card { margin-bottom:0; } .metric-label { display:block; margin-top:12rpx; color:{{muted}}; font-size:0.9286em; } .metrics { margin:24rpx 0; } .bar-row { display:flex; align-items:center; gap:16rpx; min-height:64rpx; font-size:0.8571em; } .bar-row>text:first-child { width:90rpx; } .bar-track { height:16rpx; border-radius:8rpx; background:{{brandSoft}}; flex:1; overflow:hidden; } .bar-fill { height:100%; background:{{brand}}; border-radius:8rpx; } .ranking { padding:20rpx 0; border-bottom:1rpx solid {{brandSoft}}; } .record { border-bottom:1rpx solid {{border}}; padding:24rpx 0; } .record>text { display:block; line-height:1.6; }

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:24rpx; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:44px; min-width:44px; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:44px;box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:48px}
