@import "../../styles/theme.wxss";
@import "../../styles/workspace.wxss";
.cooking-page{background:{{background}}}
.ew-heading{margin-bottom:{{space.1.px}}}
.cooking-page .ew-tabs{overflow-x:auto;flex-wrap:nowrap;margin:0}
.ew-tabs button{flex:0 0 auto;max-width:240px;white-space:normal}
.dish-switch-scroll{width:100%;min-width:0;margin:{{space.4.px}} 0}
.cooking-step-heading text{display:block;margin-bottom:{{space.2.px}};overflow-wrap:anywhere}
.cooking-step{font-size:{{font.card.em}};line-height:1.65;margin:{{space.4.px}} 0;min-height:180px;white-space:pre-wrap;overflow-wrap:anywhere;color:{{text}}}
.cooking-ingredients text{display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:{{space.2.px}}}
.cooking-bottom{position:fixed;bottom:0;left:0;right:0;z-index:20;display:flex;flex-wrap:wrap;gap:{{space.3.px}};padding:{{space.4.px}};padding-bottom:calc({{space.4.px}} + env(safe-area-inset-bottom));background:{{background}};border-top:1px solid {{border}}}
.cooking-bottom > ui-button{flex:1 1 120px;min-width:0}
