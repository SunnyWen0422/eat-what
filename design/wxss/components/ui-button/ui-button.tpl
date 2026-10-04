.button { min-height:{{controls.primaryHeight.px}}; background:{{brand}}; color:white; border-radius:{{radius.1.rpx*1.2}}; font-size:{{font.body.em}}; font-weight:600; padding:{{space.1.rpx*1.25}} {{space.2.rpx*1.1666667}}; line-height:1.5; } .button::after { border:0; } .secondary { background:{{brandSoft}}; color:{{brand}}; } .danger { background:{{dangerSoft}}; color:{{danger}}; } .button[disabled] { background:{{disabled}}; color:{{text}}; }

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
