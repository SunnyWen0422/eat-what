@import "../../styles/theme.wxss";
.chip{min-height:{{controls.touchSize.px}};padding:{{space.1.px}} {{space.3.px}};border-radius:{{radius.4.px}};background:{{brandSoft}};color:{{brand}};font-size:{{font.body.em}};line-height:1.5;margin:0}.chip.active{background:{{brand}};color:{{card}}}

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
button.chip.ew-hit-target { min-height:{{controls.touchSize.px}}; }
