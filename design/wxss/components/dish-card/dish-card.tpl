@import "../../styles/component-theme.wxss";
.card{display:flex;align-items:center;gap:{{space.2.px}};box-sizing:border-box;padding:{{space.2.px}};background:{{card}};border:1px solid transparent;border-radius:{{radius.3.px}};color:{{text}};min-width:{{controls.touchSize.px}};min-height:{{controls.touchSize.px}}}.image{width:112px;height:84px;border-radius:{{radius.1.px}};flex-shrink:0;background:{{surfaceSoft}}}.copy{flex:1;min-width:0}.name{display:block;font-size:{{font.reading.em}};font-weight:500;line-height:1.5}.description{display:block;color:{{muted}};font-size:{{font.secondary.em}};line-height:1.5;margin-top:{{space.1.px}}}.no-image{padding:{{space.3.px}} {{space.2.px}}}.select .image{width:72px;height:72px}.is-selected{border-color:{{brand}}}.choose{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:{{controls.touchSize.px}};min-height:{{controls.touchSize.px}};margin:0;padding:0;border:1px solid transparent;border-radius:{{radius.1.px}};background:{{brandSoft}};flex-shrink:0}.choose::after{border:0}.choose.checked{background:{{brandSoft}};border-color:{{brand}}}.choose.is-disabled{background:{{disabled}}}.choose-icon{display:flex}
@media(max-width:360px){.image{width:88px;height:66px}.select .image{width:58px;height:58px}}

.card { padding:10px; margin:8px 0; border:1px solid {{glassBorder}}; border-radius:16px; background:{{glassSurface}}; box-shadow:0 5px 16px rgba(30,71,56,0.03); }
.image, .select .image { width:64px; height:64px; border-radius:14px; overflow:hidden; }
.image-placeholder { display:flex; align-items:center; justify-content:center; background:{{brandSoft}}; }
.name { font-weight:500; overflow-wrap:anywhere; }.description { margin-top:4px; }.is-selected { border-color:{{brand}}; }

.card { flex-wrap:wrap; }
.card .copy { flex:1 1 96px; }
.dish-actions { display:flex; align-items:stretch; flex:0 0 auto; gap:{{space.1.px}}; margin-left:auto; }
.card .favorite-control { display:flex; align-items:stretch; width:44px; min-height:44px; flex:0 0 44px; }
