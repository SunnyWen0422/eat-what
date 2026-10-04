.card { background:{{card}}; border:1rpx solid {{border}}; border-radius:{{radius.2.rpx*1.1428571}}; padding:{{space.2.rpx*1.1666667}}; margin-bottom:{{space.2.rpx}}; } .heading { display:flex; align-items:center; justify-content:space-between; font-size:{{font.body.em}}; font-weight:600; color:{{text}}; } .status { font-size:{{font.caption.em}}; color:{{muted}}; font-weight:400; } .name { display:block; font-size:{{font.section.em}}; font-weight:600; margin:{{space.2.rpx}} 0 {{space.0.rpx*1.5}}; color:{{brand}}; min-height:48rpx; } .description { display:block; font-size:{{font.secondary.em}}; color:{{muted}}; line-height:1.6; }

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
