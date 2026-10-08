@import "../../styles/theme.wxss";
page { background: {{card}}; }
.profile-page { min-height:100vh; box-sizing:border-box; padding:{{space.1.rpx}} 0 calc({{space.2.rpx*1.1666667}} + env(safe-area-inset-bottom)); overflow-x:hidden; background:linear-gradient(180deg,{{brandSoft}} 0,{{background}} 240rpx,{{card}} 520rpx); }
.user-card { margin:0 {{space.1.rpx*1.25}} {{space.1.rpx}}; padding:{{space.3.rpx*0.9375}} {{space.2.rpx}} {{space.2.rpx*1.0833333}}; border-radius:{{radius.1.rpx*1.1}}; display:flex; flex-direction:column; align-items:center; background:{{brand}}; color:{{card}}; }
.user-avatar { position:relative; margin-bottom:{{space.0.rpx*1.5}}; }
.avatar { width:112rpx; height:112rpx; border-radius:50%; border:4rpx solid rgba(255,255,255,.86); }
.edit-btn { position:absolute; right:-4rpx; bottom:-4rpx; width:38rpx; height:38rpx; display:flex; align-items:center; justify-content:center; border:2rpx solid {{brandSoft}}; border-radius:50%; background:{{card}}; }
.edit-icon { width:28rpx; height:28rpx; color:{{brand}}; }
.user-info { text-align:center; }
.nickname { display:block; max-width:100%; font-size:{{font.section.em}}; font-weight:700; word-break:break-word; }
.level { display:block; margin-top:{{space.0.rpx*0.75}}; font-size:{{font.caption.em}}; opacity:.85; }
.shopping-shortcut { margin:0 {{space.1.rpx*1.25}} {{space.1.rpx*1.125}}; padding:{{space.1.rpx*1.125}}; display:flex; align-items:center; gap:{{space.1.rpx*0.875}}; border:1rpx solid #cce8df; border-radius:{{radius.0.rpx*1.3333333}}; background:{{card}}; }
.shopping-shortcut-icon { width:68rpx; height:68rpx; flex:0 0 auto; display:flex; align-items:center; justify-content:center; border-radius:{{radius.0.rpx*1.3333333}}; background:{{brandSoft}}; color:{{brand}}; }
.shopping-shortcut-body { min-width:0; flex:1; }
.shopping-shortcut-title,.shopping-shortcut-count,.shopping-shortcut-sync { display:block; word-break:break-word; }
.shopping-shortcut-title { color:{{text}}; font-size:{{font.body.em}}; font-weight:700; }
.shopping-shortcut-count { margin-top:{{space.0.rpx*0.625}}; color:{{brand}}; font-size:{{font.caption.em}}; }
.shopping-shortcut-sync { margin-top:{{space.0.rpx*0.5}}; color:{{muted}}; font-size:{{font.caption.em}}; }
.shopping-shortcut-open { flex:0 0 auto; min-width:132rpx; margin:0; padding:0; background:transparent; color:{{brand}}; font-size:{{font.caption.em}}; }
.shopping-shortcut-open::after { border:0; }
.menu-section { margin:0 {{space.1.rpx*1.25}}; overflow:hidden; border:1rpx solid {{border}}; border-radius:{{radius.0.rpx*1.3333333}}; background:{{card}}; }
.menu-list { padding:0; }
.menu-item { min-height:94rpx; box-sizing:border-box; display:flex; align-items:center; gap:{{space.0.rpx*1.5}}; padding:{{space.1.rpx}} {{space.1.rpx*1.25}}; border-bottom:1rpx solid #eef4f1; }
.menu-item:last-child { border-bottom:0; }
.menu-item:active { background:#f4fbf9; }
.menu-icon { width:44rpx; display:flex; align-items:center; justify-content:center; color:{{brand}}; }
.menu-icon .line-icon { width:34rpx; height:34rpx; }
.menu-content { min-width:0; flex:1; }
.menu-title,.menu-desc { display:block; word-break:break-word; }
.menu-title { color:{{text}}; font-size:{{font.body.em}}; }
.menu-desc { margin-top:{{space.0.rpx*0.5}}; color:{{muted}}; font-size:{{font.caption.em}}; }
.menu-arrow { flex:0 0 auto; color:{{muted}}; font-size:{{font.section.em}}; }
.version-info { margin-top:{{space.3.rpx*1.0625}}; padding:0 {{space.1.rpx*1.25}}; text-align:center; }
.version-text { color:{{muted}}; font-size:{{font.caption.em}}; }
.login-modal-mask { position:fixed; inset:0; background:rgba(20,44,37,.42); z-index:200; opacity:0; visibility:hidden; transition:all .3s; }
.login-modal { position:fixed; left:0; right:0; bottom:0; z-index:201; box-sizing:border-box; padding:{{space.2.rpx}} {{space.2.rpx}} calc({{space.2.rpx}} + env(safe-area-inset-bottom)); border-radius:{{radius.1.rpx*1.1}} {{radius.1.rpx*1.1}} 0 0; background:{{card}}; transform:translateY(100%); transition:transform .3s; }
.modal-show { transform:translateY(0); }
.login-modal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:{{space.0.rpx}}; }
.login-modal-title { color:{{text}}; font-size:{{font.section.em}}; font-weight:700; }
.login-modal-close { padding:{{space.0.rpx*0.5}} {{space.0.rpx}}; color:{{muted}}; font-size:{{font.section.em}}; }
.login-modal-desc { margin-bottom:{{space.1.rpx*1.25}}; color:{{muted}}; font-size:{{font.caption.em}}; }
.wx-login-btn { height:88rpx; line-height:88rpx; margin-bottom:{{space.0.rpx*1.5}}; border-radius:{{radius.0.rpx*1.1666667}}; background:{{brand}}; color:{{card}}; font-size:{{font.body.em}}; }
.login-skip { padding:{{space.0.rpx*1.25}}; text-align:center; color:{{muted}}; font-size:{{font.caption.em}}; }
@media (max-width:360px) { .shopping-shortcut { gap:{{space.0.rpx}}; padding:{{space.1.rpx*0.875}}; } .shopping-shortcut-open { min-width:110rpx; font-size:{{font.caption.em}}; } .menu-item { padding-left:{{space.1.rpx*0.875}}; padding-right:{{space.1.rpx*0.875}}; } }

/* 页面共享主题，适用于本页详情、表单和弹层。 */

.avatar-fallback { width:120rpx;height:120rpx;border-radius:{{radius.4.rpx*1.25}};background:{{brandSoft}};color:{{brand}};display:flex;align-items:center;justify-content:center;font-size:{{font.page.em}}; }

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:{{radius.1.rpx*1.2}}; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:{{controls.touchSize.px}}; min-width:{{controls.touchSize.px}}; box-sizing:border-box; }

.login-modal-close, .login-skip, .edit-btn { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; display:flex; align-items:center; justify-content:center; box-sizing:border-box; }

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:{{controls.touchSize.px}};box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:{{controls.primaryHeight.px}}}

.login-modal-mask.mask-show { visibility:visible; opacity:1; }

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }

/* Warm table v2: account, preparation, then personal content. */
.profile-page { padding:20px 16px 32px; background:{{background}}; }
.user-card { display:flex; align-items:center; gap:12px; background:transparent; color:{{text}}; padding:20px 0; margin:0; box-shadow:none; border:0; border-radius:0; text-align:left; }
.user-avatar { width:64px; height:64px; margin:0; flex:0 0 64px; }.avatar, .avatar-fallback { width:64px; height:64px; border:0; border-radius:22px; }.avatar-fallback { background:{{warmSoft}}; color:{{warm}}; display:flex; align-items:center; justify-content:center; font-size:{{font.page.em}}; }
.user-info { flex:1; min-width:0; }.nickname { color:{{text}}; font-size:{{font.page.em}}; line-height:1.4; overflow-wrap:anywhere; }.level { color:{{muted}}; font-size:{{font.body.em}}; margin-top:4px; }.profile-edit-label { font-size:{{font.secondary.em}}; color:{{brand}}; }
.shopping-shortcut { display:flex; align-items:center; gap:12px; background:{{warmSoft}}; border:0; border-radius:16px; padding:16px; text-align:left; box-shadow:none; }.shopping-shortcut-body { flex:1; min-width:0; }.shopping-shortcut-title { font-size:{{font.reading.em}}; color:{{text}}; }.shopping-shortcut-sync { color:{{muted}}; line-height:1.6; font-size:{{font.secondary.em}}; }
.menu-section { margin-top:24px; }.menu-list { background:{{card}}; border:0; border-radius:18px; overflow:hidden; }.menu-item { display:flex; align-items:center; gap:12px; background:{{card}}; text-align:left; padding:14px 16px; border:0; border-radius:0; min-height:60px; border-bottom:1px solid {{divider}}; }.menu-title { flex:1; font-size:{{font.reading.em}}; color:{{text}}; line-height:1.6; }.admin-entry { border-radius:18px; margin-top:16px; }
.version-info { background:transparent; padding:16px 0; border:0; text-align:center; color:{{muted}}; }.version-text { font-size:{{font.caption.em}}; }

.user-card { flex-direction:row; }.level { opacity:1; }

.user-card, .shopping-shortcut, .menu-item, .admin-entry, .version-info { width:100%; margin-left:0; margin-right:0; }.menu-section { margin:24px 0 0; padding:0; border:0; background:transparent; box-shadow:none; }.user-info { text-align:left; }.nickname, .level { display:block; }
