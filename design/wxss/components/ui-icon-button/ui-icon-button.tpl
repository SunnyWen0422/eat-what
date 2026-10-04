@import "../../styles/theme.wxss";
.icon-button{width:{{controls.touchSize.px}};min-height:{{controls.touchSize.px}};margin:0;padding:{{space.1.px*1.25}};background:transparent;border-radius:{{radius.1.px}};display:flex;align-items:center;justify-content:center}

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }
button.icon-button { min-height:{{controls.touchSize.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
button.icon-button.ew-hit-target { min-height:{{controls.touchSize.px}}; }
