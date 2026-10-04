@import "../../styles/theme.wxss";
page { min-height: 100%; background: {{background}}; color: {{text}}; }
button::after { border: none; }
.page { min-height: 100vh; padding:{{space.2.rpx}}; box-sizing: border-box; }
.heading { min-height: 78rpx; display: flex; align-items: baseline; gap:{{space.1.rpx*0.875}}; }
.title { font-size:{{font.section.em}}; font-weight: 700; }
.count { color:{{muted}}; font-size:{{font.caption.em}}; }
.search { display: grid; grid-template-columns: minmax(0, 1fr) 112rpx; gap:{{space.0.rpx*1.25}}; margin-bottom:{{space.0.rpx*1.25}}; }
.search input { min-width: 0; height: 82rpx; padding:0 {{space.1.rpx*1.125}}; box-sizing: border-box; background: {{card}}; border: 2rpx solid #dbe3de; border-radius:{{radius.0.rpx*0.83333333}}; font-size:{{font.secondary.em}}; }
.search-btn, .primary, .more { background: {{brand}}; color: {{card}}; border-radius:{{radius.0.rpx*0.83333333}}; min-height: 82rpx; font-size:{{font.secondary.em}}; }
.clear { width: 100%; min-height: 60rpx; margin:0 0 {{space.0.rpx*1.5}}; background: transparent; color:{{muted}}; font-size:{{font.caption.em}}; }
.notice { padding:{{space.1.rpx*0.875}} {{space.1.rpx}}; color: {{brand}}; background: {{brandSoft}}; border-radius:{{radius.0.rpx*0.66666667}}; font-size:{{font.caption.em}}; margin-bottom:{{space.1.rpx*0.875}}; }
.state { min-height: 300rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; color: {{muted}}; gap:{{space.1.rpx*1.25}}; }
.list { display: flex; flex-direction: column; gap:{{space.0.rpx*1.5}}; }
.card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap:{{space.0.rpx*1.5}}; align-items: center; padding:{{space.1.rpx*1.25}}; background: {{card}}; border: 2rpx solid {{border}}; border-radius:{{radius.0.rpx}}; }
.main { min-width: 0; } .row { display: flex; align-items: center; gap:{{space.0.rpx*1.25}}; }
.name { font-size:{{font.body.em}}; font-weight: 650; word-break: break-word; }
.badge { padding:{{space.0.rpx*0.625}} {{space.0.rpx*1.25}}; border-radius:{{radius.0.rpx*0.58333333}}; font-size:{{font.caption.em}}; }
.badge.on { color: {{brand}}; background: {{brandSoft}}; } .badge.off { color: {{warning}}; background: {{warningSoft}}; }
.meta { display: block; margin-top:{{space.0.rpx*0.875}}; color: {{muted}}; font-size:{{font.caption.em}}; word-break: break-word; }
.status-btn { min-width: 92rpx; padding:0 {{space.0.rpx*1.5}}; min-height: 62rpx; border: 2rpx solid #d6e1db; color: {{brand}}; background: #f4faf6; border-radius:{{radius.0.rpx*0.66666667}}; font-size:{{font.caption.em}}; }
.more { margin-top:{{space.0.rpx*0.75}}; } .end { padding:{{space.2.rpx}}; text-align: center; color: {{muted}}; font-size:{{font.caption.em}}; }

/* 页面共享主题，适用于本页详情、表单和弹层。 */

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
