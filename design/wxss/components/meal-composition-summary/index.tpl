.composition-summary { min-width:0; font-size:inherit; }
.composition-summary .summary-row { width:100%; max-width:100%; display:flex; flex-wrap:wrap; align-items:center; gap:{{space.1.px}}; min-width:0; min-height:44px; padding:{{space.1.px}} 0; margin:0; border:0; border-bottom:1px solid {{divider}}; border-radius:0; background:transparent; color:{{text}}; font-family:inherit; font-size:inherit; font-weight:400; line-height:1.5; text-align:left; box-sizing:border-box; }
.summary-label { flex:1; min-width:0; color:{{muted}}; overflow-wrap:anywhere; }
.summary-value { min-width:0; max-width:70%; font-weight:600; overflow-wrap:anywhere; }
.composition-value { color:{{brand}}; }
.summary-row.is-disabled { background:transparent; color:{{muted}}; }
.summary-row::after { border:0; }

.composition-summary { display:flex; align-items:stretch; gap:12px; }
.composition-summary .summary-row { flex:1; width:0; gap:4px; padding:8px 0; }
.summary-label { flex:1 1 auto; font-size:.8125em; }
.summary-value { max-width:100%; font-size:.8125em; }
.composition-summary.is-large-text { flex-direction:column; gap:0; }
.composition-summary.is-large-text .summary-row { flex:0 0 auto; width:100%; flex-wrap:nowrap; gap:8px; }
.composition-summary.is-large-text .summary-value { flex:1; max-width:none; text-align:right; }
@media(max-width:360px) {
 .composition-summary { flex-direction:column; gap:0; }
 .composition-summary .summary-row { flex:0 0 auto; width:100%; flex-wrap:nowrap; gap:8px; }
 .composition-summary .summary-value { flex:1; max-width:none; text-align:right; }
}
