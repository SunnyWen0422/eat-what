@import "../../styles/theme.wxss";
/* pages/about/about.wxss */

.about-page {
  background-color: {{background}};
  min-height: 100vh;
  padding-bottom:{{space.6.px*1.25}};
}

/* 顶部标题区 */
.header {
  background: {{brand}};
  padding:{{space.6.px*1.25}} {{space.4.px}} {{space.6.px*0.9375}};
  display: flex;
  flex-direction: column;
  align-items: center;
  color: white;
}

.app-name {
  font-size:{{font.page.em*1.33332}};
  font-weight: bold;
  margin-bottom:{{space.1.px}};
}

.app-slogan {
  font-size:{{font.section.em}};
  opacity: 0.9;
  margin-bottom:{{space.2.px}};
}

.version {
  font-size:{{font.body.em}};
  opacity: 0.7;
  background: rgba(255, 255, 255, 0.2);
  padding:{{space.0.px}} {{space.2.px}};
  border-radius:{{radius.1.px*1.2}};
}

/*  section标题 */
.section-title {
  font-size:{{font.section.em}};
  font-weight: bold;
  color: {{text}};
  padding:{{space.4.px}} {{space.4.px}} {{space.2.px}};
  display: flex;
  align-items: center;
  gap:{{space.0.rpx}};
}
.section-title .line-icon { width: 32rpx; height: 32rpx; color: {{brand}}; }

/* 步骤卡片 */
.step-card {
  background-color: white;
  margin:0 {{space.4.px}} {{space.3.px}};
  border-radius:{{radius.1.px*1.2}};
  padding:{{space.4.px}};
  border: 1px solid {{border}};
}

.step-header {
  display: flex;
  align-items: center;
  margin-bottom:{{space.3.px}};
}

.step-number {
  width: 32px;
  height: 32px;
  background: {{brand}};
  color: white;
  border-radius:50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size:{{font.section.em}};
  font-weight: bold;
  margin-right:{{space.2.px}};
  flex-shrink: 0;
}

.step-title {
  font-size:{{font.section.em}};
  font-weight: bold;
  color: {{text}};
}

.step-content {
  padding-left:{{space.6.px*1.375}};
}

.step-text {
  font-size:{{font.card.em}};
  color:{{text}};
  line-height: 1.8;
  display: block;
}

.step-text.mt {
  margin-top:{{space.2.px}};
}

.step-detail {
  margin:{{space.2.px}} 0;
  padding-left:{{space.1.px}};
}

.detail-item {
  font-size:{{font.card.em}};
  color: {{muted}};
  line-height: 2;
  display: block;
}

.step-tip {
  font-size:{{font.body.em}};
  color:{{brand}};
  line-height: 1.8;
  display: flex;
  align-items: flex-start;
  gap:{{space.0.rpx*0.75}};
  margin-top:{{space.2.px}};
  padding:{{space.2.px}};
  background-color: #f0f9eb;
  border-radius:{{radius.0.px*1.3333333}};
}
.step-tip .line-icon { width: 28rpx; height: 28rpx; flex: 0 0 auto; color: {{brand}}; margin-top:{{space.0.rpx*0.25}}; }

/* 小提示区域 */
.tips-section {
  margin-top:{{space.1.px*1.25}};
}

.tip-card {
  background-color: white;
  margin:0 {{space.4.px}};
  border-radius:{{radius.1.px*1.2}};
  padding:{{space.4.px}};
  border: 1px solid {{border}};
}

.tip-item {
  font-size:{{font.card.em}};
  color: {{muted}};
  line-height: 2.2;
  display: block;
}

/* 底部 */
.footer {
  margin-top:{{space.6.px*1.25}};
  padding:{{space.4.px}};
  display: flex;
  flex-direction: column;
  align-items: center;
}

.footer-text {
  font-size:{{font.body.em}};
  color: {{muted}};
  line-height: 1.8;
}

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

/* Warm table v2: about */
 .ew-display { display:block; color:{{brand}}; margin:16px 0 8px; }.help-step { padding:16px 0; border-bottom:1px solid {{divider}}; }.help-step .ew-title { font-size:{{font.reading.em}}; }.help-step .ew-subtitle { font-size:{{font.reading.em}}; line-height:1.8; margin-top:6px; }.about-links { background:{{card}}; margin-top:24px; border-radius:16px; padding:4px 16px; }.about-link { display:flex; align-items:center; justify-content:space-between; min-height:56px; font-size:{{font.reading.em}}; color:{{text}}; }
