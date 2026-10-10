/* Shared current-meal projection, never a second menu editor. */
.recipe-selected-row { display:flex; align-items:center; gap:{{space.2.px}}; min-height:72px; border-bottom:1px solid {{border}}; }
.recipe-selected-row button { font-size:1em; line-height:1.5; white-space:normal; margin:0; }
.recipe-selected-name { flex:1; min-width:0; text-align:left; overflow-wrap:break-word; }
.recipe-selected-row > button:last-child { flex:0 0 auto; }
.favorite-selected-summary { margin-top:{{space.4.px}}; padding-bottom:env(safe-area-inset-bottom); }
.favorite-selected-summary > text { display:block; margin-bottom:{{space.2.px}}; }
