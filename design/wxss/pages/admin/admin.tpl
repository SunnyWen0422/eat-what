@import "../../styles/theme.wxss";
page {
  min-height: 100%;
  background: {{background}};
  color: #202523;
}

button::after {
  border: none;
}

.admin-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 24rpx 24rpx 0;
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
  margin-bottom: 18rpx;
}

.page-title {
  display: block;
  font-size:1.3571em;
  font-weight: 700;
  color: #17201c;
}

.page-count,
.section-count {
  display: block;
  margin-top: 4rpx;
  color: #6f7873;
  font-size:0.8571em;
}

.search-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112rpx;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.search-field {
  min-width: 0;
  min-height: 88rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  background: {{card}};
  border: 2rpx solid #dce2df;
  border-radius: 12rpx;
  padding: 0 18rpx;
}

.search-input {
  min-width: 0;
  flex: 1;
  height: 84rpx;
  font-size:1.0em;
}

.clear-button,
.nav-icon {
  flex: none;
  width: 72rpx;
  min-height: 72rpx;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #68716d;
  font-size:1.3571em;
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
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size:1.0em;
  line-height: 1.25;
}

.search-button,
.primary-action {
  background: {{brand}};
  color: {{card}};
  border-radius: 12rpx;
  font-weight: 600;
}

.result-note {
  margin: 4rpx 0 14rpx;
  color: #626c67;
  font-size:0.8571em;
  word-break: break-word;
}

.feedback-banner {
  min-height: 68rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  margin: 0 0 14rpx;
  padding: 12rpx 18rpx;
  border-radius: 8rpx;
  font-size:0.8571em;
  line-height: 1.4;
  word-break: break-word;
}

.feedback-banner.busy {
  color: {{brand}};
  background: {{brandSoft}};
}

.feedback-banner.warning {
  color: #835117;
  background: {{warningSoft}};
}

.user-list,
.dish-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.user-card,
.dish-card {
  min-height: 124rpx;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx;
  background: {{card}};
  border: 2rpx solid #e3e7e5;
  border-radius: 16rpx;
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
  color: #1d2521;
  font-size:1.0714em;
  font-weight: 650;
  word-break: break-word;
}

.user-meta,
.dish-meta,
.dish-tags,
.summary-line {
  display: block;
  margin-top: 8rpx;
  color: #68716d;
  font-size:0.8571em;
  line-height: 1.45;
  word-break: break-word;
}

.status-badge {
  flex: none;
  margin-left: 12rpx;
  padding: 6rpx 12rpx;
  border-radius: 8rpx;
  font-size:0.8571em;
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
  color: #8c9590;
  font-size:1.5em;
}

.state-block {
  min-height: 260rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40rpx 24rpx;
  color: #6c7570;
  text-align: center;
}

.state-block.compact {
  min-height: 180rpx;
}

.state-title {
  font-size:0.9643em;
}

.state-button {
  margin-top: 20rpx;
  padding: 0 32rpx;
  color: {{brand}};
  background: {{card}};
  border: 2rpx solid {{brand}};
  border-radius: 12rpx;
}

.loading-line {
  width: 86%;
  height: 28rpx;
  margin: 10rpx 0;
  border-radius: 8rpx;
  background: #e2e7e4;
}

.loading-line.short {
  width: 58%;
}

.load-more {
  margin-top: 8rpx;
  color: {{brand}};
  background: transparent;
}

.list-end {
  padding: 28rpx 0 calc(28rpx + env(safe-area-inset-bottom));
  color: #929a96;
  font-size:0.8571em;
  text-align: center;
}

.page-nav {
  min-height: 88rpx;
  margin-bottom: 16rpx;
}

.nav-icon {
  width: 88rpx;
  min-height: 88rpx;
  margin-left: -16rpx;
  color: #1f6e4e;
  font-size:1.8571em;
}

.nav-title {
  font-size:1.1429em;
  font-weight: 650;
}

.nav-spacer {
  width: 72rpx;
}

.user-summary,
.target-user {
  padding: 24rpx;
  background: {{card}};
  border-left: 6rpx solid {{brand}};
  border-radius: 8rpx;
}

.summary-title-row {
  margin-bottom: 12rpx;
}

.section-heading {
  min-height: 78rpx;
  margin-top: 18rpx;
}

.section-title {
  font-size:1.0em;
  font-weight: 650;
}

.section-count {
  margin: 0;
  padding: 4rpx 12rpx;
  background: {{border}};
  border-radius: 8rpx;
}

.delete-button {
  min-width: 96rpx;
  min-height: 72rpx;
  padding: 0 20rpx;
  color: #b8323c;
  background: #fff2f3;
  border-radius: 10rpx;
  font-size:0.8571em;
}

.action-bar {
  position: sticky;
  z-index: 20;
  bottom: 0;
  display: flex;
  gap: 16rpx;
  margin: 24rpx -24rpx 0;
  padding: 18rpx 24rpx calc(18rpx + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.97);
  border-top: 2rpx solid #e1e6e3;
}

.primary-action,
.secondary-action {
  flex: 1;
}

.secondary-action {
  background: #eef1ef;
  color: #46504b;
  border-radius: 12rpx;
}

.target-user {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  margin-bottom: 18rpx;
}

.target-label {
  flex: none;
  color: #69736e;
  font-size:0.8571em;
}

.target-name {
  min-width: 0;
  color: #1d2521;
  font-size:1.0em;
  font-weight: 600;
  word-break: break-word;
}

.form-section {
  margin: 0 -24rpx;
  padding: 24rpx;
  background: {{card}};
  border-bottom: 2rpx solid #edf0ee;
}

.field-label,
.tag-group-label {
  display: block;
  margin-bottom: 14rpx;
  color: #343d38;
  font-size:0.8929em;
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
  border-radius: 12rpx;
  color: #202723;
  font-size:1.0em;
}

.field-input {
  padding: 0 20rpx;
}

.field-textarea {
  min-height: 176rpx;
  padding: 20rpx;
  line-height: 1.55;
}

.field-textarea.steps {
  min-height: 230rpx;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.type-option,
.tag-chip {
  padding: 12rpx 14rpx;
  color: #4f5954;
  background: #f2f5f3;
  border: 2rpx solid transparent;
  border-radius: 10rpx;
}

.type-option.selected,
.tag-chip.selected {
  color: #175e42;
  background: #e1f2e9;
  border-color: #4d9878;
  font-weight: 600;
}

.split-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18rpx;
}

.split-field {
  min-width: 0;
}

.picker-field,
.number-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18rpx;
}

.number-input {
  min-width: 0;
  flex: 1;
  height: 84rpx;
}

.number-unit {
  flex: none;
  color: #69726e;
  font-size:0.8571em;
}

.tag-group + .tag-group {
  margin-top: 22rpx;
}

.tag-group-label {
  color: #6a746f;
  font-weight: 500;
}

.tag-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10rpx;
}

.tag-chip {
  min-width: 0;
  min-height: 72rpx;
  font-size:0.8571em;
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
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:24rpx; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:44px; min-width:44px; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:44px;box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:48px}
