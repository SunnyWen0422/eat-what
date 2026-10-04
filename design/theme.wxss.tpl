/* 家庭厨房主题；使用普通 WXSS 声明保持微信基础库兼容。 */
page { background: {{background}}; color: {{text}}; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size:{{font.body.px}}; }
.ew-page { box-sizing: border-box; min-width: 0; color: {{text}}; }
.ew-screen { padding:{{space.3.rpx}}; padding-bottom:calc({{space.4.rpx}} + env(safe-area-inset-bottom)); min-height: 100%; box-sizing: border-box; }
.ew-heading { font-size:{{font.page.em*1.00001}}; font-weight: 700; line-height: 1.3; letter-spacing:{{space.0.rpx*0.125}}; }
.ew-title { font-size:{{font.card.em}}; font-weight: 600; line-height: 1.5; }
.ew-subtitle { display: block; font-size:{{font.secondary.em}}; line-height: 1.6; color: {{muted}}; margin-top:{{space.0.rpx*1.5}}; }
.ew-section-title { font-size:{{font.section.em}}; font-weight: 600; margin:{{space.3.rpx}} 0 {{space.1.rpx*1.25}}; }
.ew-card { padding:{{space.2.rpx*1.1666667}}; border: 1rpx solid {{border}}; border-radius:{{radius.2.rpx*1.1428571}}; background: {{card}}; margin-bottom:{{space.2.rpx}}; box-sizing: border-box; }
.ew-row { display: flex; align-items: center; gap:{{space.1.rpx}}; }
.ew-between { display: flex; align-items: center; gap:{{space.1.rpx}}; justify-content: space-between; }
.ew-wrap { flex-wrap: wrap; }
.ew-grow { flex: 1; min-width: 0; }
.ew-muted { color: {{muted}}; font-size:{{font.secondary.em}}; line-height: 1.6; }
.ew-link { color: {{brand}}; min-height: {{controls.touchSize.px}}; display: inline-flex; align-items: center; font-weight: 600; }
.ew-button { min-height: {{controls.primaryHeight.px}}; border-radius:{{radius.1.rpx*1.2}}; padding:{{space.1.rpx*1.25}} {{space.2.rpx*1.1666667}}; font-size:{{font.body.em}}; font-weight: 600; line-height: 1.4; background: {{brand}}; color: {{card}}; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
.ew-button::after { border: 0; }
.ew-button.secondary { background: {{brandSoft}}; color: {{brand}}; }
.ew-button.danger { background: {{dangerSoft}}; color: {{danger}}; }
.ew-button[disabled] { background: {{disabled}}; color: {{text}}; }
.ew-actions { display: flex; flex-wrap: wrap; gap:{{space.1.rpx}}; margin-top:{{space.2.rpx}}; }
.ew-actions button { margin:0; flex: 1; min-width: 180rpx; }
.ew-pill { display: inline-flex; align-items: center; justify-content: center; min-height: {{controls.touchSize.px}}; padding:0 {{space.2.rpx*1.1666667}}; border-radius:{{radius.4.rpx*0.91666667}}; background: #edf1e9; color: {{muted}}; box-sizing: border-box; }
.ew-pill.active { background: {{brand}}; color: {{card}}; }
.ew-tabs { display: flex; gap:{{space.0.rpx*1.5}}; margin:{{space.2.rpx}} 0; }
.ew-tabs .ew-pill { flex: 1; }
.ew-tabs button { flex: 1; margin:0; padding:{{space.1.rpx}} {{space.0.rpx*1.5}}; font-size:{{font.body.em}}; line-height: 1.4; border-radius:{{radius.1.rpx*1.2}}; background: #edf1e9; color: {{muted}}; }
.ew-tabs button.active { background: {{brand}}; color: {{card}}; }
.ew-field { margin:{{space.2.rpx}} 0; }
.ew-label { display: block; font-size:{{font.body.em}}; font-weight: 600; margin-bottom:{{space.0.rpx*1.5}}; }
.ew-input { background: #f5f6f0; border: 1rpx solid {{border}}; border-radius:{{radius.1.rpx}}; padding:{{space.1.rpx*1.25}} {{space.2.rpx}}; min-height: {{controls.touchSize.px}}; box-sizing: border-box; font-size:{{font.body.em}}; color: {{text}}; width: 100%; }
textarea.ew-input { min-height: 200rpx; }
.ew-error { color: {{danger}}; background: {{dangerSoft}}; padding:{{space.1.rpx*1.25}} {{space.2.rpx}}; border-radius:{{radius.1.rpx}}; font-size:{{font.secondary.em}}; line-height: 1.6; margin:{{space.1.rpx}} 0; }
.ew-notice { background: {{warningSoft}}; color: {{warning}}; padding:{{space.1.rpx*1.25}} {{space.2.rpx}}; border-radius:{{radius.1.rpx}}; font-size:{{font.secondary.em}}; line-height: 1.6; margin:{{space.1.rpx}} 0; }
.ew-chip { background: {{brandSoft}}; color: {{brand}}; border-radius:{{radius.0.rpx}}; padding:{{space.0.rpx}} {{space.1.rpx*0.875}}; font-size:{{font.caption.em}}; display: inline-block; }
.ew-small { font-size:{{font.caption.em}}; }
.ew-divider { height: 1rpx; background: {{border}}; margin:{{space.2.rpx}} 0; }
.ew-bottom { padding:{{space.1.rpx*1.25}} {{space.3.rpx}} calc({{space.1.rpx*1.25}} + env(safe-area-inset-bottom)); background: {{background}}; border-top: 1rpx solid {{border}}; box-sizing: border-box; }
.ew-grid { display: grid; grid-template-columns: 1fr 1fr; gap:{{space.1.rpx*1.25}}; }
.ew-number { font-size:{{font.page.em*1.00001}}; font-weight: 700; color: {{brand}}; }
.ew-mask { position: fixed; inset: 0; background: rgba(25,40,30,.45); z-index: 100; display: flex; align-items: flex-end; }
.ew-sheet { background: {{card}}; border-radius:{{radius.3.rpx}} {{radius.3.rpx}} 0 0; width: 100%; padding:{{space.3.rpx*1.125}} {{space.3.rpx}} calc({{space.3.rpx}} + env(safe-area-inset-bottom)); box-sizing: border-box; max-height: 85vh; overflow-y: auto; }
.ew-image { width: 100%; height: 240rpx; background: #edf1e9; border-radius:{{radius.1.rpx*1.2}}; }

/* 共用旧页面布局选择器，保留各业务页面的排版责任。 */
.mobile-screen { background: {{background}}; }
.card, .state-block, .user-card, .params-card { border-color: {{border}}; border-radius:{{radius.2.rpx*1.1428571}}; }
.btn-primary, .primary-btn, .save-btn, .primary-action { background: {{brand}}; color: {{card}}; min-height: {{controls.touchSize.px}}; border-radius:{{radius.1.rpx*1.2}}; }
.empty-state, .empty-box { color: {{muted}}; }
.line-icon { color: currentColor; }
button { min-height: {{controls.touchSize.px}}; }
button::after { border: 0; }

.ew-actions ui-button { flex: 1; min-width: 180rpx; }
.choice-chip, .ingredient-chip, .filter-chip, .count-btn, .clear-btn, .period-nav, .date-picker { min-height:{{controls.touchSize.px}}; box-sizing:border-box; display:flex; align-items:center; justify-content:center; }
.ew-page input { min-height:{{controls.touchSize.px}}; }
.ew-page text, .ew-page .ew-heading, .ew-page .ew-title { overflow-wrap:break-word; }
.ew-page .line-icon { color:{{brand}}; }

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
