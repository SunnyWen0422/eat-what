@import "../../styles/theme.wxss";
/**index.wxss**/
page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, {{brandSoft}} 0, {{background}} 140px, {{card}} 300px);
  overflow: hidden;
  padding-top: 0;
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
  padding-top: 0;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}
.container > view { flex-shrink: 0; min-width: 0; }
.meal-options { display: flex; gap: 8px; margin: 0 16px 12px; }
.meal-option { flex: 1; min-width: 0; padding: 12px 0; border-radius: 8px; text-align: center; background: #f3f9f7; color: #71847e; font-size:1.0em; }
.meal-option.active { background: {{brandSoft}}; color: {{brand}}; font-weight: 600; box-shadow: inset 0 0 0 1px {{brand}}; }

/* 标题区 */
.header-area {
  padding: 8px 16px 10px;
  text-align: center;
}
.header-title {
  font-size:1.5714em;
  font-weight: bold;
  color: {{brand}};
  letter-spacing: 1px;
  display: block;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}
.header-title .line-icon { width: 34rpx; height: 34rpx; color: {{brand}}; }
.header-subtitle {
  font-size:0.8571em;
  color: #8fa996;
  margin-top: 8px;
  display: block;
}

/* 参数卡片列表 */
.params-grid {
  margin: 0 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.param-card {
  background: {{card}};
  border-radius: 14rpx;
  padding: 24rpx 20rpx;
  border: 1px solid {{border}};
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-label {
  font-size:1.0714em;
  color: {{text}};
  font-weight: 500;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.card-label .line-icon { width: 32rpx; height: 32rpx; color: {{brand}}; }
.card-count {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.card-num {
  font-size:1.4286em;
  font-weight: bold;
  color: {{brand}};
  min-width: 56rpx;
  text-align: center;
}
.count-btn {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: {{brand}};
  color: {{card}};
  font-size:1.2857em;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  border: none;
  box-sizing: border-box;
}
.count-btn::after { border: none; }
.count-btn.minus { background: #88C9A3; }

/* 今日小提示 */
.tip-card {
  margin: 0 16px 8px;
  background: #f3faf7;
  border: 1px solid #dcefe8;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tip-icon { width: 28rpx; height: 28rpx; color: {{brand}}; flex-shrink: 0; }
.tip-text { font-size:0.8571em; color: #2d5a3d; line-height: 1.4; }

/* 热门搭配标签组 */
.tags-area { margin: 0 16px 10px; }
.tags-label {
  font-size:0.9286em;
  font-weight: bold;
  color: #555;
  margin-bottom: 10px;
  display: block;
}
.tag-group { width: 100%; white-space: nowrap; }
.hot-tag {
  display: inline-block;
  margin: 2px 8px 6px 0;
  padding: 8px 16px;
  background: #f5f7f4;
  border-radius: 20px;
  font-size:0.9286em;
  color: {{muted}};
  border: 1px solid #e0e8dc;
  transition: all 0.25s;
}
.hot-tag:first-child { margin-left: 2px; }
.hot-tag:last-child { margin-right: 16px; }
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
  gap: 8px;
}
.filter-more,
.filter-clear { color: {{brand}}; font-size:0.9286em; }
.selected-mark { margin-left: 4px; font-size:0.8571em; font-weight: 600; }
.filter-feedback { margin-top: 9px; padding-top: 8px; border-top: 1px solid {{border}}; }
.filter-summary { min-width: 0; flex: 1; color: #4e5c56; font-size:0.8571em; line-height: 1.5; }
.preference-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  color: #4e5c56;
  font-size:0.8571em;
}
.preference-toggle-row switch { transform: scale(0.8); transform-origin: right center; }

/* 已选菜品提示区 */
.selected-dishes-hint {
  margin: 0 16px 10px;
  padding: 10px 12px;
  background: {{brandSoft}};
  border: 1px solid #C8E6C9;
  border-radius: 10px;
}
.hint-header { display: flex; align-items: center; margin-bottom: 6px; }
.hint-icon { color: {{brand}}; font-size:1.0em; font-weight: bold; margin-right: 4px; }
.hint-title { font-size:0.9286em; font-weight: bold; color: #2d5a3d; flex: 1; }
.hint-clear { font-size:0.8571em; color: {{muted}}; padding: 2px 8px; }
.selected-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.dish-tag { font-size:0.8571em; padding: 2px 6px; border-radius: 4px; }
.meat-tag { color: #E74C3C; background: #FDE8E8; border: 1px solid #ffbb96; }
.veg-tag { color: {{brand}}; background: {{brandSoft}}; border: 1px solid #b7e1b0; }
.soup-tag { color: {{brand}}; background: #E3F2FD; border: 1px solid #91d5ff; }
.dessert-tag { color: #E91E63; background: #FCE4EC; border: 1px solid #ffb6c1; }

/* 我的菜谱区域 */
.my-recipes { margin: 0 16px 16px; padding: 14px; background: {{card}}; border: 1px solid {{border}}; border-radius: 12px; }
.section-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.section-header-title { font-size:1.0em; font-weight: bold; color: {{text}}; }
.section-header-title { display: flex; align-items: center; gap: 6rpx; }
.section-header-title .line-icon { width: 28rpx; height: 28rpx; color: {{brand}}; }
.section-header-hint { font-size:0.8571em; color: #aaa; }
.recipe-list { height: auto; }
.recipe-item { padding: 10px; background: #fafbfa; border-radius: 8px; border: 1px solid #eee; position: relative; margin-bottom: 8px; transition: all 0.2s; }
.recipe-item.selected { background: {{brandSoft}}; border-color: {{brand}}; }
.recipe-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.recipe-name { flex: 1; min-width: 0; word-break: break-word; font-size:0.9286em; font-weight: bold; color: {{text}}; }
.delete-btn { width: 18px; height: 18px; line-height: 17px; text-align: center; background: #ff7875; color: {{card}}; border-radius: 50%; font-size:1.0em; font-weight: bold; }
.recipe-info { display: flex; gap: 5px; flex-wrap: wrap; }
.info-tag { font-size:0.8571em; color: #777; background: {{card}}; padding: 2px 5px; border-radius: 3px; }
.recipe-dishes { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 5px; }
.recipe-dishes .dish-tag { font-size:0.8571em; color: {{brand}}; background: {{card}}; padding: 1px 4px; border-radius: 3px; border: 1px solid {{brand}}; }
.selected-badge { position: absolute; top: -6px; right: -6px; background: {{brand}}; color: {{card}}; font-size:0.8571em; padding: 1px 6px; border-radius: 10px; }
.unselect-btn { margin-top: 10px; text-align: center; padding: 6px; background: {{background}}; border-radius: 4px; color: {{muted}}; font-size:0.8571em; }

/* 数据加载提示 */
.loading-tip { margin: 0 16px 10px; padding: 12px 16px; background: #fff9e6; border-radius: 10px; border: 1px solid rgba(212,160,23,0.2); }
.loading-tip-content { display: flex; align-items: center; justify-content: center; gap: 10px; }
.loading-spinner { width: 20px; height: 20px; border: 3px solid #d4a017; border-top: 3px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.loading-text { font-size:1.0em; color: #d4a017; font-weight: 500; }

/* 按钮区 */
.cta-area { padding: 2px 16px 16px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.chat-btn {
  border: 2rpx solid {{brand}};
  color: {{brand}};
}
.chat-btn::after { border: none; }
.primary-btn {
  width: 80%; height: 48px;
  background: {{brand}};
  color: {{card}}; font-size:1.2143em; font-weight: bold;
  border-radius: 28rpx; border: none;
  box-shadow: none;
  letter-spacing: 2rpx;
}
.primary-btn::after { border: none; }
.secondary-btn {
  width: 80%; height: 42px;
  background: {{card}}; color: #FF7D3B; font-size:1.0em; font-weight: bold;
  border-radius: 24rpx; border: 2rpx solid #FFD5BF;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
}
.chat-btn { display: flex; align-items: center; justify-content: center; gap: 6rpx; }
.chat-btn .line-icon, .secondary-btn .line-icon { width: 28rpx; height: 28rpx; }
.secondary-btn::after { border: none; }
.filter-summary, .dish-tag, .loading-text { word-break: break-word; }
.filter-clear, .filter-more { flex-shrink: 0; }
.section-header-row { flex-wrap: wrap; gap: 6px; }
.card-label { flex-shrink: 1; min-width: 0; }
.param-card { gap: 8px; }
.cta-area button { min-width: 0; max-width: 100%; }

/* 页面共享主题，适用于本页详情、表单和弹层。 */

.count-btn,.meal-option,.hot-tag,.delete-btn { min-width:44px; min-height:44px; display:flex; align-items:center; justify-content:center; box-sizing:border-box; }

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:24rpx; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:44px; min-width:44px; box-sizing:border-box; }

@import "../../styles/workspace.wxss";

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:44px;box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:48px}
