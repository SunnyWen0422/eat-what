@import "../../styles/theme.wxss";
.period { font-size:{{font.caption.em}}; color:{{muted}}; gap:{{space.0.rpx}}; } .period-nav { margin:0; width:88rpx; padding:0; background:{{brandSoft}}; color:{{brand}}; font-size:{{font.section.em}}; border-radius:{{radius.1.rpx}}; }
.day-grid { display:grid; grid-template-columns:repeat(7,minmax({{controls.touchSize.px}},1fr)); gap:{{space.0.rpx*0.75}}; margin:{{space.2.rpx}} 0; } .day { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; border-radius:{{radius.1.rpx}}; text-align:center; padding:{{space.0.rpx}} 0; box-sizing:border-box; } .day.selected { background:{{brand}}; color:{{card}}; } .weekday,.day-mark { display:block; font-size:{{font.caption.em}}; min-height:26rpx; } .day-number { display:block; font-size:{{font.body.em}}; font-weight:600; } .day-mark { color:{{brand}}; } .selected .day-mark { color:white; }

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:{{radius.1.rpx*1.2}}; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:{{controls.touchSize.px}}; min-width:{{controls.touchSize.px}}; box-sizing:border-box; }

.month-weekdays { display:grid; grid-template-columns:repeat(7,minmax({{controls.touchSize.px}},1fr)); gap:{{space.0.rpx*0.75}}; text-align:center; font-size:{{font.caption.em}}; color:{{muted}}; margin-top:{{space.2.rpx}}; }
@media (max-width:400px) {
  /* Seven date targets need at least 308px on a 320px device. */
  .calendar-card { margin-left:-{{space.2.rpx*1.1666667}}; margin-right:-{{space.2.rpx*1.1666667}}; padding-left:{{space.0.rpx*0.5}}; padding-right:{{space.0.rpx*0.5}}; }
  .calendar-card .day-grid, .calendar-card .month-weekdays { gap:0; }
}

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:{{controls.touchSize.px}};box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:{{controls.primaryHeight.px}}}

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }

button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }

.calendar-card{background:transparent;border:0;border-radius:0;margin-left:-10px;margin-right:-10px;padding:{{space.2.px}} 0}.day-grid{grid-template-columns:repeat(7,minmax(44px,1fr));gap:0}.day{min-width:44px;min-height:60px;box-sizing:border-box;padding:{{space.1.px}} 0;border:0;border-radius:{{radius.2.px}};height:auto}.day.selected{background:{{brand}};color:{{card}}}.day-number{font-size:{{font.reading.em}}}.weekday{font-size:{{font.caption.em}}}.period{padding:0 {{space.1.px}}}.meal-list .ew-card{border:0}.meal-link{border:0;border-bottom:1px solid {{divider}};background:transparent;border-radius:0;box-shadow:none}
