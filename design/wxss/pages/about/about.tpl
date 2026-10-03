@import "../../styles/theme.wxss";
/* pages/about/about.wxss */

.about-page {
  background-color: {{background}};
  min-height: 100vh;
  padding-bottom: 40px;
}

/* 顶部标题区 */
.header {
  background: {{brand}};
  padding: 40px 20px 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: white;
}

.app-name {
  font-size:2.2857em;
  font-weight: bold;
  margin-bottom: 8px;
}

.app-slogan {
  font-size:1.2857em;
  opacity: 0.9;
  margin-bottom: 12px;
}

.version {
  font-size:1.0em;
  opacity: 0.7;
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 12px;
  border-radius: 12px;
}

/*  section标题 */
.section-title {
  font-size:1.4286em;
  font-weight: bold;
  color: {{text}};
  padding: 20px 20px 12px;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.section-title .line-icon { width: 32rpx; height: 32rpx; color: {{brand}}; }

/* 步骤卡片 */
.step-card {
  background-color: white;
  margin: 0 20px 16px;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid {{border}};
}

.step-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.step-number {
  width: 32px;
  height: 32px;
  background: {{brand}};
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size:1.2857em;
  font-weight: bold;
  margin-right: 12px;
  flex-shrink: 0;
}

.step-title {
  font-size:1.4286em;
  font-weight: bold;
  color: {{text}};
}

.step-content {
  padding-left: 44px;
}

.step-text {
  font-size:1.1429em;
  color: #555;
  line-height: 1.8;
  display: block;
}

.step-text.mt {
  margin-top: 12px;
}

.step-detail {
  margin: 12px 0;
  padding-left: 8px;
}

.detail-item {
  font-size:1.1429em;
  color: {{muted}};
  line-height: 2;
  display: block;
}

.step-tip {
  font-size:1.0714em;
  color: #3cc51f;
  line-height: 1.8;
  display: flex;
  align-items: flex-start;
  gap: 6rpx;
  margin-top: 12px;
  padding: 12px;
  background-color: #f0f9eb;
  border-radius: 8px;
}
.step-tip .line-icon { width: 28rpx; height: 28rpx; flex: 0 0 auto; color: {{brand}}; margin-top: 2rpx; }

/* 小提示区域 */
.tips-section {
  margin-top: 10px;
}

.tip-card {
  background-color: white;
  margin: 0 20px;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid {{border}};
}

.tip-item {
  font-size:1.1429em;
  color: {{muted}};
  line-height: 2.2;
  display: block;
}

/* 底部 */
.footer {
  margin-top: 40px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.footer-text {
  font-size:1.0em;
  color: {{muted}};
  line-height: 1.8;
}

/* 页面共享主题，适用于本页详情、表单和弹层。 */

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:24rpx; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:44px; min-width:44px; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:44px;box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:48px}
