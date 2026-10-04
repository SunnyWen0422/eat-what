@import "../../styles/theme.wxss";
/* pages/customize/customize.wxss */

.page { height: 100%; min-height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: linear-gradient(180deg,{{brandSoft}} 0,{{card}} 280px); }

/* ===== 左侧竖边栏 ===== */
.category-scroll { width: 100%; height: 54px; flex-shrink: 0; overflow-x: auto; white-space: nowrap; background: {{card}}; border-bottom: 1px solid #deebe6; }
.sidebar { display: inline-flex; min-width: 100%; height: 100%; padding:0 {{space.2.px}}; box-sizing: border-box; }

.sidebar-item {
  flex: 0 0 auto;
  min-width: 68px;
  box-sizing: border-box;
  padding:{{space.2.px*1.1666667}} {{space.2.px}};
  text-align: center;
  font-size:{{font.card.em}};
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
  padding:{{space.1.px*1.25}} {{space.2.px}};
  background: {{card}};
  border-bottom: 1px solid {{border}};
}

.search-input {
  width: 100%;
  height: 36px;
  background: {{background}};
  border-radius:{{radius.0.px*1.3333333}};
  padding:0 {{space.1.px*1.25}};
  font-size:{{font.body.em}};
  box-sizing: border-box;
}

.hot-tags {
  display: flex; gap:{{space.1.px}}; padding:{{space.1.px*1.25}} 0 {{space.0.px}}; flex-wrap: wrap;
}
.hot-tag {
  font-size:{{font.caption.em}}; color: {{brand}}; background: {{brandSoft}};
  padding:{{space.0.rpx*0.5}} {{space.1.rpx}}; border-radius:{{radius.0.rpx}};
  border: 1rpx solid #C8E6C9;
}

.browse-filter-header,
.browse-filter-command {
  display: flex;
  align-items: center;
}
.browse-filter-header { justify-content: space-between; margin-top:{{space.1.px*1.25}}; }
.browse-filter-command { gap:{{space.1.px}}; color:{{text}}; font-size:{{font.secondary.em}}; font-weight: 600; }
.browse-filter-arrow,
.browse-filter-clear { color: {{brand}}; font-size:{{font.caption.em}}; font-weight: 400; }
.browse-filter-summary { display: block; margin:{{space.0.px*1.5}} 0 {{space.1.px*1.25}}; color:{{muted}}; font-size:{{font.caption.em}}; line-height: 1.5; word-break: break-word; }
.browse-filter-panel { margin-top:{{space.1.px*1.25}}; padding-top:{{space.1.px}}; border-top: 1px solid #edf0ee; }
.browse-filter-group { margin-bottom:{{space.1.px*1.125}}; }
.browse-filter-label { display: block; margin-bottom:{{space.0.px*1.25}}; color:{{muted}}; font-size:{{font.caption.em}}; }
.browse-filter-options { width: 100%; white-space: nowrap; }
.browse-filter-option {
  display: inline-flex;
  align-items: center;
  height: 28px;
  margin-right:{{space.0.px*1.5}};
  padding:0 {{space.1.px*1.125}};
  border: 1px solid #d8dfdb;
  border-radius:{{radius.0.px*0.83333333}};
  background: {{card}};
  color: {{muted}};
  font-size:{{font.caption.em}};
  box-sizing: border-box;
}
.browse-filter-option.selected { border-color: {{brand}}; background: {{brandSoft}}; color:{{brand}}; font-weight: 600; }
.browse-filter-option:first-child { margin-left:{{space.0.px*0.5}}; }
.browse-filter-option:last-child { margin-right:{{space.3.px}}; }
.browse-filter-count { margin-left:{{space.0.px}}; color:{{muted}}; font-size:{{font.caption.em}}; }

/* 菜品列表 */
.dish-list {
  min-height: 0;
}
.dish-list-content { padding:{{space.1.px*1.25}} {{space.2.px}} {{space.5.px}}; }

.tip-text {
  text-align: center;
  color: {{muted}};
  font-size:{{font.body.em}};
  margin:{{space.4.px}} 0;
  line-height: 1.6;
}

/* 每行菜品 */
.dish-row {
  display: flex;
  align-items: center;
  background: {{card}};
  border-radius:{{radius.1.px}};
  padding:{{space.2.px*1.1666667}} {{space.2.px}};
  margin-bottom:{{space.1.px}};
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
  padding:{{space.0.px}};
  margin-right:{{space.1.px*1.25}};
}

.check-circle {
  width: 24px;
  height: 24px;
  border-radius:50%;
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
  font-size:{{font.body.em}};
  font-weight: bold;
}

/* 菜名 */
.name-wrap {
  flex: 1;
  min-width: 0;
}

.dish-name {
  font-size:{{font.section.em}};
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
  gap:{{space.1.px}};
  align-items: center;
  justify-content: space-between;
  padding:{{space.1.px*1.25}} {{space.2.px}};
  padding-bottom:calc({{space.1.px*1.25}} + env(safe-area-inset-bottom));
  background: {{card}};
  border-top: 1px solid {{border}};
}

.selected-wrap {
  flex: 1 1 100%;
  display: flex;
  align-items: center;
  padding:{{space.0.px*1.5}} {{space.1.px*1.25}};
  border-radius:{{radius.3.px*1.1111111}};
  background: #f0faf3;
}

.selected-num {
  font-size:{{font.body.em}};
  color: {{brand}};
  font-weight: bold;
}

.selected-arrow {
  display: inline-block;
  margin-left:{{space.0.px}};
  font-size:{{font.section.em}};
  color: {{brand}};
  transition: transform 0.3s;
  transform: rotate(90deg);
}

.selected-arrow.arrow-up {
  transform: rotate(-90deg);
}

.save-btn {
  flex: 1 1 0;
  margin:0;
  background: {{brand}};
  color: {{card}};
  font-size:{{font.body.em}};
  border-radius:{{radius.0.px*1.3333333}};
  padding:0 {{space.3.px}};
  height: {{controls.touchSize.px}};
  line-height: {{controls.touchSize.px}};
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
  border-radius:{{radius.2.px*1.1428571}} {{radius.2.px*1.1428571}} 0 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  transform: translateY(100%);
  transition: transform 0.3s;
  padding-bottom:env(safe-area-inset-bottom);
}

.panel-show {
  transform: translateY(0);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding:{{space.3.px}} {{space.3.px}} {{space.2.px}};
  border-bottom: 1px solid {{background}};
}

.panel-title {
  font-size:{{font.section.em}};
  font-weight: bold;
  color: {{text}};
}

.panel-close {
  font-size:{{font.page.em}};
  color: {{muted}};
  padding:{{space.0.px}} {{space.1.px}};
}

.panel-list {
  min-height: 0;
}
.panel-list-content { padding:0 {{space.3.px}} {{space.3.px}}; }

.panel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding:{{space.2.px*1.1666667}} 0;
  border-bottom: 1px solid {{background}};
}

.panel-item-name {
  font-size:{{font.card.em}};
  color: {{text}};
  flex: 1;
  min-width: 0;
  word-break: break-word;
  white-space: normal;
}

.panel-item-remove {
  font-size:{{font.body.em}};
  color: {{danger}};
  padding:{{space.0.px}} {{space.1.px}};
  flex-shrink: 0;
}

.panel-empty {
  text-align: center;
  color: {{muted}};
  font-size:{{font.body.em}};
  margin-top:{{space.6.px*1.25}};
}

.panel-footer {
  padding:{{space.2.px}} {{space.3.px}};
  border-top: 1px solid {{background}};
}

.panel-clear {
  background: {{card}};
  color: {{danger}};
  font-size:{{font.body.em}};
  border: 1px solid {{danger}};
  border-radius:{{radius.0.px*1.3333333}};
  height: 36px;
  line-height: 36px;
}

/* ===== 定制菜品表单 ===== */
.custom-form {
  background: {{card}};
}
.custom-form-content { padding:{{space.3.px}} {{space.3.px}} calc({{space.5.px}} + env(safe-area-inset-bottom)); }

.form-title {
  font-size:{{font.section.em}};
  font-weight: bold;
  color: {{text}};
  margin-bottom:{{space.3.px}};
}

.form-input {
  width: 100%;
  height: {{controls.touchSize.px}};
  border: 1px solid {{border}};
  border-radius:{{radius.0.px*1.3333333}};
  padding:0 {{space.2.px}};
  font-size:{{font.card.em}};
  box-sizing: border-box;
  margin-bottom:{{space.2.px}};
}

.type-row {
  display: flex;
  align-items: center;
  margin-bottom:{{space.2.px}};
  flex-wrap: wrap;
}

.type-label {
  font-size:{{font.body.em}};
  color: {{muted}};
  margin-right:{{space.1.px}};
}

.type-options {
  display: flex;
  flex-wrap: wrap;
  gap:{{space.0.px*1.5}};
}

.type-opt {
  padding:{{space.0.px}} {{space.2.px}};
  border: 1px solid #ddd;
  border-radius:{{radius.2.px}};
  font-size:{{font.secondary.em}};
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
  border-radius:{{radius.0.px*1.3333333}};
  padding:{{space.1.px*1.25}} {{space.2.px}};
  font-size:{{font.body.em}};
  box-sizing: border-box;
  margin-bottom:{{space.2.px}};
  min-height: 80px;
}

.save-custom-btn {
  background: {{brand}};
  color: {{card}};
  font-size:{{font.card.em}};
  border-radius:{{radius.0.px*1.3333333}};
  height: {{controls.touchSize.px}};
  line-height: {{controls.touchSize.px}};
  margin-top:{{space.1.px}};
}
.shopping-btn { background: {{brandSoft}}; color: {{brand}}; }

.selector-input { color:{{text}}; }
.custom-tag-title { margin:{{space.1.px*1.25}} 0 {{space.1.px}}; color:{{muted}}; font-size:{{font.secondary.em}}; }
.custom-tag-grid { display: flex; flex-wrap: wrap; gap:{{space.1.px*0.875}}; margin-bottom:{{space.1.px*1.25}}; }
.custom-tag { padding:{{space.1.px*0.875}} {{space.1.px*1.125}}; border: 1px solid #d8dfdb; border-radius:{{radius.0.px*0.83333333}}; background: {{card}}; color:{{muted}}; font-size:{{font.caption.em}}; }
.custom-tag.selected { border-color: {{brand}}; background: {{brandSoft}}; color:{{brand}}; font-weight: 600; }

@media (min-width: 601px) {
  .page { flex-direction: row; }
  .category-scroll { width: 80px; height: auto; overflow-x: hidden; overflow-y: auto; border-right: 1px solid #deebe6; border-bottom: 0; }
  .sidebar { display: flex; flex-direction: column; min-width: 80px; height: auto; padding:0; }
  .sidebar-item { width: 80px; min-width: 80px; padding:{{space.4.px}} 0; border-bottom: 0; border-left: 3px solid transparent; }
  .sidebar-active { border-left-color: {{brand}}; border-bottom-color: transparent; }
  .custom-btn { margin-top:auto; border-top: 1px solid {{border}}; }
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

.ew-page .save-btn.shopping-btn { background:{{brandSoft}}; color:{{brand}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
