@import "../../styles/theme.wxss";
/* pages/customize/customize.wxss */

.page { height: 100%; min-height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: linear-gradient(180deg,{{brandSoft}} 0,{{card}} 280px); }

/* ===== 左侧竖边栏 ===== */
.category-scroll { width: 100%; height: 54px; flex-shrink: 0; overflow-x: auto; white-space: nowrap; background: {{card}}; border-bottom: 1px solid #deebe6; }
.sidebar { display: inline-flex; min-width: 100%; height: 100%; padding: 0 12px; box-sizing: border-box; }

.sidebar-item {
  flex: 0 0 auto;
  min-width: 68px;
  box-sizing: border-box;
  padding: 14px 12px;
  text-align: center;
  font-size:1.1429em;
  color: {{muted}};
  border-bottom: 3px solid transparent;
  transition: all 0.2s;
}

.sidebar-active {
  background: {{brandSoft}};
  color: {{brand}};
  font-weight: bold;
  border-bottom-color: {{brand}};
}

.custom-btn { color: {{brand}}; }

.custom-btn.sidebar-active {
  color: {{card}};
  background: {{brand}};
}

/* ===== 右侧内容区 ===== */
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* 搜索框 */
.search-wrap {
  flex-shrink: 0;
  padding: 10px 12px;
  background: {{card}};
  border-bottom: 1px solid {{border}};
}

.search-input {
  width: 100%;
  height: 36px;
  background: {{background}};
  border-radius: 8px;
  padding: 0 10px;
  font-size:1.0714em;
  box-sizing: border-box;
}

.hot-tags {
  display: flex; gap: 8px; padding: 10px 0 4px; flex-wrap: wrap;
}
.hot-tag {
  font-size:0.8571em; color: {{brand}}; background: {{brandSoft}};
  padding: 4rpx 16rpx; border-radius: 12rpx;
  border: 1rpx solid #C8E6C9;
}

.browse-filter-header,
.browse-filter-command {
  display: flex;
  align-items: center;
}
.browse-filter-header { justify-content: space-between; margin-top: 10px; }
.browse-filter-command { gap: 8px; color: #25322c; font-size:0.9286em; font-weight: 600; }
.browse-filter-arrow,
.browse-filter-clear { color: {{brand}}; font-size:0.8571em; font-weight: 400; }
.browse-filter-summary { display: block; margin: 6px 0 10px; color: #5d6862; font-size:0.8571em; line-height: 1.5; word-break: break-word; }
.browse-filter-panel { margin-top: 10px; padding-top: 8px; border-top: 1px solid #edf0ee; }
.browse-filter-group { margin-bottom: 9px; }
.browse-filter-label { display: block; margin-bottom: 5px; color: #6b756f; font-size:0.8571em; }
.browse-filter-options { width: 100%; white-space: nowrap; }
.browse-filter-option {
  display: inline-flex;
  align-items: center;
  height: 28px;
  margin-right: 6px;
  padding: 0 9px;
  border: 1px solid #d8dfdb;
  border-radius: 5px;
  background: {{card}};
  color: {{muted}};
  font-size:0.8571em;
  box-sizing: border-box;
}
.browse-filter-option.selected { border-color: {{brand}}; background: {{brandSoft}}; color: #126947; font-weight: 600; }
.browse-filter-option:first-child { margin-left: 2px; }
.browse-filter-option:last-child { margin-right: 16px; }
.browse-filter-count { margin-left: 4px; color: #87928c; font-size:0.8571em; }

/* 菜品列表 */
.dish-list {
  min-height: 0;
}
.dish-list-content { padding: 10px 12px 24px; }

.tip-text {
  text-align: center;
  color: {{muted}};
  font-size:1.0714em;
  margin: 20px 0;
  line-height: 1.6;
}

/* 每行菜品 */
.dish-row {
  display: flex;
  align-items: center;
  background: {{card}};
  border-radius: 10px;
  padding: 14px 12px;
  margin-bottom: 8px;
  border: 2px solid transparent;
  transition: border-color 0.2s, background-color 0.2s;
}

.dish-selected {
  border-color: {{brand}};
  background: #f0faf3;
}

/* 勾选圆圈 */
.check-wrap {
  flex-shrink: 0;
  padding: 4px;
  margin-right: 10px;
}

.check-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.check-circle.checked {
  background: {{brand}};
  border-color: {{brand}};
}

.check-tick {
  color: {{card}};
  font-size:1.0em;
  font-weight: bold;
}

/* 菜名 */
.name-wrap {
  flex: 1;
  min-width: 0;
}

.dish-name {
  font-size:1.2143em;
  color: {{text}};
  line-height: 1.4;
  word-break: break-word;
  white-space: normal;
  display: block;
}

/* ===== 底部操作栏 ===== */
.bottom-bar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background: {{card}};
  border-top: 1px solid {{border}};
}

.selected-wrap {
  flex: 1 1 100%;
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 20px;
  background: #f0faf3;
}

.selected-num {
  font-size:1.0714em;
  color: {{brand}};
  font-weight: bold;
}

.selected-arrow {
  display: inline-block;
  margin-left: 4px;
  font-size:1.2857em;
  color: {{brand}};
  transition: transform 0.3s;
  transform: rotate(90deg);
}

.selected-arrow.arrow-up {
  transform: rotate(-90deg);
}

.save-btn {
  flex: 1 1 0;
  margin: 0;
  background: {{brand}};
  color: {{card}};
  font-size:1.0714em;
  border-radius: 8px;
  padding: 0 16px;
  height: 44px;
  line-height: 44px;
  min-width: 0;
  width: auto;
}

/* ===== 遮罩层 ===== */
.panel-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.4);
  z-index: 99;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s, visibility 0.3s;
}

.mask-show {
  opacity: 1;
  visibility: visible;
}

/* ===== 已选菜品弹出面板 ===== */
.selected-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 70%;
  max-height: 100%;
  box-sizing: border-box;
  background: {{card}};
  border-radius: 16px 16px 0 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  transform: translateY(100%);
  transition: transform 0.3s;
  padding-bottom: env(safe-area-inset-bottom);
}

.panel-show {
  transform: translateY(0);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid {{background}};
}

.panel-title {
  font-size:1.2143em;
  font-weight: bold;
  color: {{text}};
}

.panel-close {
  font-size:1.5714em;
  color: {{muted}};
  padding: 4px 8px;
}

.panel-list {
  min-height: 0;
}
.panel-list-content { padding: 0 16px 16px; }

.panel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid {{background}};
}

.panel-item-name {
  font-size:1.1429em;
  color: {{text}};
  flex: 1;
  min-width: 0;
  word-break: break-word;
  white-space: normal;
}

.panel-item-remove {
  font-size:1.0em;
  color: {{danger}};
  padding: 4px 8px;
  flex-shrink: 0;
}

.panel-empty {
  text-align: center;
  color: {{muted}};
  font-size:1.0714em;
  margin-top: 40px;
}

.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid {{background}};
}

.panel-clear {
  background: {{card}};
  color: {{danger}};
  font-size:1.0714em;
  border: 1px solid {{danger}};
  border-radius: 8px;
  height: 36px;
  line-height: 36px;
}

/* ===== 定制菜品表单 ===== */
.custom-form {
  background: {{card}};
}
.custom-form-content { padding: 16px 16px calc(24px + env(safe-area-inset-bottom)); }

.form-title {
  font-size:1.2857em;
  font-weight: bold;
  color: {{text}};
  margin-bottom: 16px;
}

.form-input {
  width: 100%;
  height: 44px;
  border: 1px solid {{border}};
  border-radius: 8px;
  padding: 0 12px;
  font-size:1.1429em;
  box-sizing: border-box;
  margin-bottom: 12px;
}

.type-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.type-label {
  font-size:1.0em;
  color: {{muted}};
  margin-right: 8px;
}

.type-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.type-opt {
  padding: 4px 12px;
  border: 1px solid #ddd;
  border-radius: 14px;
  font-size:0.9286em;
  color: {{muted}};
}

.opt-active {
  background: {{brand}};
  color: {{card}};
  border-color: {{brand}};
}

.form-textarea {
  width: 100%;
  border: 1px solid {{border}};
  border-radius: 8px;
  padding: 10px 12px;
  font-size:1.0714em;
  box-sizing: border-box;
  margin-bottom: 12px;
  min-height: 80px;
}

.save-custom-btn {
  background: {{brand}};
  color: {{card}};
  font-size:1.1429em;
  border-radius: 8px;
  height: 44px;
  line-height: 44px;
  margin-top: 8px;
}
.shopping-btn { background: {{brandSoft}}; color: {{brand}}; }

.selector-input { color: #4c5852; }
.custom-tag-title { margin: 10px 0 8px; color: #5d6862; font-size:0.9286em; }
.custom-tag-grid { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 10px; }
.custom-tag { padding: 7px 9px; border: 1px solid #d8dfdb; border-radius: 5px; background: {{card}}; color: #65716b; font-size:0.8571em; }
.custom-tag.selected { border-color: {{brand}}; background: {{brandSoft}}; color: #126947; font-weight: 600; }

@media (min-width: 601px) {
  .page { flex-direction: row; }
  .category-scroll { width: 80px; height: auto; overflow-x: hidden; overflow-y: auto; border-right: 1px solid #deebe6; border-bottom: 0; }
  .sidebar { display: flex; flex-direction: column; min-width: 80px; height: auto; padding: 0; }
  .sidebar-item { width: 80px; min-width: 80px; padding: 20px 0; border-bottom: 0; border-left: 3px solid transparent; }
  .sidebar-active { border-left-color: {{brand}}; border-bottom-color: transparent; }
  .custom-btn { margin-top: auto; border-top: 1px solid {{border}}; }
}

/* 页面共享主题，适用于本页详情、表单和弹层。 */

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:24rpx; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:44px; min-width:44px; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:44px;box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:48px}
