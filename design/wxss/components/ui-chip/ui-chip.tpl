@import "../../styles/component-theme.wxss";
.chip{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:{{controls.touchSize.px}};min-height:{{controls.touchSize.px}};padding:{{space.1.px}} {{space.2.px}};border:1px solid {{border}};border-radius:{{radius.1.px}};background:transparent;color:{{brand}};font-size:{{font.secondary.em}};line-height:1.5}.chip::after{border:0}.active{background:{{brandSoft}};border-color:{{brand}};font-weight:600}.chip.is-disabled{color:{{text}};background:{{disabled}}}

:host { display:inline-block; }
.chip { width:auto; max-width:100%; margin:0; background:{{card}}; border-color:{{controlBorder}}; font-size:{{font.body.em}}; }
.chip.active { background:{{brandSoft}}; border-color:{{brand}}; }
