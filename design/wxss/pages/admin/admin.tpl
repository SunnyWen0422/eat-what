@import "../../styles/theme.wxss";
page {
  min-height: 100%;
  background: {{background}};
  color:{{text}};
}

button::after {
  border: none;
}

.admin-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding:{{space.2.rpx}} {{space.2.rpx}} 0;
}

.page-heading,
.page-nav,
.summary-title-row,
.section-heading,
.user-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-heading {
  min-height: 88rpx;
  margin-bottom:{{space.1.rpx*1.125}};
}

.page-title {
  display: block;
  font-size:{{font.section.em}};
  font-weight: 700;
  color:{{text}};
}

.page-count,
.section-count {
  display: block;
  margin-top:{{space.0.rpx*0.5}};
  color:{{muted}};
  font-size:{{font.caption.em}};
}

.search-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112rpx;
  gap:{{space.0.rpx*1.5}};
  margin-bottom:{{space.1.rpx}};
}

.search-field {
  min-width: 0;
  min-height: 88rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  background: {{card}};
  border: 2rpx solid #dce2df;
  border-radius:{{radius.0.rpx}};
  padding:0 {{space.1.rpx*1.125}};
}

.search-input {
  min-width: 0;
  flex: 1;
  height: 84rpx;
  font-size:{{font.body.em}};
}

.clear-button,
.nav-icon {
  flex: none;
  width: 72rpx;
  min-height: 72rpx;
  margin:0;
  padding:0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color:{{muted}};
  font-size:{{font.section.em}};
  line-height: 1;
}

.search-button,
.state-button,
.load-more,
.secondary-action,
.primary-action,
.delete-button,
.type-option,
.tag-chip {
  min-height: 88rpx;
  box-sizing: border-box;
  margin:0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size:{{font.body.em}};
  line-height: 1.25;
}

.search-button,
.primary-action {
  background: {{brand}};
  color: {{card}};
  border-radius:{{radius.0.rpx}};
  font-weight: 600;
}

.result-note {
  margin:{{space.0.rpx*0.5}} 0 {{space.1.rpx*0.875}};
  color:{{muted}};
  font-size:{{font.caption.em}};
  word-break: break-word;
}

.feedback-banner {
  min-height: 68rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  margin:0 0 {{space.1.rpx*0.875}};
  padding:{{space.0.rpx*1.5}} {{space.1.rpx*1.125}};
  border-radius:{{radius.0.rpx*0.66666667}};
  font-size:{{font.caption.em}};
  line-height: 1.4;
  word-break: break-word;
}

.feedback-banner.busy {
  color: {{brand}};
  background: {{brandSoft}};
}

.feedback-banner.warning {
  color:{{warning}};
  background: {{warningSoft}};
}

.user-list,
.dish-list {
  display: flex;
  flex-direction: column;
  gap:{{space.0.rpx*1.5}};
}

.user-card,
.dish-card {
  min-height: 124rpx;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap:{{space.1.rpx}};
  padding:{{space.1.rpx*1.25}};
  background: {{card}};
  border: 2rpx solid #e3e7e5;
  border-radius:{{radius.0.rpx*1.3333333}};
}

.user-card:active {
  background: #edf5f1;
}

.user-main,
.dish-content {
  min-width: 0;
}

.user-name,
.dish-name,
.summary-title {
  min-width: 0;
  color:{{text}};
  font-size:{{font.body.em}};
  font-weight: 650;
  word-break: break-word;
}

.user-meta,
.dish-meta,
.dish-tags,
.summary-line {
  display: block;
  margin-top:{{space.0.rpx}};
  color:{{muted}};
  font-size:{{font.caption.em}};
  line-height: 1.45;
  word-break: break-word;
}

.status-badge {
  flex: none;
  margin-left:{{space.0.rpx*1.5}};
  padding:{{space.0.rpx*0.75}} {{space.0.rpx*1.5}};
  border-radius:{{radius.0.rpx*0.66666667}};
  font-size:{{font.caption.em}};
}

.status-badge.active {
  color: {{brand}};
  background: {{brandSoft}};
}

.status-badge.disabled {
  color: {{warning}};
  background: {{warningSoft}};
}

.row-arrow {
  color:{{muted}};
  font-size:{{font.page.em}};
}

.state-block {
  min-height: 260rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding:{{space.4.rpx}} {{space.2.rpx}};
  color:{{muted}};
  text-align: center;
}

.state-block.compact {
  min-height: 180rpx;
}

.state-title {
  font-size:{{font.body.em}};
}

.state-button {
  margin-top:{{space.1.rpx*1.25}};
  padding:0 {{space.3.rpx}};
  color: {{brand}};
  background: {{card}};
  border: 2rpx solid {{brand}};
  border-radius:{{radius.0.rpx}};
}

.loading-line {
  width: 86%;
  height: 28rpx;
  margin:{{space.0.rpx*1.25}} 0;
  border-radius:{{radius.0.rpx*0.66666667}};
  background: #e2e7e4;
}

.loading-line.short {
  width: 58%;
}

.load-more {
  margin-top:{{space.0.rpx}};
  color: {{brand}};
  background: transparent;
}

.list-end {
  padding:{{space.2.rpx*1.1666667}} 0 calc({{space.2.rpx*1.1666667}} + env(safe-area-inset-bottom));
  color:{{muted}};
  font-size:{{font.caption.em}};
  text-align: center;
}

.page-nav {
  min-height: 88rpx;
  margin-bottom:{{space.1.rpx}};
}

.nav-icon {
  width: 88rpx;
  min-height: 88rpx;
  margin-left:-{{space.1.rpx}};
  color:{{brand}};
  font-size:{{font.page.em*1.08331}};
}

.nav-title {
  font-size:{{font.card.em}};
  font-weight: 650;
}

.nav-spacer {
  width: 72rpx;
}

.user-summary,
.target-user {
  padding:{{space.2.rpx}};
  background: {{card}};
  border-left: 6rpx solid {{brand}};
  border-radius:{{radius.0.rpx*0.66666667}};
}

.summary-title-row {
  margin-bottom:{{space.0.rpx*1.5}};
}

.section-heading {
  min-height: 78rpx;
  margin-top:{{space.1.rpx*1.125}};
}

.section-title {
  font-size:{{font.body.em}};
  font-weight: 650;
}

.section-count {
  margin:0;
  padding:{{space.0.rpx*0.5}} {{space.0.rpx*1.5}};
  background: {{border}};
  border-radius:{{radius.0.rpx*0.66666667}};
}

.delete-button {
  min-width: 96rpx;
  min-height: 72rpx;
  padding:0 {{space.1.rpx*1.25}};
  color:{{danger}};
  background: #fff2f3;
  border-radius:{{radius.0.rpx*0.83333333}};
  font-size:{{font.caption.em}};
}

.action-bar {
  position: sticky;
  z-index: 20;
  bottom: 0;
  display: flex;
  gap:{{space.1.rpx}};
  margin:{{space.2.rpx}} -{{space.2.rpx}} 0;
  padding:{{space.1.rpx*1.125}} {{space.2.rpx}} calc({{space.1.rpx*1.125}} + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.97);
  border-top: 2rpx solid #e1e6e3;
}

.primary-action,
.secondary-action {
  flex: 1;
}

.secondary-action {
  background: #eef1ef;
  color:{{text}};
  border-radius:{{radius.0.rpx}};
}

.target-user {
  display: flex;
  align-items: baseline;
  gap:{{space.1.rpx*0.875}};
  margin-bottom:{{space.1.rpx*1.125}};
}

.target-label {
  flex: none;
  color:{{muted}};
  font-size:{{font.caption.em}};
}

.target-name {
  min-width: 0;
  color:{{text}};
  font-size:{{font.body.em}};
  font-weight: 600;
  word-break: break-word;
}

.form-section {
  margin:0 -{{space.2.rpx}};
  padding:{{space.2.rpx}};
  background: {{card}};
  border-bottom: 2rpx solid #edf0ee;
}

.field-label,
.tag-group-label {
  display: block;
  margin-bottom:{{space.1.rpx*0.875}};
  color:{{text}};
  font-size:{{font.secondary.em}};
  font-weight: 600;
}

.field-input,
.picker-field,
.number-field,
.field-textarea {
  width: 100%;
  min-height: 88rpx;
  box-sizing: border-box;
  background: #f7f9f8;
  border: 2rpx solid #dfe5e2;
  border-radius:{{radius.0.rpx}};
  color:{{text}};
  font-size:{{font.body.em}};
}

.field-input {
  padding:0 {{space.1.rpx*1.25}};
}

.field-textarea {
  min-height: 176rpx;
  padding:{{space.1.rpx*1.25}};
  line-height: 1.55;
}

.field-textarea.steps {
  min-height: 230rpx;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap:{{space.0.rpx*1.5}};
}

.type-option,
.tag-chip {
  padding:{{space.0.rpx*1.5}} {{space.1.rpx*0.875}};
  color:{{text}};
  background: #f2f5f3;
  border: 2rpx solid transparent;
  border-radius:{{radius.0.rpx*0.83333333}};
}

.type-option.selected,
.tag-chip.selected {
  color:{{brand}};
  background: #e1f2e9;
  border-color: #4d9878;
  font-weight: 600;
}

.split-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap:{{space.1.rpx*1.125}};
}

.split-field {
  min-width: 0;
}

.picker-field,
.number-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding:0 {{space.1.rpx*1.125}};
}

.number-input {
  min-width: 0;
  flex: 1;
  height: 84rpx;
}

.number-unit {
  flex: none;
  color:{{muted}};
  font-size:{{font.caption.em}};
}

.tag-group + .tag-group {
  margin-top:{{space.2.rpx*0.91666667}};
}

.tag-group-label {
  color:{{muted}};
  font-weight: 500;
}

.tag-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap:{{space.0.rpx*1.25}};
}

.tag-chip {
  min-width: 0;
  min-height: 72rpx;
  font-size:{{font.caption.em}};
  white-space: normal;
  word-break: break-word;
}

.dual-actions .secondary-action {
  flex: 0 0 32%;
}

@media (max-width: 360px) {
  .search-bar {
    grid-template-columns: minmax(0, 1fr) 104rpx;
  }

  .split-fields {
    grid-template-columns: 1fr;
  }

  .tag-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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

.section-count { color:{{text}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
