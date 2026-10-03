@import "../../styles/theme.wxss";
page { min-height: 100%; background: {{background}}; color: {{text}}; }
button::after { border: none; }
.page { min-height: 100vh; padding: 24rpx; box-sizing: border-box; }
.heading { min-height: 78rpx; display: flex; align-items: baseline; gap: 14rpx; }
.title { font-size:1.3571em; font-weight: 700; }
.count { color: #768078; font-size:0.8571em; }
.search { display: grid; grid-template-columns: minmax(0, 1fr) 112rpx; gap: 10rpx; margin-bottom: 10rpx; }
.search input { min-width: 0; height: 82rpx; padding: 0 18rpx; box-sizing: border-box; background: {{card}}; border: 2rpx solid #dbe3de; border-radius: 10rpx; font-size:0.9286em; }
.search-btn, .primary, .more { background: {{brand}}; color: {{card}}; border-radius: 10rpx; min-height: 82rpx; font-size:0.8929em; }
.clear { width: 100%; min-height: 60rpx; margin: 0 0 12rpx; background: transparent; color: #637068; font-size:0.8571em; }
.notice { padding: 14rpx 16rpx; color: {{brand}}; background: {{brandSoft}}; border-radius: 8rpx; font-size:0.8571em; margin-bottom: 14rpx; }
.state { min-height: 300rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; color: {{muted}}; gap: 20rpx; }
.list { display: flex; flex-direction: column; gap: 12rpx; }
.card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12rpx; align-items: center; padding: 20rpx; background: {{card}}; border: 2rpx solid {{border}}; border-radius: 12rpx; }
.main { min-width: 0; } .row { display: flex; align-items: center; gap: 10rpx; }
.name { font-size:1.0357em; font-weight: 650; word-break: break-word; }
.badge { padding: 5rpx 10rpx; border-radius: 7rpx; font-size:0.8571em; }
.badge.on { color: {{brand}}; background: {{brandSoft}}; } .badge.off { color: {{warning}}; background: {{warningSoft}}; }
.meta { display: block; margin-top: 7rpx; color: {{muted}}; font-size:0.8571em; word-break: break-word; }
.status-btn { min-width: 92rpx; padding: 0 12rpx; min-height: 62rpx; border: 2rpx solid #d6e1db; color: {{brand}}; background: #f4faf6; border-radius: 8rpx; font-size:0.8571em; }
.more { margin-top: 6rpx; } .end { padding: 24rpx; text-align: center; color: {{muted}}; font-size:0.8571em; }

/* 页面共享主题，适用于本页详情、表单和弹层。 */

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:24rpx; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:44px; min-width:44px; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:44px;box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:48px}
