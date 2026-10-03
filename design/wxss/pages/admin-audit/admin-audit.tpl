@import "../../styles/theme.wxss";
page { min-height: 100%; background: {{background}}; color: {{text}}; } button::after { border: none; }
.page { min-height: 100vh; padding: 24rpx; box-sizing: border-box; } .heading { min-height: 78rpx; display: flex; align-items: baseline; gap: 14rpx; } .title { font-size:1.3571em; font-weight: 700; } .count { color: {{muted}}; font-size:0.8571em; }
.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 10rpx; } .filters picker view, .filters input { min-width: 0; min-height: 76rpx; padding: 0 15rpx; box-sizing: border-box; display: flex; align-items: center; background: {{card}}; border: 2rpx solid {{border}}; border-radius: 9rpx; color: {{muted}}; font-size:0.8571em; } .buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10rpx; margin: 12rpx 0 16rpx; } .buttons button, .more, .primary { min-height: 76rpx; margin: 0; background: {{card}}; color: {{text}}; border-radius: 9rpx; font-size:0.8571em; } .buttons .primary, .primary, .more { color: {{card}}; background: {{brand}}; }
.notice { padding: 14rpx 16rpx; margin-bottom: 14rpx; color: {{brand}}; background: {{brandSoft}}; border-radius: 8rpx; font-size:0.8571em; } .state { min-height: 280rpx; display: flex; flex-direction: column; justify-content: center; align-items: center; color: {{muted}}; gap: 18rpx; } .list { display: flex; flex-direction: column; gap: 12rpx; } .log { padding: 19rpx; background: {{card}}; border: 2rpx solid {{border}}; border-radius: 12rpx; } .log-top { display: flex; justify-content: space-between; align-items: center; gap: 12rpx; } .action { min-width: 0; font-size:0.9643em; font-weight: 650; word-break: break-word; } .result { padding: 5rpx 9rpx; border-radius: 7rpx; font-size:0.8571em; } .result.ok { color: {{brand}}; background: {{brandSoft}}; } .result.bad { color: {{danger}}; background: {{dangerSoft}}; } .meta, .detail, .time { display: block; margin-top: 8rpx; color: {{muted}}; font-size:0.8571em; line-height: 1.45; word-break: break-word; } .detail { color: {{text}}; } .time { color: {{muted}}; font-size:0.8571em; } .more { margin-top: 4rpx; } .end { padding: 22rpx; text-align: center; color: {{muted}}; font-size:0.8571em; }

/* 页面共享主题，适用于本页详情、表单和弹层。 */

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:24rpx; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:44px; min-width:44px; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:44px;box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:48px}
