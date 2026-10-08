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

/* Warm table v2: task containers, continuous lists and restrained controls. */
.ew-page { color:{{text}}; background:{{background}}; padding:{{space.3.px}}; }
.ew-heading { font-size:{{font.page.em}}; line-height:1.35; font-weight:600; letter-spacing:0; }
.ew-title { font-size:{{font.card.em}}; line-height:1.5; font-weight:600; }
.ew-section-title { font-size:{{font.section.em}}; line-height:1.5; font-weight:600; }
.ew-subtitle { margin-top:{{space.1.px}}; color:{{muted}}; font-size:{{font.secondary.em}}; line-height:1.6; }
.ew-card { background:{{card}}; border:0; border-radius:{{radius.3.px}}; box-shadow:none; padding:{{space.3.px}}; margin:{{space.3.px}} 0; }
.ew-reading { font-size:{{font.reading.em}}; line-height:1.65; }
.ew-row,.ew-between { min-width:0; }
.ew-link { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; background:transparent; padding:0 {{space.0.px}}; margin:0; font-size:{{font.secondary.em}}; font-weight:500; line-height:1.5; }
.ew-button { border-radius:{{radius.2.px}}; min-height:{{controls.primaryHeight.px}}; padding:{{space.2.px}} {{space.3.px}}; flex-shrink:0; }
.ew-button.secondary { border:1px solid {{border}}; background:{{card}}; min-height:{{controls.secondaryHeight.px}}; }
.ew-button.tertiary { background:transparent; color:{{brand}}; min-height:{{controls.secondaryHeight.px}}; }
.ew-tabs { flex-wrap:wrap; gap:{{space.0.px}}; }
.ew-tabs button { flex:0 1 auto; min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; border-radius:{{radius.1.px}}; background:transparent; color:{{muted}}; padding:{{space.1.px}} {{space.2.px}}; }
.ew-tabs button.active { background:{{brandSoft}}; color:{{brand}}; font-weight:600; }
.ew-input { background:{{card}}; border:1px solid {{controlBorder}}; border-radius:{{radius.2.px}}; font-size:{{font.reading.em}}; line-height:1.5; }
.ew-notice,.ew-error { border-radius:{{radius.1.px}}; }
.ew-pill { background:transparent; border-radius:{{radius.1.px}}; min-width:{{controls.touchSize.px}}; color:{{brand}}; font-size:{{font.body.em}}; }
.ew-bottom { flex-shrink:0; padding:{{space.2.px}} {{space.3.px}} calc({{space.2.px}} + env(safe-area-inset-bottom)); border-top:1px solid {{divider}}; }
.ew-actions { gap:{{space.1.px}}; }
.ew-actions ui-button { min-width:{{controls.touchSize.px}}; }
.ew-flat-list { background:transparent; }
.ew-flat-row { min-height:{{controls.touchSize.px}}; padding:{{space.3.px}} 0; border-bottom:1px solid {{divider}}; }
.ew-toolbar { display:flex; align-items:center; gap:{{space.1.px}}; flex-wrap:wrap; padding:{{space.1.px}} 0; }
.ew-actions .ew-link { flex:0 1 auto; min-width:{{controls.touchSize.px}}; }
.ew-page button[disabled] { background:{{disabled}}; color:{{text}}; }
.ew-page .ew-link[disabled] { background:transparent; color:{{muted}}; }
.ew-display { font-size:{{font.display.em}}; line-height:1.35; font-weight:600; }

.rotate-right { display:inline-flex; transform:rotate(180deg); }.picker-chevron { display:inline-flex; transform:rotate(90deg); margin-left:6px; }.ew-page .period > text { flex:1; min-width:0; text-align:center; line-height:1.5; }

/* Shared admin density: preserve permission and destructive-action contracts. */
.ew-page.admin-workspace { padding:20px 16px 28px; background:{{background}}; }
.ew-page.admin-workspace .title, .ew-page.admin-workspace .page-title { font-size:{{font.page.em}}; color:{{text}}; line-height:1.4; }
.ew-page.admin-workspace .heading, .ew-page.admin-workspace .page-heading { gap:12px; align-items:flex-start; margin-bottom:16px; }
.ew-page.admin-workspace .metric-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.ew-page.admin-workspace .metric { background:{{warmSoft}}; border:0; border-radius:16px; padding:16px; }
.ew-page.admin-workspace .metric-value { font-size:{{font.display.em}}; color:{{text}}; line-height:1.4; }
.ew-page.admin-workspace .list, .ew-page.admin-workspace .user-list, .ew-page.admin-workspace .action-list, .ew-page.admin-workspace .audit-list { gap:0; background:{{card}}; border-radius:16px; overflow:hidden; }
.ew-page.admin-workspace .user, .ew-page.admin-workspace .user-card, .ew-page.admin-workspace .dish, .ew-page.admin-workspace .dish-card, .ew-page.admin-workspace .action, .ew-page.admin-workspace .log, .ew-page.admin-workspace .audit-row { padding:16px; margin:0; border:0; border-bottom:1px solid {{divider}}; border-radius:0; box-shadow:none; background:{{card}}; gap:12px; }
.ew-page.admin-workspace .user-main, .ew-page.admin-workspace .main, .ew-page.admin-workspace .dish-main, .ew-page.admin-workspace .dish-content { flex:1; min-width:0; }
.ew-page.admin-workspace .meta, .ew-page.admin-workspace .user-meta, .ew-page.admin-workspace .ingredients, .ew-page.admin-workspace .detail, .ew-page.admin-workspace .time { font-size:{{font.body.em}}; line-height:1.7; overflow-wrap:anywhere; }
.ew-page.admin-workspace .action-title, .ew-page.admin-workspace .user-name, .ew-page.admin-workspace .dish-name { font-size:{{font.reading.em}}; line-height:1.5; overflow-wrap:anywhere; }
.ew-page.admin-workspace .search, .ew-page.admin-workspace .search-bar { display:flex; gap:8px; margin-bottom:14px; }
.ew-page.admin-workspace .search-field, .ew-page.admin-workspace .search input, .ew-page.admin-workspace .search-bar input { flex:1; min-width:0; }
.ew-page.admin-workspace .filters { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:16px; }
.ew-page.admin-workspace .filters picker, .ew-page.admin-workspace .filters input { min-width:0; width:100%; box-sizing:border-box; min-height:48px; padding:10px; border:1px solid {{controlBorder}}; border-radius:12px; background:{{card}}; overflow-wrap:anywhere; }
.ew-page.admin-workspace .types, .ew-page.admin-workspace .type-row { display:flex; flex-wrap:wrap; gap:8px; }
.ew-page.admin-workspace .types button, .ew-page.admin-workspace .type-row button { padding:10px 14px; min-height:44px; min-width:44px; border-radius:12px; }
.ew-page.admin-workspace button { font-size:{{font.body.em}}; line-height:1.5; min-width:44px; min-height:44px; border-radius:12px; height:auto; padding:10px 12px; }
.ew-page.admin-workspace button.primary, .ew-page.admin-workspace .primary-action, .ew-page.admin-workspace .save-button { min-height:48px; background:{{brand}}; color:{{card}}; border-radius:14px; }
.ew-page.admin-workspace button[disabled] { color:{{text}}; background:{{disabled}}; }
.ew-page.admin-workspace .form input, .ew-page.admin-workspace .form textarea, .ew-page.admin-workspace .form-page input, .ew-page.admin-workspace .form-page textarea { border:1px solid {{controlBorder}}; border-radius:12px; padding:12px; font-size:{{font.reading.em}}; line-height:1.7; width:100%; box-sizing:border-box; }
.ew-page.admin-workspace .summary, .ew-page.admin-workspace .user-summary { border:0; background:{{warmSoft}}; border-radius:18px; padding:16px; }
.ew-page.admin-workspace .badge, .ew-page.admin-workspace .status-badge { white-space:normal; line-height:1.5; flex-shrink:0; }
.ew-page.admin-workspace .state, .ew-page.admin-workspace .state-block { min-height:160px; border:0; border-radius:16px; line-height:1.7; }

.ew-page.admin-workspace .filters picker, .ew-page.admin-workspace .filters input { min-width:44px; }

/* Native v2 button defaults must not impose a fixed width on our controls. */
.ew-page button.ew-hit-target { width:auto; max-width:100%; margin:0; font-family:inherit; font-weight:500; }
.ew-page button.ew-link { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:8px 12px; background:{{card}}; border:1px solid {{controlBorder}}; border-radius:10px; color:{{brand}}; font-size:{{font.body.em}}; line-height:1.45; flex-shrink:0; }
.ew-page button.ew-link.danger { color:{{danger}}; border-color:{{danger}}; background:{{dangerSoft}}; }
.ew-page button.ew-text-link { background:transparent; border-color:transparent; text-decoration:underline; text-underline-offset:3px; }
.ew-page button.ew-link[disabled] { background:{{disabled}}; color:{{muted}}; border-color:{{border}}; }
.ew-page .ew-tabs { display:flex; flex-wrap:wrap; gap:4px; padding:4px; border:1px solid {{border}}; border-radius:12px; background:{{surfaceSoft}}; }
.ew-page .ew-tabs button.ew-hit-target { flex:1; min-width:44px; padding:8px 10px; background:transparent; color:{{muted}}; font-size:{{font.body.em}}; border:1px solid transparent; line-height:1.45; }
.ew-page .ew-tabs button.active { background:{{card}}; border-color:{{controlBorder}}; color:{{brand}}; font-weight:600; }
.ew-page .ew-heading { font-size:{{font.page.em}}; line-height:1.3; }
.ew-page .ew-between > view:first-child { min-width:0; flex:1; }


.ew-page button.period-nav { width:44px; max-width:44px; flex:0 0 44px; padding:10px; border:1px solid {{border}}; border-radius:10px; background:{{card}}; }
.ew-page .period { gap:8px; }
.ew-page .period > text { font-size:{{font.body.em}}; }
.ew-page text.ew-link { text-decoration:underline; text-underline-offset:3px; }
.ew-page.admin-workspace .heading > view { flex:1; min-width:0; }
.ew-page.admin-workspace button.refresh,.ew-page.admin-workspace button.search-btn,.ew-page.admin-workspace .section-head button.add { flex:0 0 auto; width:auto; max-width:88px; padding:10px 16px; }
.ew-page.admin-workspace .search input { border:1px solid {{controlBorder}}; border-radius:12px; }
.ew-page.admin-workspace .filters picker > view { border:0; padding:0; }
