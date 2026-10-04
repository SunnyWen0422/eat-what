@import "../../styles/theme.wxss";
/* 结果页 */
.result-page {
  height: 100%;
}

/* ===== 骨架屏 ===== */
.skeleton-wrap { height: 100%; box-sizing: border-box; padding:{{space.3.px}}; }
.skeleton-plan { margin-bottom:{{space.4.px}}; }
.skeleton-dish {
  display: flex; gap:{{space.2.px}}; margin-bottom:{{space.2.px}};
  background: {{card}}; border-radius:{{radius.0.rpx*1.1666667}}; padding:{{space.2.px*1.1666667}};
}
.skeleton-img { width: 160rpx; height: 128rpx; border-radius:{{radius.0.rpx}}; background: {{border}}; flex-shrink: 0; }
.skeleton-text { flex: 1; display: flex; flex-direction: column; justify-content: center; gap:{{space.1.px*1.25}}; }
.bar { height: 18rpx; border-radius:{{radius.0.rpx*0.5}}; background: {{border}}; }
.w80 { width: 80%; } .w50 { width: 50%; }
.shimmer {
  animation: shimmer 1.5s infinite;
  background: linear-gradient(90deg, {{border}} 25%, {{background}} 50%, {{border}} 75%);
  background-size: 200% 100%;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ===== 空状态 ===== */
.empty-state {
  height: 100%; box-sizing: border-box; padding:{{space.6.px*1.5}} {{space.5.px}} calc({{space.5.px}} + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; align-items: center;
}
.empty-illustration { margin-bottom:{{space.4.px}}; color: {{brand}}; opacity: 0.72; }
.empty-illustration .line-icon { width: 78rpx; height: 78rpx; }
.empty-title { display: block; font-size:{{font.section.em}}; font-weight: bold; color: {{text}}; }
.empty-desc { display: block; font-size:{{font.secondary.em}}; color: {{muted}}; margin:{{space.1.px*1.25}} 0 {{space.6.px*0.9375}}; }
.empty-btn { background: {{brand}}; color: {{card}}; border-radius:{{radius.4.px}}; padding:{{space.1.px*1.25}} {{space.6.px*1.25}}; font-size:{{font.body.em}}; border: none; }

.recommend-context { margin:0 0 {{space.2.px}}; padding:{{space.1.px*1.25}} {{space.2.px}}; background: #edf7f2; border-left: 4rpx solid {{brand}}; word-break: break-word; }
.context-summary, .context-warning { display: block; font-size:{{font.caption.em}}; line-height: 1.5; }
.context-summary { color:{{brand}}; }
.context-warning { margin-top:{{space.0.rpx*0.5}}; color:{{warning}}; }
.empty-warning { max-width: 560rpx; margin:{{space.0.rpx}} auto; text-align: center; }

/* ===== Swiper ===== */
.results-content {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding-bottom:calc({{space.6.px*3.75}} + env(safe-area-inset-bottom));
}
.plan-swiper { flex: 1; height: 0; min-height: 0; width: 100%; }
.plan-wrap { padding:{{space.2.px}} {{space.3.px}} {{space.6.px}}; box-sizing: border-box; }
.plan-label { text-align: center; font-size:{{font.caption.em}}; color:{{muted}}; margin-bottom:{{space.1.px}}; }
.dish-scroll { height: 100%; box-sizing: border-box; }

/* ===== 菜品卡片 ===== */
.dish-card {
  display: flex; align-items: center;
  background: {{card}}; border: 1rpx solid {{border}}; border-radius:{{radius.0.rpx*1.1666667}};
  padding:{{space.2.px*1.1666667}}; margin-bottom:{{space.1.px*1.25}};
}
.dish-card:active { transform: scale(0.98); }

.dish-media { position: relative; width: 160rpx; height: 128rpx; flex: 0 0 auto; overflow: hidden; border-radius:{{radius.0.rpx}}; margin-right:{{space.2.px*1.1666667}}; background: #f2f7f5; }
.dish-img { width: 100%; height: 100%; display: block; background: #f2f7f5; }

.dish-img-placeholder { display: flex; align-items: center; justify-content: center; color:{{muted}}; }
.dish-img-placeholder .line-icon { width: 52rpx; height: 52rpx; }
.dish-photo-caption { position: absolute; left: 8rpx; bottom: 8rpx; padding:{{space.0.rpx*0.375}} {{space.0.rpx}}; border-radius:{{radius.4.rpx*20.8125}}; color: {{card}}; background: {{brand}}; font-size:{{font.caption.em}}; line-height: 1.2; }

.dish-body { flex: 1; min-width: 0; }
.dish-top { display: flex; align-items: flex-start; justify-content: space-between; }
.dish-name { font-size:{{font.body.em}}; font-weight: 600; color: {{text}}; line-height: 1.5; flex: 1; min-width: 0; word-break: break-word; }
.star-btn { color:{{muted}}; padding:0 {{space.0.px}}; flex-shrink: 0; }
.star-btn .line-icon { width: 36rpx; height: 36rpx; }
.star-btn.on { color:{{brand}}; }
.dish-tags { display: flex; flex-wrap: wrap; gap:{{space.0.px*1.5}}; margin:{{space.0.px*1.5}} 0; }
.tag { max-width: 100%; word-break: break-word; font-size:{{font.caption.em}}; color: {{brand}}; background: {{brandSoft}}; padding:{{space.0.rpx*0.25}} {{space.0.rpx*1.25}}; border-radius:{{radius.0.rpx*0.83333333}}; }
.dish-meta { display: flex; gap:{{space.2.px*1.1666667}}; flex-wrap: wrap; margin-top:{{space.0.px*0.5}}; }
.meta-item { display: inline-flex; align-items: center; gap:{{space.0.rpx*0.5}}; font-size:{{font.caption.em}}; color: {{muted}}; }
.meta-item .line-icon { width: 24rpx; height: 24rpx; color:{{muted}}; }
.refresh-btn { padding:{{space.0.px*1.5}}; flex-shrink: 0; margin-left:{{space.0.px}}; color: {{brand}}; }
.refresh-btn .line-icon { width: 30rpx; height: 30rpx; }

/* ===== 底部操作栏 ===== */
.bottom-actions {
  position: fixed; bottom: 0; left: 0; right: 0; box-sizing: border-box; width: 100%;
  display: flex; flex-wrap: wrap; gap:{{space.1.px*1.25}}; padding:{{space.2.px}} {{space.3.px}};
  padding-bottom:calc({{space.2.px}} + env(safe-area-inset-bottom));
  background: {{card}}; border-top: 1rpx solid {{background}};
  z-index: 50;
}
.act-btn { flex: 1 1 130px; min-width: 0; margin:0; font-size:{{font.body.em}}; border-radius:{{radius.0.rpx}}; height: {{controls.touchSize.px}}; line-height: {{controls.touchSize.px}}; padding:0 {{space.0.px*1.5}}; }
.act-back { background: {{background}}; color: {{muted}}; }
.act-regen { background: {{brandSoft}}; color: {{brand}}; border: 1rpx solid {{brand}}; }
.act-save { background: {{brand}}; color: {{card}}; font-weight: 600; }
.act-shopping { background: {{brandSoft}}; color: {{brand}}; }

/* ===== 日期选择器 ===== */
.date-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.45); z-index: 100;
  display: flex; align-items: center; justify-content: center;
}
.date-box { width: 86%; max-height: 90%; box-sizing: border-box; overflow-y: auto; background: {{card}}; border-radius:{{radius.3.px}}; padding:{{space.5.px}}; text-align: center; }
.date-title { font-size:{{font.card.em}}; font-weight: bold; color: {{text}}; display: block; margin-bottom:{{space.5.px}}; }
.date-btn { background: {{brand}}; color: {{card}}; border-radius:{{radius.0.rpx}}; padding:{{space.2.px*1.1666667}}; font-size:{{font.body.em}}; }
.date-cancel { margin-top:{{space.3.px}}; font-size:{{font.secondary.em}}; color: {{muted}}; }
.generation-status {
  min-height: 104rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-bottom:{{space.1.rpx*1.125}};
  padding:{{space.1.rpx*1.125}} {{space.2.rpx*0.91666667}};
  background: {{card}};
  border-left: 6rpx solid {{brand}};
  border-radius:{{radius.0.rpx*0.66666667}};
}

.generation-status-title,
.generation-status-subtitle {
  display: block;
  word-break: break-word;
}

.generation-status-title {
  color:{{text}};
  font-size:{{font.body.em}};
  font-weight: 600;
}

.generation-status-subtitle {
  margin-top:{{space.0.rpx*0.75}};
  color:{{muted}};
  font-size:{{font.caption.em}};
}

.generation-banner {
  min-height: 72rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  margin:0 {{space.2.rpx}} {{space.1.rpx}};
  padding:{{space.0.rpx*1.5}} {{space.1.rpx*1.125}};
  border-radius:{{radius.0.rpx*0.66666667}};
  font-size:{{font.caption.em}};
  line-height: 1.4;
  word-break: break-word;
}

.generation-banner.busy {
  color: {{brand}};
  background: {{brandSoft}};
}

.generation-banner.notice {
  color:{{brand}};
  background: {{warningSoft}};
}

/* 页面共享主题，适用于本页详情、表单和弹层。 */

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:{{radius.1.rpx*1.2}}; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:{{controls.touchSize.px}}; min-width:{{controls.touchSize.px}}; box-sizing:border-box; }

@import "../../styles/workspace.wxss";

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:{{controls.touchSize.px}};box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:{{controls.primaryHeight.px}}}

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }


button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
