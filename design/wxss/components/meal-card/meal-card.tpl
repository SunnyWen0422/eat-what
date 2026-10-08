.card { background:{{card}}; border:1rpx solid {{border}}; border-radius:{{radius.2.rpx*1.1428571}}; padding:{{space.2.rpx*1.1666667}}; margin-bottom:{{space.2.rpx}}; } .heading { display:flex; align-items:center; justify-content:space-between; font-size:{{font.body.em}}; font-weight:600; color:{{text}}; } .status { font-size:{{font.caption.em}}; color:{{muted}}; font-weight:400; } .name { display:block; font-size:{{font.section.em}}; font-weight:600; margin:{{space.2.rpx}} 0 {{space.0.rpx*1.5}}; color:{{brand}}; min-height:48rpx; } .description { display:block; font-size:{{font.secondary.em}}; color:{{muted}}; line-height:1.6; }

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }

/* Warm table v2: status plus content, one explicit navigation. */
.card { border:0; border-radius:18px; padding:16px; margin-bottom:12px; }
.heading { gap:12px; align-items:flex-start; }.heading > text:first-child { flex:1; }
.status { line-height:1.5; }.name { min-height:0; color:{{text}}; margin:12px 0 8px; line-height:1.5; overflow-wrap:anywhere; }
.meal-link { padding:0; background:transparent; text-align:left; border:0; border-radius:0; }.meal-link::after { border:0; }
.description { font-size:{{font.body.em}}; line-height:1.7; }
