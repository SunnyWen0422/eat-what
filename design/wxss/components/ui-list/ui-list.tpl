@import "../../styles/theme.wxss";
.list-row{display:flex;align-items:center;gap:{{space.2.px}};min-height:56px;text-align:left;background:white;padding:{{space.2.px}} 0;border-radius:0;font-size:{{font.body.em}};border-bottom:1px solid #D9E1D5}

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
