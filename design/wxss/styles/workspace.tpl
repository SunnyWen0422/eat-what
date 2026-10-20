/* One continuous meal surface; original commands and recovery stay in the controller. */
.workspace-screen { padding:0; background:{{background}}; }
.workspace-screen .mobile-scroll-content { padding:8px 16px 24px; }
.workspace-header { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:44px; }
.workspace-date { display:flex; align-items:center; gap:6px; color:{{muted}}; font-size:{{font.secondary.em}}; font-weight:500; }
.workspace-shopping,.workspace-more { display:flex; align-items:center; justify-content:center; gap:6px; flex:0 0 auto; min-width:44px; min-height:44px; padding:0 4px; margin:0; background:transparent; color:{{brand}}; border:0; border-radius:10px; line-height:1.5; font-size:{{font.secondary.em}}; }
.workspace-shopping::after,.workspace-more::after,.workspace-meal::after { border:0; }
.workspace-title-row { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; }
.workspace-title-row .ew-heading { flex:1; min-width:0; font-size:{{font.page.em}}; line-height:1.4; margin:0; }
.workspace-title-actions { display:flex; align-items:center; gap:4px; flex:0 0 auto; }
.workspace-screen button.workspace-assistant { display:flex; align-items:center; justify-content:center; min-height:48px; margin:0; padding:0; font-size:{{font.secondary.em}}; font-weight:500; line-height:1.5; color:{{brand}}; background:transparent; border:0; border-radius:14px; }
.workspace-assistant::after { border:0; }
.workspace-assistant-face { display:flex; align-items:center; justify-content:center; gap:5px; min-height:36px; padding:6px 10px; box-sizing:border-box; border:1px solid transparent; border-radius:14px; background:linear-gradient(115deg,#EDF7F0 0%,#F4F0FC 55%,#FFF4E9 100%) padding-box,linear-gradient(110deg,#61BCA4 0%,#9C8CDA 56%,#DCAE7C 100%) border-box; box-shadow:0 2px 8px rgba(40,99,78,.07); }
.workspace-assistant-face text { display:block; }
.workspace-assistant-label { color:{{brand}}; }
@supports (-webkit-background-clip:text) {
  .workspace-assistant-label { background-image:linear-gradient(105deg,#256C59 0%,#48629A 38%,#82549C 66%,#8D5837 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
}
.workspace-assistant-pressed .workspace-assistant-face { opacity:.76; }
.workspace-screen button.workspace-assistant[disabled] { color:{{muted}}; }
.workspace-assistant[disabled] .workspace-assistant-face { background:{{brandSoft}}; border-color:{{border}}; box-shadow:none; opacity:.65; }
.workspace-assistant[disabled] .workspace-assistant-label { background-image:none; color:{{muted}}; -webkit-text-fill-color:{{muted}}; }
.workspace-menu-picker { display:block; width:100%; }
.workspace-meals { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:4px 0; }
.workspace-meals .workspace-meal { flex:0 0 auto; width:auto; min-width:60px; min-height:44px; padding:8px 14px; margin:0; border:0; border-radius:24px; background:{{brandSoft}}; color:{{brand}}; font-size:{{font.secondary.em}}; font-weight:400; line-height:1.5; box-sizing:border-box; }
.workspace-meal.is-active { background:{{brand}}; color:{{card}}; font-weight:500; }
.workspace-other-day { display:flex; align-items:center; justify-content:space-between; gap:8px; color:{{muted}}; font-size:{{font.secondary.em}}; }
.requirements-label { flex:0 0 auto; font-size:{{font.secondary.em}}; font-weight:500; }
.requirements-summary { flex:1; min-width:0; color:{{muted}}; font-size:{{font.secondary.em}}; overflow-wrap:anywhere; }
.workspace-light-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.workspace-screen .workspace-optional-actions { justify-content:space-between; margin:0; border-bottom:1px solid {{divider}}; }
.workspace-screen .workspace-focus-actions button.ew-link, .workspace-screen .workspace-optional-actions button.ew-link { display:flex; align-items:center; gap:6px; max-width:100%; margin:0; padding:8px 0; min-height:44px; font-size:{{font.secondary.em}}; white-space:normal; text-align:left; background:transparent; border:0; }
.workspace-optional-actions .ew-link text { min-width:0; overflow-wrap:anywhere; }
.workspace-exclusions { color:{{muted}}; font-size:{{font.secondary.em}}; line-height:1.5; padding:4px 0; overflow-wrap:anywhere; }
.workspace-empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:40px 16px; }
.workspace-empty-title { display:block; margin-top:8px; font-size:{{font.body.em}}; font-weight:500; }
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
.workspace-screen .ew-bottom { flex-shrink:0; background:{{background}}; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); }
.mode-today .ew-bottom { padding-bottom:12px; }
.workspace-people { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 0; }
.workspace-stepper { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-width:0; }
.workspace-screen .workspace-stepper button.ew-link { min-width:44px; min-height:44px; margin:0; padding:0; font-size:{{font.section.em}}; background:{{brandSoft}}; border:1px solid transparent; border-radius:10px; }
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

@media(max-width:360px) { .workspace-empty { padding:24px 12px; }.workspace-meals { gap:4px; }.workspace-meal { padding:8px 12px; } }

.workspace-focus-actions { justify-content:space-between; }
.workspace-screen .workspace-focus-actions button { margin:0; padding:4px 0; background:transparent; font-size:.8125em; }
.workspace-meals { flex-wrap:nowrap; overflow-x:auto; }
.workspace-settings-panel { margin-bottom:8px; }

.workspace-screen.is-large-text .workspace-title-row { align-items:flex-start; }
.workspace-screen.is-large-text .workspace-title-actions { max-width:55%; }
.workspace-screen.is-large-text button.workspace-assistant { min-width:0; flex:1; white-space:normal; }

.workspace-notice { display:flex; flex-wrap:wrap; align-items:center; gap:{{space.1.px}}; padding:{{space.1.px}} {{space.2.px}}; margin:{{space.1.px}} 0; border:1px solid {{border}}; border-radius:{{radius.1.px}}; background:{{warningSoft}}; color:{{warning}}; font-size:{{font.secondary.em}}; line-height:1.6; }
.workspace-notice > text { flex:1 1 180px; min-width:0; overflow-wrap:anywhere; }
.workspace-notice.error { background:{{dangerSoft}}; color:{{danger}}; }
.workspace-notice.success,.workspace-notice.info { background:{{brandSoft}}; color:{{brand}}; }
.workspace-notice.loading { background:{{card}}; color:{{muted}}; }
.workspace-screen .workspace-notice .ew-link { flex:0 1 auto; padding:0 4px; margin:0; border:0; background:transparent; font-size:{{font.secondary.em}}; white-space:normal; text-align:left; }

.workspace-menu-heading > button { margin-left:auto; }

/* One steady row for choosing the meal, personalization and time/ingredients. */
.workspace-meal-tools { display:flex; flex-wrap:nowrap; align-items:center; justify-content:space-between; gap:8px; margin:0 0 8px; border-bottom:1px solid {{divider}}; }
.workspace-screen button.workspace-tool { display:flex; align-items:center; justify-content:center; gap:6px; flex:0 1 auto; min-width:44px; min-height:44px; margin:0; padding:8px 0; font-size:{{font.secondary.em}}; line-height:1.5; white-space:nowrap; border:0; background:transparent; color:{{brand}}; }
.workspace-screen button.workspace-time-button,.workspace-screen button.workspace-return-today { display:flex; align-items:center; justify-content:center; flex:0 0 44px; width:44px; min-height:44px; padding:0; margin:0; border:0; border-radius:0; background:transparent; box-shadow:none; }
.workspace-tool::after,.workspace-time-button::after,.workspace-return-today::after { border:0; }
.workspace-filter-dot { width:5px; height:5px; flex:0 0 5px; border-radius:50%; background:{{brand}}; }
.workspace-alarm { display:flex; align-items:center; justify-content:center; position:relative; width:24px; height:24px; }
.workspace-alarm::before,.workspace-alarm::after { content:""; position:absolute; top:0; width:7px; height:2px; background:{{brand}}; border-radius:2px; }
.workspace-alarm::before { left:0; transform:rotate(-40deg); }
.workspace-alarm::after { right:0; transform:rotate(40deg); }
