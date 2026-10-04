@import "../../styles/theme.wxss";
page { min-height: 100%; background: {{background}}; color: {{text}}; } button::after { border: none; }
.page { min-height: 100vh; padding:{{space.2.rpx}}; box-sizing: border-box; } .heading { min-height: 78rpx; display: flex; align-items: baseline; gap:{{space.1.rpx*0.875}}; } .title { font-size:{{font.section.em}}; font-weight: 700; } .count { color: {{muted}}; font-size:{{font.caption.em}}; }
.filters { display: grid; grid-template-columns: 1fr 1fr; gap:{{space.0.rpx*1.25}}; } .filters picker view, .filters input { min-width: 0; min-height: 76rpx; padding:0 {{space.1.rpx*0.9375}}; box-sizing: border-box; display: flex; align-items: center; background: {{card}}; border: 2rpx solid {{border}}; border-radius:{{radius.0.rpx*0.75}}; color: {{muted}}; font-size:{{font.caption.em}}; } .buttons { display: grid; grid-template-columns: 1fr 1fr; gap:{{space.0.rpx*1.25}}; margin:{{space.0.rpx*1.5}} 0 {{space.1.rpx}}; } .buttons button, .more, .primary { min-height: 76rpx; margin:0; background: {{card}}; color: {{text}}; border-radius:{{radius.0.rpx*0.75}}; font-size:{{font.caption.em}}; } .buttons .primary, .primary, .more { color: {{card}}; background: {{brand}}; }
.notice { padding:{{space.1.rpx*0.875}} {{space.1.rpx}}; margin-bottom:{{space.1.rpx*0.875}}; color: {{brand}}; background: {{brandSoft}}; border-radius:{{radius.0.rpx*0.66666667}}; font-size:{{font.caption.em}}; } .state { min-height: 280rpx; display: flex; flex-direction: column; justify-content: center; align-items: center; color: {{muted}}; gap:{{space.1.rpx*1.125}}; } .list { display: flex; flex-direction: column; gap:{{space.0.rpx*1.5}}; } .log { padding:{{space.1.rpx*1.1875}}; background: {{card}}; border: 2rpx solid {{border}}; border-radius:{{radius.0.rpx}}; } .log-top { display: flex; justify-content: space-between; align-items: center; gap:{{space.0.rpx*1.5}}; } .action { min-width: 0; font-size:{{font.body.em}}; font-weight: 650; word-break: break-word; } .result { padding:{{space.0.rpx*0.625}} {{space.0.rpx*1.125}}; border-radius:{{radius.0.rpx*0.58333333}}; font-size:{{font.caption.em}}; } .result.ok { color: {{brand}}; background: {{brandSoft}}; } .result.bad { color: {{danger}}; background: {{dangerSoft}}; } .meta, .detail, .time { display: block; margin-top:{{space.0.rpx}}; color: {{muted}}; font-size:{{font.caption.em}}; line-height: 1.45; word-break: break-word; } .detail { color: {{text}}; } .time { color: {{muted}}; font-size:{{font.caption.em}}; } .more { margin-top:{{space.0.rpx*0.5}}; } .end { padding:{{space.2.rpx*0.91666667}}; text-align: center; color: {{muted}}; font-size:{{font.caption.em}}; }

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
