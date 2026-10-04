.card { background:white; border:1rpx solid {{border}}; border-radius:{{radius.2.rpx*1.1428571}}; overflow:hidden; color:{{text}}; } .image,.placeholder { width:100%; height:240rpx; } .placeholder { background:{{brandSoft}}; display:flex; align-items:center; justify-content:center; color:{{muted}}; font-size:{{font.secondary.em}}; } .name { font-size:{{font.card.em}}; font-weight:600; display:block; margin:{{space.2.rpx}} {{space.2.rpx}} {{space.0.rpx*1.5}}; } .description { display:block; font-size:{{font.secondary.em}}; color:{{muted}}; margin:0 {{space.2.rpx}} {{space.2.rpx}}; }

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
