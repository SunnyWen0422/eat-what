@import "../../styles/component-theme.wxss";
.description { display:block; font-size:{{font.secondary.em}}; line-height:1.6; color:{{muted}}; margin:0 0 {{space.2.px}}; overflow-wrap:anywhere; }
.content { min-width:0; }
.actions { display:flex; flex-wrap:wrap; gap:{{space.1.px}}; min-width:0; }
.confirm-action { flex:1 1 120px; min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; height:auto; margin:0; padding:{{space.2.px}}; border:1px solid {{controlBorder}}; border-radius:{{radius.2.px}}; font-size:{{font.body.em}}; line-height:1.5; font-family:inherit; font-weight:500; white-space:normal; overflow-wrap:anywhere; box-sizing:border-box; }
.confirm-action::after { border:0; }
.cancel { background:{{card}}; color:{{brand}}; }
.confirm { background:{{brand}}; color:{{card}}; border-color:{{brand}}; }
.is-disabled { background:{{disabled}}; color:{{muted}}; border-color:{{border}}; }
