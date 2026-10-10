@import "../../styles/theme.wxss";
page { background:{{background}}; }
.profile-page { min-height:100vh; box-sizing:border-box; padding:{{space.3.px}} {{space.3.px}} calc({{space.4.px}} + env(safe-area-inset-bottom)); background:{{background}}; }
.profile-page .ew-heading { margin-bottom:{{space.1.px}}; }
.profile-page button { width:100%; min-width:44px; min-height:48px; height:auto; margin:0; font-family:inherit; font-size:{{font.body.em}}; line-height:1.5; text-align:left; border:0; box-sizing:border-box; }
.profile-page button::after { border:0; }
.user-card { display:flex; align-items:center; flex-wrap:wrap; gap:{{space.2.px}}; padding:{{space.3.px}} 0; background:transparent; color:{{text}}; border-bottom:1px solid {{divider}}; border-radius:0; }
.user-avatar { width:48px; height:48px; flex:0 0 48px; }
.avatar, .avatar-fallback { width:48px; height:48px; border-radius:{{radius.2.px}}; }
.avatar-fallback { display:flex; align-items:center; justify-content:center; background:{{warmSoft}}; color:{{warm}}; font-size:{{font.page.em}}; }
.user-info { flex:1; min-width:0; text-align:left; }
.nickname, .level { display:block; overflow-wrap:anywhere; }
.nickname { font-size:{{font.section.em}}; font-weight:600; color:{{text}}; }
.level { margin-top:2px; color:{{muted}}; font-size:{{font.secondary.em}}; }
.profile-edit-label { color:{{brand}}; font-size:{{font.secondary.em}}; overflow-wrap:anywhere; }
.shopping-shortcut { display:flex; align-items:center; gap:{{space.2.px}}; margin:{{space.2.px}} 0 !important; padding:{{space.2.px}}; background:{{brandSoft}}; border-radius:{{radius.2.px}}; }
.shopping-shortcut-body { flex:1; min-width:0; }
.shopping-shortcut-title, .shopping-shortcut-sync { display:block; overflow-wrap:anywhere; }
.shopping-shortcut-title { color:{{text}}; font-weight:600; font-size:{{font.body.em}}; }
.shopping-shortcut-sync { color:{{muted}}; font-size:{{font.secondary.em}}; margin-top:2px; }
.menu-section { margin:{{space.2.px}} 0; padding:0; }
.menu-list { background:transparent; }
.menu-item { display:flex; align-items:center; gap:{{space.2.px}}; padding:{{space.2.px}} 0; min-height:52px; border-bottom:1px solid {{divider}} !important; border-radius:0; background:transparent; }
.menu-title { flex:1; min-width:0; color:{{text}}; font-size:{{font.body.em}}; overflow-wrap:anywhere; }
.admin-entry { margin-top:{{space.2.px}} !important; }
.version-info { text-align:center !important; padding:{{space.2.px}} 0; background:transparent; }
.version-text { display:block; color:{{muted}}; font-size:{{font.caption.em}}; overflow-wrap:anywhere; }
