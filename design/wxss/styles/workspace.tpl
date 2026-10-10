/* One continuous meal surface; original commands and recovery stay in the controller. */
.workspace-screen { padding:0; background:{{background}}; }
.workspace-screen .mobile-scroll-content { padding:8px 16px 24px; }
.workspace-header { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:44px; }
.workspace-date { display:flex; align-items:center; gap:6px; color:{{muted}}; font-size:{{font.secondary.em}}; font-weight:500; }
.workspace-shopping,.workspace-more { display:flex; align-items:center; justify-content:center; gap:6px; flex:0 0 auto; min-width:44px; min-height:44px; padding:0 4px; margin:0; background:transparent; color:{{brand}}; border:0; border-radius:10px; line-height:1.5; font-size:{{font.secondary.em}}; }
.workspace-shopping::after,.workspace-more::after,.workspace-meal::after { border:0; }
.workspace-title-row { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; }
.workspace-title-row .ew-heading { flex:1; min-width:0; font-size:{{font.page.em}}; line-height:1.4; }
.workspace-meals { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:4px 0; }
.workspace-meal { min-width:60px; min-height:44px; padding:8px 14px; margin:0; border:0; border-radius:24px; background:{{brandSoft}}; color:{{brand}}; font-size:{{font.secondary.em}}; line-height:1.5; }
.workspace-meal.is-active { background:{{brand}}; color:{{card}}; font-weight:600; }
.workspace-other-day { display:flex; align-items:center; justify-content:space-between; gap:8px; color:{{muted}}; font-size:{{font.secondary.em}}; }
.workspace-screen button.workspace-requirements-entry { display:flex; align-items:center; gap:8px; width:100%; min-height:48px; padding:8px 12px; margin:8px 0 0; border:1px solid {{border}}; border-radius:12px; background:{{card}}; color:{{text}}; text-align:left; line-height:1.5; box-sizing:border-box; }
.workspace-requirements-entry::after { border:0; }
.requirements-label { flex:0 0 auto; font-size:{{font.secondary.em}}; font-weight:500; }
.requirements-summary { flex:1; min-width:0; color:{{muted}}; font-size:{{font.secondary.em}}; overflow-wrap:anywhere; }
.workspace-light-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.workspace-screen .workspace-optional-actions { justify-content:space-between; margin:0; border-bottom:1px solid {{divider}}; }
.workspace-screen .workspace-optional-actions button.ew-link { display:flex; align-items:center; gap:6px; max-width:100%; margin:0; padding:8px 0; min-height:44px; font-size:{{font.secondary.em}}; white-space:normal; text-align:left; background:transparent; border:0; }
.workspace-optional-actions .ew-link text { min-width:0; overflow-wrap:anywhere; }
.workspace-exclusions { color:{{muted}}; font-size:{{font.secondary.em}}; line-height:1.5; padding:4px 0; overflow-wrap:anywhere; }
.workspace-empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:40px 16px; }
.workspace-empty-title { display:block; margin-top:8px; font-size:{{font.body.em}}; font-weight:600; }
.workspace-menu-section { margin:0; }
.workspace-menu-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:44px; }
.workspace-screen .workspace-menu-heading button.ew-link { display:flex; gap:6px; margin:0; padding:0 4px; background:transparent; border:0; font-size:{{font.secondary.em}}; }
.workspace-menu { background:transparent; padding:0; }
.workspace-menu-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
.workspace-menu-footer .ew-link { margin:0 0 0 auto; }
.workspace-reasons { padding:4px 0; }
.workspace-reasons text { display:block; margin:4px 0; }
.workspace-next { margin:8px 0; }
.workspace-screen button.workspace-next-row { display:flex; align-items:center; gap:8px; width:100%; margin:0; min-height:52px; padding:12px 0; border:0; border-bottom:1px solid {{divider}}; border-radius:0; background:transparent; color:{{text}}; text-align:left; line-height:1.5; }
.workspace-next-row .ew-title { flex:1; min-width:0; font-weight:500; }
.workspace-next-row::after { border:0; }
.workspace-feedback { margin:8px 0; }
.workspace-saved-result { display:flex; flex-direction:column; align-items:flex-start; gap:4px; padding:8px 0; color:{{brand}}; font-size:{{font.secondary.em}}; }
.workspace-screen .ew-bottom { flex-shrink:0; background:{{background}}; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); }
.mode-today .ew-bottom { padding-bottom:12px; }
.workspace-people { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 0; }
.workspace-stepper { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-width:0; }
.workspace-screen .workspace-stepper button.ew-link { min-width:44px; min-height:44px; margin:0; padding:0; font-size:{{font.section.em}}; background:{{card}}; border:1px solid {{border}}; border-radius:10px; }
.workspace-people-input { width:3em; min-width:44px; min-height:44px; padding:4px; font-size:{{font.body.em}}; text-align:center; border:0; border-radius:10px; background:{{background}}; color:{{text}}; box-sizing:border-box; }
.workspace-composition-row { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; min-height:52px; padding:8px 0; border-bottom:1px solid {{divider}}; }
.workspace-composition-row > text { flex:1; min-width:0; overflow-wrap:anywhere; }
.workspace-composition-presets { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
.workspace-screen .workspace-composition-presets button.ew-link { width:auto; min-height:44px; margin:0; padding:8px 12px; white-space:normal; background:{{brandSoft}}; border-radius:10px; }
.workspace-shortage { padding:12px 0; }
.workspace-shortage > text { display:block; overflow-wrap:anywhere; }
.workspace-screen .workspace-requirements { width:100%; min-height:112px; height:112px; padding:12px; margin:12px 0; background:{{card}}; border:1px solid {{controlBorder}}; border-radius:12px; font-size:{{font.body.em}}; line-height:1.6; box-sizing:border-box; }
.workspace-save-fields { display:flex; flex-direction:column; gap:8px; margin:16px 0; }
.workspace-save-field { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; min-height:48px; gap:12px; padding:8px 12px; border-bottom:1px solid {{divider}}; box-sizing:border-box; }
.workspace-save-field text { overflow-wrap:anywhere; }
.actual-plan { margin:16px 0; }
.actual-choices { display:flex; flex-direction:column; gap:8px; margin:16px 0; }
.actual-choice { margin:0; padding:12px; min-width:44px; min-height:44px; background:{{card}}; color:{{text}}; font-size:{{font.body.em}}; text-align:left; border:1px solid {{controlBorder}}; border-radius:14px; line-height:1.5; }
.actual-choice.selected { border-color:{{brand}}; background:{{brandSoft}}; font-weight:600; }
.actual-choice::after { border:0; }
@media(max-width:360px) { .workspace-empty { padding:24px 12px; }.workspace-meals { gap:4px; }.workspace-meal { padding:8px 12px; } }
