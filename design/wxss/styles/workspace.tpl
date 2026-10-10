/* Shared meal state, with task-specific Today, result and expression views. */
.workspace-screen{padding:0;background:{{background}}}.workspace-screen .mobile-scroll-content{padding:{{space.3.px}} {{space.3.px}} {{space.5.px}}}.workspace-header{display:flex;justify-content:space-between;align-items:center;gap:{{space.2.px}};margin-bottom:{{space.3.px}}}.workspace-header .ew-link{gap:{{space.1.px}};font-weight:500}.workspace-target{display:flex;justify-content:space-between;align-items:center;gap:{{space.1.px}};flex-wrap:wrap;margin-bottom:{{space.2.px}}}.workspace-target-date{display:flex;align-items:center;gap:{{space.1.px}};flex-wrap:wrap;font-size:{{font.reading.em}};font-weight:500}.workspace-target-date picker>view{display:flex;align-items:center;gap:{{space.0.px}};min-height:{{controls.touchSize.px}}}.workspace-summary{display:flex;align-items:center;gap:{{space.1.px}};flex-wrap:wrap;margin:{{space.1.px}} 0 {{space.4.px}}}.workspace-summary .ew-link{margin-left:auto}.workspace-question{font-size:{{font.section.em}};line-height:1.5;font-weight:500;margin-bottom:{{space.1.px}}}.workspace-expression{margin:{{space.4.px}} 0}.workspace-requirements{box-sizing:border-box;width:100%;min-height:112px;height:112px;margin:{{space.3.px}} 0 {{space.1.px}};font-size:{{font.reading.em}};line-height:1.6}.workspace-menu-section{margin-top:{{space.4.px}}}.workspace-menu-section>.ew-section-title{display:block;margin-bottom:{{space.2.px}}}.workspace-menu{background:{{card}};border-radius:{{radius.3.px}};padding:{{space.0.px}} {{space.3.px}}}.workspace-dish{padding:{{space.2.px}} 0;border-bottom:1px solid {{divider}}}.workspace-dish:last-child{border-bottom:0}.workspace-dish-title{display:flex;align-items:center;justify-content:space-between;gap:{{space.2.px}};width:100%;margin:0;padding:{{space.0.px}} 0;background:transparent;text-align:left;line-height:1.5;border:0;border-radius:0}.workspace-dish-title::after{border:0}.workspace-dish-copy{flex:1;min-width:0}.workspace-dish-name{display:block;font-size:{{font.reading.em}};font-weight:500;color:{{text}}}.workspace-dish-copy .ew-muted{display:block;margin-top:{{space.0.px}}}.workspace-dish-actions{display:flex;align-items:center;gap:{{space.2.px}};flex-wrap:wrap;margin-top:{{space.0.px}}}.workspace-menu-footer{display:flex;align-items:center;gap:{{space.1.px}};flex-wrap:wrap;padding:{{space.0.px}} 0}.workspace-menu-footer .ew-muted{flex:1;min-width:100px}.workspace-reasons{padding:{{space.1.px}} 0}.workspace-reasons text{display:block;margin-bottom:{{space.0.px}}}.workspace-light-actions{display:flex;align-items:center;gap:{{space.2.px}};flex-wrap:wrap;margin:{{space.1.px}} 0}.workspace-next{margin:{{space.4.px}} 0 {{space.1.px}}}.workspace-next-row{display:flex;align-items:center;justify-content:space-between;gap:{{space.2.px}};width:100%;margin:0;padding:{{space.3.px}} 0;border-bottom:1px solid {{divider}};background:transparent;text-align:left;line-height:1.5;color:{{text}};border-radius:0}.workspace-next-row::after{border:0}.workspace-next-row>view{flex:1;min-width:0}.workspace-next-row text{display:block}.workspace-next-row .ew-muted{margin-top:{{space.0.px}}}.workspace-assistant-menu{padding:{{space.3.px}};border-radius:{{radius.3.px}};background:{{card}};margin:{{space.3.px}} 0}.workspace-assistant-menu>text{display:block;margin:{{space.1.px}} 0}.workspace-assistant-menu ui-button{display:block;margin-top:{{space.3.px}}}.workspace-legacy{margin-top:{{space.5.px}}}.workspace-feedback{margin:{{space.1.px}} 0}.workspace-screen .ew-bottom{flex-shrink:0}.workspace-screen .ew-heading{font-size:{{font.page.em}}}.workspace-screen textarea{box-sizing:border-box}.mode-assistant .workspace-expression{margin-top:{{space.3.px}}}
@media(max-width:360px){.workspace-target{align-items:flex-start}.workspace-target-date{gap:{{space.0.px}}}.workspace-menu{padding:{{space.0.px}} {{space.2.px}}}.workspace-menu-footer .ew-muted{flex-basis:100%}}
.actual-plan{margin:{{space.3.px}} 0}.actual-choices{display:flex;flex-direction:column;gap:{{space.1.px}};margin:{{space.3.px}} 0}.actual-choice{margin:0;padding:{{space.2.px}};min-width:{{controls.touchSize.px}};min-height:{{controls.touchSize.px}};background:{{card}};color:{{text}};font-size:{{font.body.em}};text-align:left;border:1px solid {{controlBorder}};border-radius:{{radius.2.px}};line-height:1.5}.actual-choice.selected{border-color:{{brand}};background:{{brandSoft}};font-weight:600}.actual-choice::after{border:0}

/* Clear task hierarchy, compact controls and grouped secondary actions. */
.workspace-screen .workspace-header { margin-bottom:16px; }
.workspace-screen .workspace-header button.ew-link { flex:0 0 auto; width:auto; }
.workspace-screen .workspace-target { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:8px; padding:0; margin:0 0 8px; }
.workspace-screen .workspace-target-field { min-width:0; width:100%; margin:0; border:1px solid {{border}}; border-radius:12px; background:{{card}}; box-sizing:border-box; text-align:left; padding:0; }
.workspace-screen button.target-people { width:100%; min-width:0; font-weight:500; }
.target-control { padding:10px; min-height:64px; box-sizing:border-box; }
.target-label { display:block; font-size:{{font.caption.em}}; color:{{muted}}; line-height:1.4; margin-bottom:6px; }
.target-value { display:flex; align-items:center; justify-content:space-between; gap:4px; font-size:{{font.body.em}}; color:{{text}}; line-height:1.5; }
.target-value > text { min-width:0; white-space:nowrap; }
.workspace-screen .workspace-expression { margin:16px 0 12px; padding:16px; border:1px solid {{border}}; border-radius:18px; background:{{card}}; }
.workspace-screen .workspace-question { font-size:{{font.section.em}}; font-weight:600; margin-bottom:8px; }
.workspace-expression > .ew-muted { display:block; font-size:{{font.body.em}}; line-height:1.65; }
.workspace-screen .workspace-requirements { min-height:100px; height:100px; margin:12px 0; background:{{surfaceSoft}}; padding:12px; font-size:{{font.body.em}}; }
.workspace-screen .workspace-light-actions { gap:8px; margin:12px 0; }
.workspace-expression .workspace-light-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin-bottom:0; }
.workspace-screen .workspace-expression button.ew-link { padding:8px 4px; min-width:0; font-size:{{font.secondary.em}}; }
.workspace-screen .workspace-support-actions { padding-top:12px; border-top:1px solid {{divider}}; }
.workspace-screen .workspace-support-actions button.ew-link { flex:1; background:{{brandSoft}}; border-color:{{border}}; }
.workspace-screen .workspace-dish-actions { display:flex; gap:8px; }
.workspace-screen .workspace-next-row { border:1px solid {{border}}; background:{{card}}; padding:14px; border-radius:14px; margin-bottom:10px; width:100%; }
.workspace-screen .workspace-menu-footer button.ew-link { padding:8px 12px; }
.workspace-screen .ew-bottom { padding-top:12px; background:{{card}}; }
@media(max-width:360px) { .workspace-screen .workspace-target { grid-template-columns:repeat(2,minmax(0,1fr)); }.workspace-screen .target-date { grid-column:1 / -1; }.target-date .target-control { min-height:44px; display:flex; align-items:center; justify-content:space-between; gap:12px; }.target-date .target-label { margin:0; }.target-date .target-value { gap:12px; }.workspace-screen .workspace-expression { padding:12px; } }
.mode-today .ew-bottom { padding-bottom:12px; }

/* One meal target, independent people entry and progressively revealed options. */
.workspace-people { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:12px 0; }
.workspace-people > view > text { display:block; }
.workspace-people .ew-muted { margin-top:4px; }
.workspace-stepper { display:flex; align-items:center; gap:4px; flex:0 0 auto; }
.workspace-screen .workspace-stepper button.ew-link { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; margin:0; padding:0; font-size:{{font.section.em}}; background:{{card}}; border:1px solid {{border}}; border-radius:10px; }
.workspace-people-input { width:52px; min-height:{{controls.touchSize.px}}; box-sizing:border-box; padding:4px; font-size:{{font.reading.em}}; text-align:center; border:1px solid {{border}}; border-radius:10px; background:{{card}}; color:{{text}}; }
.workspace-exclusions { padding:12px 0; font-size:{{font.secondary.em}}; line-height:1.6; color:{{text}}; }
.workspace-exclusions > text { display:block; overflow-wrap:break-word; }
.workspace-exclusions .ew-muted { margin-top:4px; }
.workspace-requirements-entry { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; margin:8px 0 0; padding:16px; text-align:left; white-space:normal; line-height:1.6; background:{{card}}; color:{{text}}; border:1px solid {{border}}; border-radius:14px; }
.workspace-requirements-entry::after { border:0; }
.workspace-requirements-entry > view { min-width:0; flex:1; }
.workspace-requirements-entry text { display:block; overflow-wrap:break-word; }
.workspace-requirements-entry .ew-muted { margin-top:6px; }
.workspace-screen .workspace-optional-actions { justify-content:space-between; }
.workspace-advanced { margin:8px 0 16px; padding:12px; background:{{surfaceSoft}}; border-radius:12px; }
.workspace-advanced .workspace-light-actions { margin-bottom:0; }
.workspace-save-target { display:block; text-align:center; margin-bottom:8px; }
@media(max-width:360px) { .workspace-screen .workspace-target { grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); }.workspace-screen .target-date { grid-column:auto; }.target-date .target-control { display:block; min-height:64px; }.target-date .target-label { margin-bottom:6px; }.target-date .target-value { gap:4px; }.workspace-requirements-entry { padding:12px; } }

/* Persistent composition summary; sheet rows stay usable with large text. */
.workspace-screen .workspace-target { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
.workspace-screen .target-control { min-height:{{controls.touchSize.px}}; padding:{{space.1.px}} {{space.2.px}}; }
.workspace-screen .target-label { font-size:{{font.body.em}}; margin-bottom:{{space.0.px}}; }
.workspace-screen .target-value > text { white-space:normal; overflow-wrap:anywhere; }
.workspace-screen .workspace-stepper { flex-wrap:wrap; min-width:0; }
.workspace-screen .workspace-people-input { width:3em; min-width:52px; }
.workspace-composition-row { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:{{space.1.px}}; min-height:52px; padding:{{space.1.px}} 0; border-bottom:1px solid {{divider}}; }
.workspace-composition-row > text { min-width:0; flex:1; overflow-wrap:anywhere; }
.workspace-composition-presets { display:flex; flex-wrap:wrap; gap:{{space.1.px}}; margin:{{space.2.px}} 0; }
.workspace-screen .workspace-composition-presets button.ew-link { width:auto; min-height:{{controls.primaryHeight.px}}; margin:0; padding:{{space.1.px}} {{space.2.px}}; white-space:normal; background:{{brandSoft}}; border-radius:{{radius.2.px}}; }
.workspace-shortage { padding:{{space.2.px}} 0; }
.workspace-shortage > text { display:block; overflow-wrap:anywhere; }
.workspace-screen .workspace-optional-actions button.ew-link { white-space:normal; overflow-wrap:anywhere; text-align:left; }
@media(max-width:360px) { .workspace-screen .target-date .target-control { min-height:{{controls.touchSize.px}}; }.workspace-screen .target-date .target-label { margin-bottom:{{space.0.px}}; } }

/* Calendar preview: native pickers keep full dates and scalable hit targets. */
.workspace-save-fields { display:flex; flex-direction:column; gap:{{space.1.px}}; margin:{{space.3.px}} 0; }
.workspace-save-field { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; min-height:{{controls.primaryHeight.px}}; gap:{{space.2.px}}; background:{{background}}; padding:{{space.1.px}} {{space.3.px}}; border-radius:{{radius.2.px}}; box-sizing:border-box; }
.workspace-save-field text { overflow-wrap:anywhere; }
.workspace-saved-result { display:flex; flex-direction:column; align-items:flex-start; gap:{{space.1.px}}; padding:{{space.2.px}} 0; }
