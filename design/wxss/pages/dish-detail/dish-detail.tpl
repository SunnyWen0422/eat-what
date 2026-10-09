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

/* v2 recipe reading: content first, one contextual preparation action. */
.container{background:{{background}};padding:{{space.3.px}} {{space.3.px}} calc(104px + env(safe-area-inset-bottom));min-height:100%;height:auto;display:block}.dish-image-container{height:244px;border-radius:{{radius.3.px}};overflow:hidden;background:{{surfaceSoft}}}.dish-image-container.no-image{height:48px;overflow:visible;background:transparent}.dish-image{border-radius:{{radius.3.px}}}.favorite-btn,.share-btn{width:{{controls.touchSize.px}};height:{{controls.touchSize.px}};min-width:{{controls.touchSize.px}};min-height:{{controls.touchSize.px}};box-shadow:none;background:{{card}};border:1px solid {{border}};display:flex;align-items:center;justify-content:center;border-radius:{{radius.2.px}};padding:0;margin:0;top:{{space.2.px}}}.favorite-btn{right:{{space.2.px}}}.share-btn{right:64px}.dish-info{padding:{{space.4.px}} 0;background:transparent}.dish-name{font-size:{{font.page.em}};font-weight:600;line-height:1.4}.dish-tags{gap:{{space.1.px}};margin-top:{{space.2.px}}}.tag{background:{{brandSoft}};color:{{brand}};border:0;border-radius:{{radius.0.px}};font-size:{{font.caption.em}};padding:{{space.0.px}} {{space.1.px}}}.dish-attributes{background:transparent;box-shadow:none;border:0;padding:{{space.3.px}} 0;margin:{{space.2.px}} 0;display:flex;flex-wrap:wrap;gap:{{space.4.px}};justify-content:flex-start;border-bottom:1px solid {{divider}}}.attribute-item{background:transparent;text-align:left;width:auto;padding:0}.attribute-label{font-size:{{font.secondary.em}};color:{{muted}}}.attribute-value{font-size:{{font.reading.em}};font-weight:500}.section{background:transparent;box-shadow:none;border:0;border-radius:0;padding:0;margin:{{space.5.px}} 0}.section-title-text{font-size:{{font.section.em}};font-weight:600}.step-item{background:transparent;border:0;border-bottom:1px solid {{divider}};padding:{{space.3.px}} 0;border-radius:0;box-shadow:none}.step-number{background:{{background}};color:{{brand}};border:0;font-size:{{font.body.em}};font-weight:600}.step-text,.ingredient-name,.tips-text{font-size:{{font.reading.em}};line-height:1.7}.ingredient-row{background:transparent;border-bottom:1px solid {{divider}}}.detail-bottom{position:fixed;left:0;right:0;bottom:0;z-index:30;background:{{background}};padding:{{space.2.px}} {{space.3.px}} calc({{space.2.px}} + env(safe-area-inset-bottom));border-top:1px solid {{divider}}}.detail-bottom ui-button{display:block}.detail-bottom .ew-link{margin-bottom:{{space.0.px}}}.loading-container,.error-container{background:{{background}}}.share-btn::after{border:0}
@media(max-width:360px){.dish-image-container{height:210px}.dish-image-container.no-image{height:48px}}

.step-number { background-color:{{background}}; }

/* Override native button sizing as well as the legacy left/bottom anchors. */
button.share-btn { left:auto; bottom:auto; width:{{controls.touchSize.px}}; max-width:{{controls.touchSize.px}}; box-sizing:border-box; }

.container .dish-attributes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; padding:16px 0; }
.container .attribute-item { width:auto; min-width:0; flex:none; text-align:left; }
.container .attribute-label,.container .attribute-value { display:block; }
.container .attribute-label { font-size:{{font.caption.em}}; margin-bottom:6px; }
.container .section > .ew-muted { display:block; margin-bottom:10px; }
.container .detail-bottom { display:flex; flex-direction:column; gap:8px; }
.container { padding-bottom:calc(156px + env(safe-area-inset-bottom)); }

/* Recipe actions belong to the title, with or without a successfully loaded hero. */
.container .dish-info { margin-top:0; padding-top:0; }
.container .dish-info.with-hero { padding-top:20px; }
.dish-title-row { display:flex; align-items:center; gap:12px; min-width:0; }
.dish-title-row .dish-name { flex:1; min-width:0; margin:0; overflow-wrap:break-word; }
.dish-title-actions { display:flex; flex:0 0 auto; align-items:center; gap:8px; }
.dish-title-actions .favorite-btn,.dish-title-actions button.share-btn { position:relative; top:auto; right:auto; bottom:auto; left:auto; flex:0 0 44px; width:44px; height:44px; min-height:44px; max-width:44px; margin:0; }
.dish-title-actions .favorite-status { position:absolute; top:100%; right:0; white-space:nowrap; background:{{card}}; border-radius:6px; padding:2px 4px; }
