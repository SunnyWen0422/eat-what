@import "../../styles/theme.wxss";
.settings-page { min-height: 100vh; box-sizing: border-box; padding: 16px 16px 32px; background: #f5f7f6; color: #202824; }
.sync-row { display: flex; align-items: center; gap: 7px; margin-bottom: 14px; color: #65716b; font-size:0.8571em; }
.sync-dot { width: 7px; height: 7px; border-radius: 50%; background: #c08a24; }
.sync-dot.online { background: {{brand}}; }
.section { padding: 17px 0; border-bottom: 1px solid #dde3e0; }
.section-title { margin-bottom: 5px; font-size:1.1429em; font-weight: 700; }
.section-desc { margin-bottom: 12px; color: #7a8580; font-size:0.8571em; line-height: 1.5; }
.chip-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.choice-chip { min-width: 66px; box-sizing: border-box; padding: 9px 12px; border: 1px solid #d5dcd8; border-radius: 6px; background: {{card}}; color: {{muted}}; text-align: center; font-size:0.9286em; }
.choice-chip.selected { border-color: {{brand}}; background: {{brandSoft}}; color: #116747; font-weight: 600; }
.choice-chip.danger.selected { border-color: #bd5143; background: {{dangerSoft}}; color: #9b3529; }
.ingredient-row { display: flex; gap: 8px; }
.ingredient-input { min-width: 0; flex: 1; height: 42px; box-sizing: border-box; padding: 0 12px; border: 1px solid #d5dcd8; border-radius: 6px; background: {{card}}; font-size:1.0em; }
.add-btn { width: 76px; height: 42px; line-height: 42px; padding: 0; border-radius: 6px; background: {{brandSoft}}; color: #137a55; font-size:1.0em; }
.top-gap { margin-top: 10px; }
.ingredient-chip { padding: 7px 10px; border-radius: 5px; background: {{dangerSoft}}; color: #a33e31; font-size:0.8571em; }
.save-btn { margin-top: 24px; height: 46px; line-height: 46px; border-radius: 6px; background: {{brand}}; color: {{card}}; font-size:1.0714em; font-weight: 600; }

/* 页面共享主题，适用于本页详情、表单和弹层。 */

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:24rpx; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:44px; min-width:44px; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:44px;box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:48px}
