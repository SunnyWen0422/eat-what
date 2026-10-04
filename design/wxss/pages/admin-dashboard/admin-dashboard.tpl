@import "../../styles/theme.wxss";
page { min-height: 100%; background: {{background}}; color: {{text}}; }
button::after { border: none; }
.page { min-height: 100vh; padding:{{space.2.rpx*1.1666667}} {{space.2.rpx}} {{space.5.rpx}}; box-sizing: border-box; }
.heading { display: flex; justify-content: space-between; align-items: center; margin-bottom:{{space.2.rpx}}; }
.title { display: block; font-size:{{font.section.em}}; font-weight: 700; }
.subtitle { display: block; color: {{muted}}; font-size:{{font.caption.em}}; margin-top:{{space.0.rpx}}; }
.refresh, .retry { background: {{brand}}; color: {{card}}; border-radius:{{radius.0.rpx*0.83333333}}; min-height: 72rpx; padding:0 {{space.2.rpx}}; font-size:{{font.secondary.em}}; }
.notice { background: {{brandSoft}}; color: {{brand}}; padding:{{space.1.rpx}} {{space.1.rpx*1.125}}; border-radius:{{radius.0.rpx*0.66666667}}; margin-bottom:{{space.1.rpx}}; font-size:{{font.caption.em}}; }
.state, .empty { min-height: 240rpx; display: flex; flex-direction: column; justify-content: center; align-items: center; color: {{muted}}; gap:{{space.1.rpx*1.25}}; }
.metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:{{space.0.rpx*1.5}}; }
.metric { min-height: 140rpx; padding:{{space.1.rpx*1.125}} {{space.0.rpx*1.5}}; box-sizing: border-box; background: {{card}}; border: 2rpx solid {{border}}; border-radius:{{radius.0.rpx}}; display: flex; flex-direction: column; justify-content: center; gap:{{space.0.rpx*0.75}}; color: {{muted}}; font-size:{{font.caption.em}}; }
.metric-value { font-size:{{font.section.em}}; font-weight: 700; color:{{text}}; }
.metric-value.green { color: {{brand}}; } .metric-value.amber { color:{{warning}}; }
.section-title { margin:{{space.3.rpx*0.9375}} 0 {{space.1.rpx*0.875}}; font-size:{{font.body.em}}; font-weight: 650; }
.action-list, .audit-list { display: flex; flex-direction: column; gap:{{space.0.rpx*1.25}}; }
.action, .audit-row { background: {{card}}; border: 2rpx solid {{border}}; border-radius:{{radius.0.rpx}}; padding:{{space.1.rpx*1.25}}; display: flex; align-items: center; justify-content: space-between; }
.action-title, .audit-action { display: block; font-size:{{font.body.em}}; font-weight: 650; }
.action text:not(.action-title), .audit-meta { display: block; margin-top:{{space.0.rpx}}; font-size:{{font.caption.em}}; color: {{muted}}; }
.arrow { font-size:{{font.page.em}}; color: {{muted}}; } .audit-target { color: {{muted}}; font-size:{{font.caption.em}}; }

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
