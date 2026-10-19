:host { display:inline-flex; align-items:stretch; width:44px; min-height:44px; flex:0 0 44px; vertical-align:middle; }
.favorite-star { display:flex; align-items:center; justify-content:center; flex:1; width:{{controls.touchSize.px}}; min-width:{{controls.touchSize.px}}; max-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; margin:0; padding:0; border:1px solid transparent; border-radius:{{radius.1.px}}; background:{{brandSoft}}; line-height:1; box-sizing:border-box; }
.favorite-star::after { border:0; }
.favorite-star.is-favorite { background:{{brandSoft}}; }
.favorite-star.favorite-pressed { background:{{divider}}; }
.favorite-star.is-busy { opacity:.6; }
