.ingredient-row { display:flex; flex-wrap:wrap; align-items:center; min-height:52px; min-width:0; border-bottom:1px solid {{divider}}; font-size:inherit; }
.ingredient-check, .ingredient-quantity, .ingredient-sources { min-width:44px; min-height:44px; margin:0; padding:{{space.0.px}}; display:flex; align-items:center; justify-content:center; background:transparent; border:0; color:{{text}}; font-family:inherit; font-size:inherit; line-height:1.5; }
.ingredient-check, .ingredient-sources { flex:0 0 44px; }
.ingredient-name { flex:1 1 80px; min-width:0; font-size:{{font.body.em}}; line-height:1.5; padding:{{space.0.px}} 0; overflow-wrap:anywhere; }
.ingredient-quantity { flex:0 1 auto; max-width:55%; overflow-wrap:anywhere; text-align:right; font-size:{{font.secondary.em}}; color:{{muted}}; }
.check-box { width:18px; height:18px; box-sizing:border-box; border:1px solid {{controlBorder}}; border-radius:4px; display:flex; align-items:center; justify-content:center; }
.is-checked .check-box { border-color:{{brand}}; background:{{brandSoft}}; }
.is-checked .ingredient-name { color:{{muted}}; }
.ingredient-row button[disabled] { background:transparent; color:{{muted}}; }
.ingredient-row button::after { border:0; }
