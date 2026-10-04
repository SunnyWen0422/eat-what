.mask { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(25,40,30,.45); z-index:100; display:flex; align-items:flex-end; } .sheet { background:white; width:100%; border-radius:{{radius.3.rpx}} {{radius.3.rpx}} 0 0; padding:{{space.3.rpx*1.125}} {{space.3.rpx}} calc({{space.3.rpx}} + env(safe-area-inset-bottom)); box-sizing:border-box; max-height:100%; display:flex; flex-direction:column; overflow:hidden; } .title { display:block; font-size:{{font.section.em}}; font-weight:600; color:{{text}}; } .description { display:block; font-size:{{font.secondary.em}}; line-height:1.6; color:{{muted}}; margin:{{space.1.rpx}} 0 {{space.2.rpx}}; } .actions { display:flex; gap:{{space.1.rpx}}; margin-top:{{space.2.rpx*1.1666667}}; } button { flex:1; min-height:{{controls.touchSize.px}}; border-radius:{{radius.1.rpx*1.2}}; font-size:{{font.body.em}}; } button::after { border:0; } .cancel { background:{{brandSoft}}; color:{{brand}}; } .confirm { background:{{brand}}; color:white; }

.content { min-height:0; max-height:50vh; flex:1; } .title,.description,.actions { flex-shrink:0; }

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

.confirm { min-height:{{controls.primaryHeight.px}}; }

.ew-placeholder { color:{{muted}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }
