.state { text-align:center; padding:{{space.6.rpx}} {{space.3.rpx}}; color:{{muted}}; } .symbol { font-size:{{font.page.em*1.25002}}; color:{{brand}}; margin-bottom:{{space.2.rpx}}; } .title { display:block; color:{{text}}; font-size:{{font.card.em}}; font-weight:600; } .description { display:block; margin:{{space.1.rpx}} 0; font-size:{{font.secondary.em}}; line-height:1.6; } .action { background:{{brandSoft}}; color:{{brand}}; min-height:{{controls.touchSize.px}}; border-radius:{{radius.1.rpx*1.2}}; font-size:{{font.body.em}}; margin-top:{{space.2.rpx}}; } .action::after { border:0; } .error .symbol { color:{{danger}}; }

.illustration{width:160px;height:145px;display:block;margin:0 auto {{space.3.px}}}

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
