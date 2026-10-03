@import "../../styles/theme.wxss";
page { min-height: 100%; background: {{background}}; color: {{text}}; }
button::after { border: none; }
.page { min-height: 100vh; padding: 28rpx 24rpx 48rpx; box-sizing: border-box; }
.heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24rpx; }
.title { display: block; font-size:1.4286em; font-weight: 700; }
.subtitle { display: block; color: {{muted}}; font-size:0.8571em; margin-top: 8rpx; }
.refresh, .retry { background: {{brand}}; color: {{card}}; border-radius: 10rpx; min-height: 72rpx; padding: 0 24rpx; font-size:0.8929em; }
.notice { background: {{brandSoft}}; color: {{brand}}; padding: 16rpx 18rpx; border-radius: 8rpx; margin-bottom: 16rpx; font-size:0.8571em; }
.state, .empty { min-height: 240rpx; display: flex; flex-direction: column; justify-content: center; align-items: center; color: {{muted}}; gap: 20rpx; }
.metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12rpx; }
.metric { min-height: 140rpx; padding: 18rpx 12rpx; box-sizing: border-box; background: {{card}}; border: 2rpx solid {{border}}; border-radius: 12rpx; display: flex; flex-direction: column; justify-content: center; gap: 6rpx; color: {{muted}}; font-size:0.8571em; }
.metric-value { font-size:1.3571em; font-weight: 700; color: #26342d; }
.metric-value.green { color: {{brand}}; } .metric-value.amber { color: #a96d1d; }
.section-title { margin: 30rpx 0 14rpx; font-size:1.0em; font-weight: 650; }
.action-list, .audit-list { display: flex; flex-direction: column; gap: 10rpx; }
.action, .audit-row { background: {{card}}; border: 2rpx solid {{border}}; border-radius: 12rpx; padding: 20rpx; display: flex; align-items: center; justify-content: space-between; }
.action-title, .audit-action { display: block; font-size:1.0357em; font-weight: 650; }
.action text:not(.action-title), .audit-meta { display: block; margin-top: 8rpx; font-size:0.8571em; color: {{muted}}; }
.arrow { font-size:1.5em; color: {{muted}}; } .audit-target { color: {{muted}}; font-size:0.8571em; }

/* 页面共享主题，适用于本页详情、表单和弹层。 */

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:24rpx; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:44px; min-width:44px; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:44px;box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:48px}
