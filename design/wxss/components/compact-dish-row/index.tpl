.dish-row { display:flex; align-items:center; gap:8px; min-height:80px; min-width:0; padding:8px; margin:8px 0; box-sizing:border-box; background:{{glassSurface}}; border:1px solid {{glassBorder}}; border-radius:16px; box-shadow:0 5px 16px rgba(30,71,56,0.03); transition:background-color {{motion.press.ms}} ease-out; font-size:inherit; }
.dish-row .dish-main { display:flex; flex:1; align-items:center; gap:8px; width:auto; min-width:0; min-height:44px; padding:0; margin:0; border:0; background:transparent; color:{{text}}; font-family:inherit; font-size:inherit; font-weight:400; line-height:1.5; text-align:left; box-sizing:border-box; }
.dish-thumbnail, .dish-image { width:56px; height:56px; border-radius:{{radius.2.px}}; }
.dish-thumbnail { flex:0 0 56px; overflow:hidden; background:{{surfaceSoft}}; animation:dish-appear {{motion.row.ms}} ease-out; }
.dish-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:{{brandSoft}}; }
.dish-copy { flex:1; min-width:0; }
.dish-name { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:{{font.card.em}}; font-weight:500; line-height:1.25; }
/* Image, the two-line copy block and action group share the card centerline. */
.dish-summary { display:flex; align-items:center; gap:4px; min-width:0; margin-top:4px; box-sizing:border-box; }
.dish-meta { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:{{font.secondary.em}}; color:{{muted}}; line-height:1.5; }
.dish-meta-narrow { display:none; }
.dish-feedback { display:block; color:{{brand}}; font-size:{{font.secondary.em}}; line-height:1.5; overflow-wrap:anywhere; }
.dish-selected { flex:0 0 auto; color:{{brand}}; font-size:{{font.secondary.em}}; line-height:1.5; }
.dish-actions { display:flex; flex:0 0 100px; align-items:stretch; justify-content:flex-end; gap:4px; width:100px; height:44px; }
.dish-row .dish-replace { display:flex; align-items:center; justify-content:center; flex:1; min-width:44px; height:44px; min-height:44px; margin:0; padding:0 4px; border:1px solid transparent; border-radius:{{radius.1.px}}; background:{{brandSoft}}; color:{{brand}}; font-family:inherit; font-size:{{font.secondary.em}}; font-weight:400; line-height:1.5; white-space:nowrap; box-sizing:border-box; }
.dish-row .dish-replace.is-disabled { color:{{muted}}; background:transparent; }
.dish-main::after, .dish-replace::after { border:0; }
.dish-main, .dish-replace { transition:background-color {{motion.press.ms}} ease-out; }
.dish-row .dish-main:active, .dish-row .dish-replace:active { background:{{brandSoft}}; }
.dish-row .favorite-control { display:flex; align-items:stretch; width:44px; min-height:44px; flex:0 0 44px; }
.dish-row.is-reading .dish-actions { width:44px; flex-basis:44px; }
.dish-row.is-prominent .dish-thumbnail, .dish-row.is-prominent .dish-image { width:64px; height:64px; border-radius:16px; }
.dish-row.is-prominent .dish-thumbnail { flex-basis:64px; }
.dish-row.is-prominent.is-large-text .dish-thumbnail, .dish-row.is-prominent.is-large-text .dish-image { width:56px; height:56px; }
.dish-row.is-prominent.is-large-text .dish-thumbnail { flex-basis:56px; }
.dish-row.is-large-text .dish-actions { width:134px; flex-basis:134px; }
.dish-row.is-reading.is-large-text .dish-actions { width:44px; flex-basis:44px; }
.dish-row.is-compact-summary .dish-thumbnail, .dish-row.is-compact-summary .dish-image { width:40px; height:40px; border-radius:10px; }
.dish-row.is-compact-summary .dish-thumbnail { flex-basis:40px; }
.dish-row.is-compact-summary.is-large-text .dish-actions { width:92px; flex-basis:92px; }
.dish-row.is-compact-summary.is-large-text .dish-thumbnail, .dish-row.is-compact-summary.is-large-text .dish-image { width:32px; height:32px; }
.dish-row.is-compact-summary.is-large-text .dish-thumbnail { flex-basis:32px; }
.dish-row.is-compact-summary.is-reading.is-large-text .dish-actions { width:44px; flex-basis:44px; }
@media(max-width:360px) { .dish-meta-full { display:none; } .dish-meta-narrow { display:inline; } }
@keyframes dish-appear { from { opacity:0; } to { opacity:1; } }
.dish-row.is-selection-preview { min-height:72px; padding:10px; margin:8px 0; box-shadow:none; border-color:{{border}}; }
.dish-row.is-selection-preview .dish-thumbnail, .dish-row.is-selection-preview .dish-image { width:48px; height:48px; border-radius:12px; }
.dish-row.is-selection-preview .dish-thumbnail { flex-basis:48px; }
.dish-row.is-selection-preview .dish-main { gap:12px; }
.dish-row.is-selection-preview .dish-name { font-size:1em; font-weight:400; white-space:normal; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-height:1.45; overflow-wrap:anywhere; }
.dish-row.is-selection-preview .dish-actions { width:44px; flex-basis:44px; }
.dish-remove { display:flex; align-items:center; justify-content:center; width:44px; height:44px; margin:0; padding:0; border:0; background:transparent; }
.dish-remove::after { border:0; }
.dish-remove-symbol { display:flex; align-items:center; justify-content:center; width:24px; height:24px; border:1px solid {{danger}}; border-radius:50%; color:{{danger}}; }
.dish-remove-symbol::before { content:""; display:block; width:10px; height:2px; border-radius:1px; background:currentColor; }
.dish-remove.is-disabled { opacity:.4; }
