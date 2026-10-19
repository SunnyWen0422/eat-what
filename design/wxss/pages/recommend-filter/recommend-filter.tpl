@import "../../styles/theme.wxss";
/* Meal-scoped filters share chip geometry with catalog and long-term preferences. */
.ew-page.filter-page { height:100%; min-height:0; padding:0; background:{{background}}; color:{{text}}; }
.filter-page .mobile-scroll-content { padding:12px 16px 20px; }
.filter-page-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:44px; }
.filter-page-heading .ew-title { font-size:{{font.section.em}}; margin:0; }
.filter-scope-note, .offline-tip { color:{{muted}}; font-size:{{font.secondary.em}}; line-height:1.5; margin:4px 0 12px; }
.offline-tip { color:{{warning}}; }
.mode-row { display:flex; align-items:stretch; gap:4px; padding:3px; margin:12px 0 4px; background:{{surfaceSoft}}; border-radius:12px; }
.mode-btn { flex:1; display:flex; align-items:center; justify-content:center; min-height:44px; padding:6px 10px; box-sizing:border-box; font-size:{{font.secondary.em}}; line-height:1.5; border-radius:9px; color:{{muted}}; }
.mode-btn.active { background:{{brandSoft}}; color:{{brand}}; font-weight:600; }
.filter-section { padding:12px 0; margin:0; border-bottom:1px solid {{divider}}; }
.section-title { margin:0 0 4px; font-size:{{font.secondary.em}}; font-weight:600; line-height:1.5; color:{{muted}}; }
.ingredient-row { display:flex; align-items:center; gap:8px; margin-top:8px; }
.ingredient-input { flex:1; min-width:0; min-height:44px; height:44px; padding:8px 10px; box-sizing:border-box; background:{{card}}; border:1px solid {{border}}; border-radius:10px; font-size:{{font.secondary.em}}; }
.ew-page button.add-btn { width:auto; min-width:44px; min-height:44px; padding:8px 12px; margin:0; font-size:{{font.secondary.em}}; line-height:1.5; background:{{brandSoft}}; color:{{brand}}; border:0; border-radius:10px; }
.add-btn::after,.apply-btn::after { border:0; }
.ingredient-list { display:flex; flex-wrap:wrap; gap:4px 8px; margin-top:8px; }
.ingredient-chip { display:flex; align-items:center; min-height:44px; padding:6px 9px; box-sizing:border-box; background:{{brandSoft}}; color:{{brand}}; border-radius:10px; font-size:{{font.secondary.em}}; line-height:1.5; }
.action-bar { flex:0 0 auto; display:flex; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); box-sizing:border-box; background:{{background}}; border-top:1px solid {{divider}}; }
.ew-page button.apply-btn { width:100%; min-height:48px; padding:12px 16px; margin:0; border:0; border-radius:14px; background:{{brand}}; color:{{card}}; font-size:{{font.body.em}}; line-height:1.5; font-weight:600; }
