@import "../../styles/component-theme.wxss";
.ew-sheet { display:flex; flex-direction:column; min-width:44px; overflow:hidden; border-radius:{{radius.4.px}} {{radius.4.px}} 0 0; padding:0; background:{{background}}; animation:sheet-in 200ms ease-out; }
.sheet-scroll { flex:0 1 auto; min-height:0; min-width:0; width:100%; box-sizing:border-box; }
.sheet-layout { display:flex; flex-direction:column; min-width:0; overflow:hidden; box-sizing:border-box; padding:{{space.2.px}} {{space.3.px}} calc({{space.3.px}} + env(safe-area-inset-bottom)); }
.sheet-layout.overflow-chrome { display:block; overflow:visible; }
.overflow-chrome .sheet-body { height:auto; }
.sheet-handle { width:48px; height:4px; border-radius:2px; margin:0 auto {{space.1.px}}; background:{{border}}; flex-shrink:0; }
.sheet-header { min-width:0; flex-shrink:0; gap:{{space.1.px}}; }
.sheet-header .ew-title { flex:1; min-width:0; overflow-wrap:anywhere; font-size:{{font.section.em}}; }
.sheet-body { flex:0 1 auto; min-height:0; min-width:0; padding:{{space.2.px}} 0 {{space.3.px}}; box-sizing:border-box; }
.sheet-footer { flex-shrink:0; min-width:0; }
@keyframes sheet-in { from { transform:translateY(12px); } to { transform:translateY(0); } }
