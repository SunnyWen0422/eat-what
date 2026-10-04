@import "../../styles/theme.wxss";
/* pages/dish-detail/dish-detail.wxss */

.container {
  padding-bottom:calc({{space.4.rpx}} + env(safe-area-inset-bottom));
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
  gap:{{space.0.rpx*1.5}};
  background-color: {{background}};
  color: {{brand}};
}
.dish-image-placeholder .line-icon { width: 72rpx; height: 72rpx; }

.placeholder-text {
  color: {{muted}};
  font-size:{{font.body.em}};
}

.favorite-btn {
  position: absolute;
  right: 30rpx;
  bottom: 30rpx;
  width: 80rpx;
  height: 80rpx;
  background-color: {{card}};
  border-radius:50%;
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
  color:{{muted}};
}

.share-btn {
  position: absolute; left: 30rpx; bottom: 30rpx;
  width: 72rpx; height: 72rpx; background: {{card}};
  border-radius:50%; display: flex; align-items: center; justify-content: center;
  border: 1rpx solid #d7e5df;
  padding:0; border: none; font-size:{{font.card.em}};
}
.share-btn::after { border: none; }
.share-btn .line-icon { width: 34rpx; height: 34rpx; color: {{brand}}; }

/* 菜品信息 */
.dish-info {
  padding:{{space.3.rpx*0.9375}};
  background-color: {{card}};
  margin-top:{{space.1.rpx*1.25}};
}

.dish-header {
  margin-bottom:{{space.3.rpx*0.9375}};
}

.dish-name {
  font-size:{{font.section.em}};
  font-weight: bold;
  color: {{text}};
  display: block;
  word-break: break-word;
  margin-bottom:{{space.1.rpx}};
}

.dish-tags {
  display: flex;
  flex-wrap: wrap;
  gap:{{space.0.rpx*1.5}};
}

.tag {
  font-size:{{font.caption.em}};
  color: {{brand}};
  background-color: #fff0f0;
  padding:{{space.0.rpx*0.75}} {{space.1.rpx}};
  border-radius:{{radius.1.rpx}};
}

/* 菜品属性 */
.dish-attributes {
  display: flex;
  flex-wrap: wrap;
  gap:{{space.1.rpx*1.25}};
  padding:{{space.2.rpx}};
  background-color: #f9f9f9;
  border-radius:{{radius.0.rpx*1.3333333}};
  margin-bottom:{{space.3.rpx*0.9375}};
}

.attribute-item {
  flex: 1;
  min-width: 45%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.attribute-label {
  font-size:{{font.caption.em}};
  color: {{muted}};
  margin-bottom:{{space.0.rpx}};
}

.attribute-value {
  font-size:{{font.body.em}};
  color: {{text}};
  font-weight: 500;
}

/* 段落样式 */
.section {
  margin-bottom:{{space.4.rpx}};
}

.section-title {
  margin-bottom:{{space.1.rpx*1.25}};
  padding-bottom:{{space.1.rpx}};
  border-bottom: 2rpx solid {{background}};
}

.section-title-text {
  font-size:{{font.card.em}};
  font-weight: bold;
  color: {{text}};
}

.section-content {
  font-size:{{font.body.em}};
  color: {{muted}};
  line-height: 1.6;
}

/* 食材与用量 */
.ingredients-list {
  display: flex;
  flex-direction: column;
  gap:{{space.1.rpx}};
}

.ingredient-item {
  display: flex;
  align-items: center;
  padding:{{space.1.rpx}} {{space.1.rpx*1.25}};
  background-color: #f9f9f9;
  border-radius:{{radius.0.rpx}};
  align-items: flex-start;
}

.ingredient-text {
  font-size:{{font.body.em}};
  color: {{text}};
  line-height: 1.5;
  word-break: break-word;
}

/* 烹饪步骤 */
.steps-list {
  display: flex;
  flex-direction: column;
  gap:{{space.3.rpx*0.9375}};
}

.step-item {
  display: flex;
  gap:{{space.1.rpx*1.25}};
}

.step-number {
  width: 48rpx;
  height: 48rpx;
  min-width: 48rpx;
  background-color:{{brand}};
  color: {{card}};
  border-radius:50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size:{{font.caption.em}};
  font-weight: bold;
  margin-top:{{space.0.rpx}};
}

.step-content {
  flex: 1;
}

.step-text {
  font-size:{{font.body.em}};
  color: {{text}};
  line-height: 1.6;
  display: block;
  margin-bottom:{{space.1.rpx}};
}

.step-image {
  width: 100%;
  border-radius:{{radius.0.rpx}};
  margin-top:{{space.0.rpx}};
}

.step-images {
  display: flex;
  flex-wrap: wrap;
  gap:{{space.0.rpx}};
  margin-top:{{space.0.rpx*1.25}};
}

.step-images .step-image {
  width: 48%;
  border-radius:{{radius.0.rpx*0.83333333}};
}

/* 步骤图片汇总 */
.all-images {
  display: flex;
  flex-wrap: wrap;
  gap:{{space.0.rpx*1.25}};
}

.all-image {
  width: 31%;
  border-radius:{{radius.0.rpx*0.83333333}};
}

/* 小贴士 */
.tips-content {
  padding:{{space.2.rpx}};
  background-color: #f0f9ff;
  border-radius:{{radius.0.rpx}};
  border-left: 6rpx solid #4dabf7;
}

.tips-text {
  font-size:{{font.body.em}};
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
  border-radius:50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  margin-top:{{space.1.rpx*1.25}};
  font-size:{{font.body.em}};
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
  font-size:{{font.card.em}};
  color: {{muted}};
  margin-bottom:{{space.3.rpx*0.9375}};
}

.retry-btn {
  background-color:{{brand}};
  color: {{card}};
  border: none;
  border-radius:{{radius.3.rpx*1.1111111}};
  padding:{{space.1.rpx}} {{space.6.rpx*0.9375}};
  font-size:{{font.body.em}};
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

.favorite-status { color:{{brand}}; font-size:{{font.caption.em}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
