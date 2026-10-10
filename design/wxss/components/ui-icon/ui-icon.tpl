@import "../../styles/component-theme.wxss";
.icon{display:block;flex-shrink:0}

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }



.ew-placeholder { color:{{muted}}; }

.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
