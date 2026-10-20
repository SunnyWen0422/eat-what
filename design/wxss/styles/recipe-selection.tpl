/* Shared current-meal projection, never a second menu editor. */
.recipe-selected-context { display:flex; align-items:center; justify-content:space-between; gap:8px; color:{{text}}; font-size:1em; line-height:1.5; }
.recipe-selected-count { flex-shrink:0; color:{{brand}}; font-size:.875em; }
.recipe-selected-status { margin:4px 0 16px; color:{{muted}}; font-size:.8125em; line-height:1.5; }
.recipe-selected-preview { display:block; }
.recipe-selected-actions { display:flex; align-items:stretch; gap:12px; padding-top:8px; }
.recipe-selected-actions button { display:flex; align-items:center; justify-content:center; gap:6px; flex:1; min-width:0; min-height:48px; margin:0; padding:8px; border:1px solid {{border}}; border-radius:16px; font-family:inherit; font-size:1em; font-weight:400; line-height:1.4; box-sizing:border-box; }
.recipe-selected-actions button::after { border:0; }
.recipe-selected-actions .recipe-selected-continue { background:{{background}}; color:{{brand}}; }
.recipe-selected-actions .recipe-selected-view { background:{{brand}}; border-color:{{brand}}; color:#fff; }
.recipe-selected-view ui-icon { filter:brightness(0) invert(1); }
.recipe-selected-actions .recipe-selected-view.is-disabled { background:{{controlSoft}}; border-color:{{border}}; color:{{muted}}; }
.favorite-selected-summary { margin-top:{{space.4.px}}; padding-bottom:env(safe-area-inset-bottom); }
.favorite-selected-summary > text { display:block; margin-bottom:{{space.2.px}}; }
