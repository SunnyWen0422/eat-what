.dish-row { display:flex; flex-wrap:wrap; align-items:center; gap:{{space.1.px}}; min-height:80px; min-width:0; padding:10px; margin:8px 0; box-sizing:border-box; background:{{glassSurface}}; border:1px solid {{glassBorder}}; border-radius:16px; box-shadow:0 5px 16px rgba(30,71,56,0.03); transition:background-color {{motion.press.ms}} ease-out; font-size:inherit; }
.dish-row .dish-main { flex:1 1 160px; width:auto; display:flex; align-items:center; gap:{{space.2.px}}; min-width:0; min-height:44px; padding:0; margin:0; border:0; background:transparent; color:{{text}}; font-family:inherit; font-size:inherit; font-weight:400; line-height:1.5; text-align:left; box-sizing:border-box; }
.dish-thumbnail, .dish-image { width:56px; height:56px; border-radius:{{radius.2.px}}; }
.dish-thumbnail { flex:0 0 56px; overflow:hidden; background:{{surfaceSoft}}; animation:dish-appear {{motion.row.ms}} ease-out; }
.dish-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:{{brandSoft}}; }
.dish-copy { flex:1; min-width:0; }
.dish-name, .dish-meta, .dish-feedback { display:block; overflow-wrap:anywhere; }
.dish-name { font-size:{{font.card.em}}; font-weight:600; line-height:1.5; }
.dish-meta { font-size:{{font.secondary.em}}; color:{{muted}}; line-height:1.5; margin-top:2px; }
.dish-feedback { color:{{brand}}; font-size:{{font.secondary.em}}; line-height:1.5; }
.dish-selected { color:{{brand}}; font-size:{{font.secondary.em}}; line-height:1.5; margin-left:auto; }
.dish-row .dish-replace { flex:0 1 auto; width:auto; min-width:44px; min-height:44px; margin:0 0 0 auto; padding:{{space.1.px}}; border:1px solid {{controlBorder}}; border-radius:{{radius.1.px}}; background:{{glassChrome}}; color:{{brand}}; font-family:inherit; font-size:{{font.secondary.em}}; font-weight:400; line-height:1.5; overflow-wrap:anywhere; box-sizing:border-box; }
.dish-replace.is-disabled { color:{{muted}}; background:transparent; }
.dish-main::after, .dish-replace::after { border:0; }
.dish-main, .dish-replace, .dish-more { transition:background-color {{motion.press.ms}} ease-out; }
.dish-row .dish-main:active, .dish-row .dish-replace:active, .dish-row .dish-more:active { background:{{brandSoft}}; }
.dish-row .dish-replace.is-disabled, .dish-row .dish-more.is-disabled { color:{{muted}}; background:transparent; }
@keyframes dish-appear { from { opacity:0; } to { opacity:1; } }

.dish-row .dish-more { flex:0 0 44px; width:44px; min-height:44px; margin:0; padding:8px; background:transparent; display:flex; align-items:center; justify-content:center; }
.dish-more::after { border:0; }

.dish-row.is-large-text .dish-main { flex-basis:100%; }

/* Current-meal presentation emphasizes food; browsing lists retain 56px images. */
.dish-row.is-prominent .dish-thumbnail, .dish-row.is-prominent .dish-image { width:72px; height:72px; border-radius:16px; }
.dish-row.is-prominent .dish-thumbnail { flex-basis:72px; }
@media(max-width:360px) { .dish-row.is-prominent .dish-main { flex-basis:100%; } }
