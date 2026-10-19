@import "../../styles/component-theme.wxss";
.button{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;min-width:{{controls.touchSize.px}};min-height:{{controls.primaryHeight.px}};margin:0;padding:{{space.2.px}} {{space.3.px}};border:0;border-radius:{{radius.2.px}};background:{{brand}};color:{{card}};font-size:{{font.reading.em}};font-weight:600;line-height:1.5;flex-shrink:0}
.button::after{border:0}.button:active{background:{{brandPressed}}}.button.secondary{min-height:{{controls.secondaryHeight.px}};background:{{brandSoft}};color:{{brand}};border:1px solid transparent;font-size:{{font.body.em}};font-weight:500}.button.tertiary{min-height:{{controls.secondaryHeight.px}};background:{{brandSoft}};color:{{brand}};padding:{{space.1.px}};font-size:{{font.secondary.em}};font-weight:500}.button.danger{background:{{dangerSoft}};color:{{danger}}}.button.is-disabled{background:{{disabled}};color:{{text}}}.button.tertiary.is-disabled{background:transparent;color:{{muted}}}

:host { display:flex; align-items:stretch; min-width:0; }
.button.primary,.button.secondary,.button.tertiary,.button.danger { width:100%; max-width:100%; margin:0; box-sizing:border-box; }
.button.secondary { border-color:transparent; background:{{brandSoft}}; }
.button.tertiary { background:{{brandSoft}}; border:1px solid transparent; color:{{brand}}; padding:10px 12px; font-size:{{font.body.em}}; }
.button.is-disabled { background:{{disabled}}; color:{{muted}}; border-color:{{border}}; }

.button { transition:background-color {{motion.press.ms}} ease-out,border-color {{motion.press.ms}} ease-out; white-space:normal; overflow-wrap:anywhere; }

.button.secondary:active,.button.tertiary:active { background:{{divider}}; }
.button.is-disabled:active { background:{{disabled}}; }
