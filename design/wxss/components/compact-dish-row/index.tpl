.dish-row { display:flex; flex-wrap:wrap; align-items:center; gap:{{space.1.px}}; min-height:80px; min-width:0; padding:{{space.1.px}} 0; box-sizing:border-box; border-bottom:1px solid {{divider}}; transition:background-color 100ms ease-out; font-size:inherit; }
.dish-main { flex:1 1 160px; display:flex; align-items:center; gap:{{space.2.px}}; min-width:0; min-height:44px; padding:0; margin:0; border:0; background:transparent; color:{{text}}; font-family:inherit; font-size:inherit; line-height:1.5; text-align:left; }
.dish-thumbnail, .dish-thumbnail image { width:64px; height:64px; border-radius:{{radius.2.px}}; }
.dish-thumbnail { flex:0 0 64px; overflow:hidden; background:{{surfaceSoft}}; animation:dish-appear 180ms ease-out; }
.dish-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:{{brandSoft}}; }
.dish-copy { flex:1; min-width:0; }
.dish-name, .dish-meta, .dish-feedback { display:block; overflow-wrap:anywhere; }
.dish-name { font-size:{{font.card.em}}; font-weight:600; line-height:1.5; }
.dish-meta { font-size:{{font.secondary.em}}; color:{{muted}}; line-height:1.5; margin-top:2px; }
.dish-feedback { color:{{brand}}; font-size:{{font.secondary.em}}; line-height:1.5; }
.dish-replace { flex:0 1 auto; min-width:44px; min-height:44px; margin:0 0 0 auto; padding:{{space.1.px}} {{space.0.px}}; border:0; border-radius:{{radius.1.px}}; background:transparent; color:{{brand}}; font-family:inherit; font-size:{{font.secondary.em}}; line-height:1.5; overflow-wrap:anywhere; }
.dish-replace[disabled] { color:{{muted}}; background:transparent; }
.dish-main::after, .dish-replace::after { border:0; }
.dish-row:active { background:{{brandSoft}}; }
@keyframes dish-appear { from { opacity:0; } to { opacity:1; } }
