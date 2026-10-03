/* 家庭厨房主题；使用普通 WXSS 声明保持微信基础库兼容。 */
page { background: {{background}}; color: {{text}}; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size:14px; }
.ew-page { box-sizing: border-box; min-width: 0; color: {{text}}; }
.ew-screen { padding: 32rpx; padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); min-height: 100%; box-sizing: border-box; }
.ew-heading { font-size:1.7143em; font-weight: 700; line-height: 1.3; letter-spacing: 1rpx; }
.ew-title { font-size:1.1429em; font-weight: 600; line-height: 1.5; }
.ew-subtitle { display: block; font-size:0.9286em; line-height: 1.6; color: {{muted}}; margin-top: 12rpx; }
.ew-section-title { font-size:1.2857em; font-weight: 600; margin: 32rpx 0 20rpx; }
.ew-card { padding: 28rpx; border: 1rpx solid {{border}}; border-radius: 32rpx; background: {{card}}; margin-bottom: 24rpx; box-sizing: border-box; }
.ew-row { display: flex; align-items: center; gap: 16rpx; }
.ew-between { display: flex; align-items: center; gap: 16rpx; justify-content: space-between; }
.ew-wrap { flex-wrap: wrap; }
.ew-grow { flex: 1; min-width: 0; }
.ew-muted { color: {{muted}}; font-size:0.9286em; line-height: 1.6; }
.ew-link { color: {{brand}}; min-height: 44px; display: inline-flex; align-items: center; font-weight: 600; }
.ew-button { min-height: 48px; border-radius: 24rpx; padding: 20rpx 28rpx; font-size:1.0em; font-weight: 600; line-height: 1.4; background: {{brand}}; color: {{card}}; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
.ew-button::after { border: 0; }
.ew-button.secondary { background: {{brandSoft}}; color: {{brand}}; }
.ew-button.danger { background: {{dangerSoft}}; color: {{danger}}; }
.ew-button[disabled] { background: {{disabled}}; color: #7d867d; }
.ew-actions { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 24rpx; }
.ew-actions button { margin: 0; flex: 1; min-width: 180rpx; }
.ew-pill { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 28rpx; border-radius: 44rpx; background: #edf1e9; color: {{muted}}; box-sizing: border-box; }
.ew-pill.active { background: {{brand}}; color: {{card}}; }
.ew-tabs { display: flex; gap: 12rpx; margin: 24rpx 0; }
.ew-tabs .ew-pill { flex: 1; }
.ew-tabs button { flex: 1; margin: 0; padding: 16rpx 12rpx; font-size:1.0em; line-height: 1.4; border-radius: 24rpx; background: #edf1e9; color: {{muted}}; }
.ew-tabs button.active { background: {{brand}}; color: {{card}}; }
.ew-field { margin: 24rpx 0; }
.ew-label { display: block; font-size:1.0em; font-weight: 600; margin-bottom: 12rpx; }
.ew-input { background: #f5f6f0; border: 1rpx solid {{border}}; border-radius: 20rpx; padding: 20rpx 24rpx; min-height: 44px; box-sizing: border-box; font-size:1.0em; color: {{text}}; width: 100%; }
textarea.ew-input { min-height: 200rpx; }
.ew-error { color: {{danger}}; background: {{dangerSoft}}; padding: 20rpx 24rpx; border-radius: 20rpx; font-size:0.9286em; line-height: 1.6; margin: 16rpx 0; }
.ew-notice { background: {{warningSoft}}; color: {{warning}}; padding: 20rpx 24rpx; border-radius: 20rpx; font-size:0.9286em; line-height: 1.6; margin: 16rpx 0; }
.ew-chip { background: {{brandSoft}}; color: {{brand}}; border-radius: 12rpx; padding: 8rpx 14rpx; font-size:0.8571em; display: inline-block; }
.ew-small { font-size:0.8571em; }
.ew-divider { height: 1rpx; background: {{border}}; margin: 24rpx 0; }
.ew-bottom { padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: {{background}}; border-top: 1rpx solid {{border}}; box-sizing: border-box; }
.ew-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20rpx; }
.ew-number { font-size:1.7143em; font-weight: 700; color: {{brand}}; }
.ew-mask { position: fixed; inset: 0; background: rgba(25,40,30,.45); z-index: 100; display: flex; align-items: flex-end; }
.ew-sheet { background: {{card}}; border-radius: 36rpx 36rpx 0 0; width: 100%; padding: 36rpx 32rpx calc(32rpx + env(safe-area-inset-bottom)); box-sizing: border-box; max-height: 85vh; overflow-y: auto; }
.ew-image { width: 100%; height: 240rpx; background: #edf1e9; border-radius: 24rpx; }

/* 共用旧页面布局选择器，保留各业务页面的排版责任。 */
.mobile-screen { background: {{background}}; }
.card, .state-block, .user-card, .params-card { border-color: {{border}}; border-radius: 32rpx; }
.btn-primary, .primary-btn, .save-btn, .primary-action { background: {{brand}}; color: {{card}}; min-height: 44px; border-radius: 24rpx; }
.empty-state, .empty-box { color: {{muted}}; }
.line-icon { color: currentColor; }
button { min-height: 44px; }
button::after { border: 0; }

.ew-actions ui-button { flex: 1; min-width: 180rpx; }
.choice-chip, .ingredient-chip, .filter-chip, .count-btn, .clear-btn, .period-nav, .date-picker { min-height:44px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; }
.ew-page input { min-height:44px; }
.ew-page text, .ew-page .ew-heading, .ew-page .ew-title { overflow-wrap:break-word; }
.ew-page .line-icon { color:{{brand}}; }
