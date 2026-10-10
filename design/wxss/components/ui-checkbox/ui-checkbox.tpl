@import "../../styles/component-theme.wxss";
.check-row{display:flex;align-items:center;gap:{{space.1.px}};min-height:{{controls.touchSize.px}};font-size:{{font.body.em}}}

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }



.ew-placeholder { color:{{muted}}; }

.check-row { min-width:{{controls.touchSize.px}}; }

.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
