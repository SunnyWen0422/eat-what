@import "../../styles/theme.wxss";
/* pages/dish-detail/dish-detail.wxss */

.container {
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
  overflow-x: hidden;
  background: linear-gradient(180deg,{{brandSoft}} 0,{{card}} 300rpx);
  min-height: 100vh;
}

/* 菜品图片 */
.dish-image-container {
  position: relative;
  width: 100%;
  height: 500rpx;
  background-color: {{card}};
}

.dish-image {
  width: 100%;
  height: 100%;
  display: block;
  background-color: #f2f7f5;
}

.dish-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12rpx;
  background-color: {{background}};
  color: {{brand}};
}
.dish-image-placeholder .line-icon { width: 72rpx; height: 72rpx; }

.placeholder-text {
  color: {{muted}};
  font-size:1.0em;
}

.favorite-btn {
  position: absolute;
  right: 30rpx;
  bottom: 30rpx;
  width: 80rpx;
  height: 80rpx;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid #d7e5df;
}

.favorite-icon {
  width: 48rpx;
  height: 48rpx;
  color: {{brand}};
}

.favorite-btn.favorited .favorite-icon {
  color: {{brand}};
}

.favorite-btn:not(.favorited) .favorite-icon {
  color: #ccc;
}

.share-btn {
  position: absolute; left: 30rpx; bottom: 30rpx;
  width: 72rpx; height: 72rpx; background: rgba(255,255,255,0.9);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  border: 1rpx solid #d7e5df;
  padding: 0; border: none; font-size:1.1429em;
}
.share-btn::after { border: none; }
.share-btn .line-icon { width: 34rpx; height: 34rpx; color: {{brand}}; }

/* 菜品信息 */
.dish-info {
  padding: 30rpx;
  background-color: {{card}};
  margin-top: 20rpx;
}

.dish-header {
  margin-bottom: 30rpx;
}

.dish-name {
  font-size:1.4286em;
  font-weight: bold;
  color: {{text}};
  display: block;
  word-break: break-word;
  margin-bottom: 16rpx;
}

.dish-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag {
  font-size:0.8571em;
  color: {{brand}};
  background-color: #fff0f0;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
}

/* 菜品属性 */
.dish-attributes {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 16rpx;
  margin-bottom: 30rpx;
}

.attribute-item {
  flex: 1;
  min-width: 45%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.attribute-label {
  font-size:0.8571em;
  color: {{muted}};
  margin-bottom: 8rpx;
}

.attribute-value {
  font-size:1.0em;
  color: {{text}};
  font-weight: 500;
}

/* 段落样式 */
.section {
  margin-bottom: 40rpx;
}

.section-title {
  margin-bottom: 20rpx;
  padding-bottom: 16rpx;
  border-bottom: 2rpx solid {{background}};
}

.section-title-text {
  font-size:1.1429em;
  font-weight: bold;
  color: {{text}};
}

.section-content {
  font-size:1.0em;
  color: {{muted}};
  line-height: 1.6;
}

/* 食材与用量 */
.ingredients-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.ingredient-item {
  display: flex;
  align-items: center;
  padding: 16rpx 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  align-items: flex-start;
}

.ingredient-text {
  font-size:1.0em;
  color: {{text}};
  line-height: 1.5;
  word-break: break-word;
}

/* 烹饪步骤 */
.steps-list {
  display: flex;
  flex-direction: column;
  gap: 30rpx;
}

.step-item {
  display: flex;
  gap: 20rpx;
}

.step-number {
  width: 48rpx;
  height: 48rpx;
  min-width: 48rpx;
  background-color: #ff6b6b;
  color: {{card}};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size:0.8571em;
  font-weight: bold;
  margin-top: 8rpx;
}

.step-content {
  flex: 1;
}

.step-text {
  font-size:1.0em;
  color: {{text}};
  line-height: 1.6;
  display: block;
  margin-bottom: 16rpx;
}

.step-image {
  width: 100%;
  border-radius: 12rpx;
  margin-top: 8rpx;
}

.step-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 10rpx;
}

.step-images .step-image {
  width: 48%;
  border-radius: 10rpx;
}

/* 步骤图片汇总 */
.all-images {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.all-image {
  width: 31%;
  border-radius: 10rpx;
}

/* 小贴士 */
.tips-content {
  padding: 24rpx;
  background-color: #f0f9ff;
  border-radius: 12rpx;
  border-left: 6rpx solid #4dabf7;
}

.tips-text {
  font-size:1.0em;
  color: {{muted}};
  line-height: 1.6;
}

/* 加载状态 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: {{background}};
}

.loading-spinner {
  width: 60rpx;
  height: 60rpx;
  border: 6rpx solid {{background}};
  border-top: 6rpx solid #ff6b6b;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  margin-top: 20rpx;
  font-size:1.0em;
  color: {{muted}};
}

/* 错误提示 */
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: {{background}};
}

.error-text {
  font-size:1.1429em;
  color: {{muted}};
  margin-bottom: 30rpx;
}

.retry-btn {
  background-color: #ff6b6b;
  color: {{card}};
  border: none;
  border-radius: 40rpx;
  padding: 16rpx 60rpx;
  font-size:1.0em;
}

/* 页面共享主题，适用于本页详情、表单和弹层。 */

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:24rpx; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:44px; min-width:44px; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:44px;box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:48px}
