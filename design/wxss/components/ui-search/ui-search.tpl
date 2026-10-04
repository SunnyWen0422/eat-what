@import "../../styles/theme.wxss";
.search{display:flex;gap:{{space.1.px}};align-items:center;background:{{brandSoft}};border-radius:{{radius.2.px}};padding:{{space.0.px}} {{space.2.px}}}.search input{flex:1;min-width:0;min-height:{{controls.touchSize.px}};font-size:{{font.body.em}}}

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
