@import "../../styles/component-theme.wxss";
.assistant-card{background:{{card}};border:1px solid {{border}};border-radius:{{radius.2.px}};padding:{{space.3.px}};min-width:0;box-sizing:border-box;font-size:inherit;color:{{text}};line-height:1.5}
.card-title{display:block;font-size:1em;font-weight:600}.card-meta{display:block;font-size:{{font.secondary.em}};color:{{muted}};margin-top:{{space.0.px}}}.card-text{display:block;font-size:1em;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:{{space.2.px}}}.card-row{margin-top:{{space.2.px}};min-width:0}.card-dish{display:flex;align-items:center;gap:{{space.2.px}};width:100%;min-width:0;padding:{{space.1.px}} 0;background:transparent;border:0;margin:0;text-align:left;font-size:inherit;color:{{text}};line-height:1.5}.card-dish::after{border:0}.card-dish-disabled{color:{{text}};background:transparent}.card-picture{flex:none;width:64px;height:64px;border-radius:{{radius.1.px}};overflow:hidden}.card-fallback{display:flex;align-items:center;justify-content:center;background:{{surfaceSoft}}}.card-name{flex:1;min-width:0;overflow-wrap:anywhere}.card-name-text{display:block}.card-step{font-size:{{font.secondary.em}}}.card-action{display:block;margin-top:{{space.2.px}}}

.card-check-row{display:flex;align-items:center;gap:12px;min-height:44px;padding:8px 0;font-size:inherit;line-height:1.5;min-width:0}

/* Recommendations use F; committing cards keep a distinct solid action area. */
.assistant-card { background:{{glassSurface}}; border:1px solid {{glassBorder}}; border-radius:16px; box-shadow:0 5px 16px rgba(30,71,56,0.03); }
.card-dish { padding:10px; background:{{glassSurface}}; border:1px solid {{glassBorder}}; border-radius:16px; box-sizing:border-box; }
.card-picture { width:56px; height:56px; border-radius:14px; }
.card-confirmation { background:{{glassChrome}}; border-color:{{controlBorder}}; }
.card-confirmation .card-title { color:{{brand}}; }.card-action { margin-top:16px; }
.assistant-card .card-dish { width:100%; margin:0; font-weight:400; }

.card-choices { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
.card-choices > picker { min-width:44px; }
.card-choice { display:flex; align-items:center; justify-content:center; min-width:44px; min-height:44px; margin:0; padding:8px 12px; border:1px solid {{controlBorder}}; border-radius:14px; background:{{card}}; color:{{brand}}; font-size:1em; line-height:1.5; white-space:normal; overflow-wrap:anywhere; box-sizing:border-box; }
.card-choice::after { border:0; }
