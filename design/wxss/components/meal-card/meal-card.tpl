.card { background:{{card}}; border:1rpx solid {{border}}; border-radius:{{radius.2.rpx*1.1428571}}; padding:{{space.2.rpx*1.1666667}}; margin-bottom:{{space.2.rpx}}; } .heading { display:flex; align-items:center; justify-content:space-between; font-size:{{font.body.em}}; font-weight:500; color:{{text}}; } .status { font-size:{{font.caption.em}}; color:{{muted}}; font-weight:400; } .name { display:block; font-size:{{font.section.em}}; font-weight:500; margin:{{space.2.rpx}} 0 {{space.0.rpx*1.5}}; color:{{brand}}; min-height:48rpx; } .description { display:block; font-size:{{font.secondary.em}}; color:{{muted}}; line-height:1.6; }

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }



.ew-placeholder { color:{{muted}}; }

.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }

/* Warm table v2: status plus content, one explicit navigation. */
.card { border:0; border-radius:18px; padding:16px; margin-bottom:12px; }
.heading { gap:12px; align-items:flex-start; }.meal-title { flex:1; }
.status { line-height:1.5; }.name { min-height:0; color:{{text}}; margin:12px 0 8px; line-height:1.5; overflow-wrap:anywhere; }
.meal-link { padding:0; background:transparent; text-align:left; border:0; border-radius:0; }.meal-link::after { border:0; }
.description { font-size:{{font.body.em}}; line-height:1.7; }

.card { background:{{glassSurface}}; border:1px solid {{glassBorder}}; border-radius:16px; box-shadow:0 5px 16px rgba(30,71,56,0.03); }

/* Calendar navigation belongs to the whole row, not a second filled CTA. */
.card.card-navigation { display:flex; align-items:center; justify-content:space-between; gap:16px; width:100%; max-width:100%; min-height:72px; margin:0 0 12px; padding:14px 16px; box-sizing:border-box; text-align:left; white-space:normal; font-family:inherit; font-size:1em; font-weight:400; line-height:1.5; color:{{text}}; }
.card.card-navigation::after { border:0; }
.card-copy { flex:1; min-width:0; }
.card-navigation .heading { align-items:baseline; justify-content:flex-start; flex-wrap:wrap; gap:4px 12px; }
.card-navigation .meal-title { flex:0 0 auto; }
.card-navigation .name { margin:6px 0 0; font-size:{{font.body.em}}; font-weight:400; }
.card-action { display:flex; align-items:center; flex:0 0 auto; gap:4px; color:{{brand}}; font-size:{{font.secondary.em}}; font-weight:400; background:transparent; }
.card-action-icon { flex:0 0 auto; }
