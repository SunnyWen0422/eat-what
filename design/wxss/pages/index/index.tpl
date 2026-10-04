@import "../../styles/theme.wxss";
/**index.wxss**/
page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, {{brandSoft}} 0, {{background}} 140px, {{card}} 300px);
  overflow: hidden;
  padding-top:0;
}
.scrollarea {
  flex: 1;
  height: 0;
  min-height: 0;
  width: 100%;
}
.container {
  height: auto;
  min-height: 100%;
  padding-top:0;
  padding-bottom:calc({{space.3.px}} + env(safe-area-inset-bottom));
}
.container > view { flex-shrink: 0; min-width: 0; }
.meal-options { display: flex; gap:{{space.1.px}}; margin:0 {{space.3.px}} {{space.2.px}}; }
.meal-option { flex: 1; min-width: 0; padding:{{space.2.px}} 0; border-radius:{{radius.0.px*1.3333333}}; text-align: center; background: #f3f9f7; color:{{muted}}; font-size:{{font.body.em}}; }
.meal-option.active { background: {{brandSoft}}; color: {{brand}}; font-weight: 600; box-shadow: inset 0 0 0 1px {{brand}}; }

/* 标题区 */
.header-area {
  padding:{{space.1.px}} {{space.3.px}} {{space.1.px*1.25}};
  text-align: center;
}
.header-title {
  font-size:{{font.page.em}};
  font-weight: bold;
  color: {{brand}};
  letter-spacing:{{space.0.px*0.25}};
  display: block;
  display: flex;
  align-items: center;
  justify-content: center;
  gap:{{space.0.rpx}};
}
.header-title .line-icon { width: 34rpx; height: 34rpx; color: {{brand}}; }
.header-subtitle {
  font-size:{{font.caption.em}};
  color:{{muted}};
  margin-top:{{space.1.px}};
  display: block;
}

/* 参数卡片列表 */
.params-grid {
  margin:0 {{space.3.px}} {{space.1.px*1.25}};
  display: flex;
  flex-direction: column;
  gap:{{space.1.px}};
}
.param-card {
  background: {{card}};
  border-radius:{{radius.0.rpx*1.1666667}};
  padding:{{space.2.rpx}} {{space.1.rpx*1.25}};
  border: 1px solid {{border}};
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-label {
  font-size:{{font.body.em}};
  color: {{text}};
  font-weight: 500;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap:{{space.0.rpx}};
}
.card-label .line-icon { width: 32rpx; height: 32rpx; color: {{brand}}; }
.card-count {
  display: flex;
  align-items: center;
  gap:{{space.1.px}};
  flex-shrink: 0;
}
.card-num {
  font-size:{{font.section.em}};
  font-weight: bold;
  color: {{brand}};
  min-width: 56rpx;
  text-align: center;
}
.count-btn {
  width: 56rpx;
  height: 56rpx;
  border-radius:50%;
  background: {{brand}};
  color: {{card}};
  font-size:{{font.section.em}};
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:0;
  margin:0;
  border: none;
  box-sizing: border-box;
}
.count-btn::after { border: none; }
.count-btn.minus { background:{{brand}}; }

/* 今日小提示 */
.tip-card {
  margin:0 {{space.3.px}} {{space.1.px}};
  background: #f3faf7;
  border: 1px solid #dcefe8;
  border-radius:{{radius.1.px}};
  padding:{{space.1.px*1.25}} {{space.2.px*1.1666667}};
  display: flex;
  align-items: center;
  gap:{{space.1.px}};
}
.tip-icon { width: 28rpx; height: 28rpx; color: {{brand}}; flex-shrink: 0; }
.tip-text { font-size:{{font.caption.em}}; color:{{brand}}; line-height: 1.4; }

/* 热门搭配标签组 */
.tags-area { margin:0 {{space.3.px}} {{space.1.px*1.25}}; }
.tags-label {
  font-size:{{font.secondary.em}};
  font-weight: bold;
  color:{{text}};
  margin-bottom:{{space.1.px*1.25}};
  display: block;
}
.tag-group { width: 100%; white-space: nowrap; }
.hot-tag {
  display: inline-block;
  margin:{{space.0.px*0.5}} {{space.1.px}} {{space.0.px*1.5}} 0;
  padding:{{space.1.px}} {{space.3.px}};
  background: #f5f7f4;
  border-radius:{{radius.3.px*1.1111111}};
  font-size:{{font.secondary.em}};
  color: {{muted}};
  border: 1px solid #e0e8dc;
  transition: all 0.25s;
}
.hot-tag:first-child { margin-left:{{space.0.px*0.5}}; }
.hot-tag:last-child { margin-right:{{space.3.px}}; }
.hot-tag.active {
  background: {{brand}};
  color: {{card}};
  border-color: transparent;
  box-shadow: none;
}

.filter-header,
.filter-feedback {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:{{space.1.px}};
}
.filter-more,
.filter-clear { color: {{brand}}; font-size:{{font.secondary.em}}; }
.selected-mark { margin-left:{{space.0.px}}; font-size:{{font.caption.em}}; font-weight: 600; }
.filter-feedback { margin-top:{{space.1.px*1.125}}; padding-top:{{space.1.px}}; border-top: 1px solid {{border}}; }
.filter-summary { min-width: 0; flex: 1; color:{{text}}; font-size:{{font.caption.em}}; line-height: 1.5; }
.preference-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top:{{space.1.px*1.25}};
  color:{{text}};
  font-size:{{font.caption.em}};
}
.preference-toggle-row switch { transform: scale(0.8); transform-origin: right center; }

/* 已选菜品提示区 */
.selected-dishes-hint {
  margin:0 {{space.3.px}} {{space.1.px*1.25}};
  padding:{{space.1.px*1.25}} {{space.2.px}};
  background: {{brandSoft}};
  border: 1px solid #C8E6C9;
  border-radius:{{radius.1.px}};
}
.hint-header { display: flex; align-items: center; margin-bottom:{{space.0.px*1.5}}; }
.hint-icon { color: {{brand}}; font-size:{{font.body.em}}; font-weight: bold; margin-right:{{space.0.px}}; }
.hint-title { font-size:{{font.secondary.em}}; font-weight: bold; color:{{brand}}; flex: 1; }
.hint-clear { font-size:{{font.caption.em}}; color: {{muted}}; padding:{{space.0.px*0.5}} {{space.1.px}}; }
.selected-tags { display: flex; flex-wrap: wrap; gap:{{space.0.px}}; }
.dish-tag { font-size:{{font.caption.em}}; padding:{{space.0.px*0.5}} {{space.0.px*1.5}}; border-radius:{{radius.0.px*0.66666667}}; }
.meat-tag { color:{{brand}}; background: #FDE8E8; border: 1px solid #ffbb96; }
.veg-tag { color: {{brand}}; background: {{brandSoft}}; border: 1px solid #b7e1b0; }
.soup-tag { color: {{brand}}; background: #E3F2FD; border: 1px solid #91d5ff; }
.dessert-tag { color:{{brand}}; background: #FCE4EC; border: 1px solid #ffb6c1; }

/* 我的菜谱区域 */
.my-recipes { margin:0 {{space.3.px}} {{space.3.px}}; padding:{{space.2.px*1.1666667}}; background: {{card}}; border: 1px solid {{border}}; border-radius:{{radius.1.px*1.2}}; }
.section-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom:{{space.1.px*1.25}}; }
.section-header-title { font-size:{{font.body.em}}; font-weight: bold; color: {{text}}; }
.section-header-title { display: flex; align-items: center; gap:{{space.0.rpx*0.75}}; }
.section-header-title .line-icon { width: 28rpx; height: 28rpx; color: {{brand}}; }
.section-header-hint { font-size:{{font.caption.em}}; color:{{muted}}; }
.recipe-list { height: auto; }
.recipe-item { padding:{{space.1.px*1.25}}; background: #fafbfa; border-radius:{{radius.0.px*1.3333333}}; border: 1px solid #eee; position: relative; margin-bottom:{{space.1.px}}; transition: all 0.2s; }
.recipe-item.selected { background: {{brandSoft}}; border-color: {{brand}}; }
.recipe-header { display: flex; justify-content: space-between; align-items: center; margin-bottom:{{space.0.px*1.5}}; }
.recipe-name { flex: 1; min-width: 0; word-break: break-word; font-size:{{font.secondary.em}}; font-weight: bold; color: {{text}}; }
.delete-btn { width: 18px; height: 18px; line-height: 17px; text-align: center; background:{{danger}}; color: {{card}}; border-radius:50%; font-size:{{font.body.em}}; font-weight: bold; }
.recipe-info { display: flex; gap:{{space.0.px*1.25}}; flex-wrap: wrap; }
.info-tag { font-size:{{font.caption.em}}; color:{{muted}}; background: {{card}}; padding:{{space.0.px*0.5}} {{space.0.px*1.25}}; border-radius:{{radius.0.px*0.5}}; }
.recipe-dishes { display: flex; flex-wrap: wrap; gap:{{space.0.px*0.75}}; margin-top:{{space.0.px*1.25}}; }
.recipe-dishes .dish-tag { font-size:{{font.caption.em}}; color: {{brand}}; background: {{card}}; padding:{{space.0.px*0.25}} {{space.0.px}}; border-radius:{{radius.0.px*0.5}}; border: 1px solid {{brand}}; }
.selected-badge { position: absolute; top: -6px; right: -6px; background: {{brand}}; color: {{card}}; font-size:{{font.caption.em}}; padding:{{space.0.px*0.25}} {{space.0.px*1.5}}; border-radius:{{radius.1.px}}; }
.unselect-btn { margin-top:{{space.1.px*1.25}}; text-align: center; padding:{{space.0.px*1.5}}; background: {{background}}; border-radius:{{radius.0.px*0.66666667}}; color: {{muted}}; font-size:{{font.caption.em}}; }

/* 数据加载提示 */
.loading-tip { margin:0 {{space.3.px}} {{space.1.px*1.25}}; padding:{{space.2.px}} {{space.3.px}}; background: #fff9e6; border-radius:{{radius.1.px}}; border: 1px solid rgba(212,160,23,0.2); }
.loading-tip-content { display: flex; align-items: center; justify-content: center; gap:{{space.1.px*1.25}}; }
.loading-spinner { width: 20px; height: 20px; border: 3px solid #d4a017; border-top: 3px solid transparent; border-radius:50%; animation: spin 1s linear infinite; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.loading-text { font-size:{{font.body.em}}; color:{{warning}}; font-weight: 500; }

/* 按钮区 */
.cta-area { padding:{{space.0.px*0.5}} {{space.3.px}} {{space.3.px}}; display: flex; flex-direction: column; align-items: center; gap:{{space.2.px}}; }
.chat-btn {
  border: 2rpx solid {{brand}};
  color: {{brand}};
}
.chat-btn::after { border: none; }
.primary-btn {
  width: 80%; height: {{controls.primaryHeight.px}};
  background: {{brand}};
  color: {{card}}; font-size:{{font.section.em}}; font-weight: bold;
  border-radius:{{radius.2.rpx}}; border: none;
  box-shadow: none;
  letter-spacing:{{space.0.rpx*0.25}};
}
.primary-btn::after { border: none; }
.secondary-btn {
  width: 80%; height: 42px;
  background: {{card}}; color:{{brand}}; font-size:{{font.body.em}}; font-weight: bold;
  border-radius:{{radius.1.rpx*1.2}}; border: 2rpx solid #FFD5BF;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap:{{space.0.rpx*0.75}};
}
.chat-btn { display: flex; align-items: center; justify-content: center; gap:{{space.0.rpx*0.75}}; }
.chat-btn .line-icon, .secondary-btn .line-icon { width: 28rpx; height: 28rpx; }
.secondary-btn::after { border: none; }
.filter-summary, .dish-tag, .loading-text { word-break: break-word; }
.filter-clear, .filter-more { flex-shrink: 0; }
.section-header-row { flex-wrap: wrap; gap:{{space.0.px*1.5}}; }
.card-label { flex-shrink: 1; min-width: 0; }
.param-card { gap:{{space.1.px}}; }
.cta-area button { min-width: 0; max-width: 100%; }

/* 页面共享主题，适用于本页详情、表单和弹层。 */

.count-btn,.meal-option,.hot-tag,.delete-btn { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; display:flex; align-items:center; justify-content:center; box-sizing:border-box; }

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
