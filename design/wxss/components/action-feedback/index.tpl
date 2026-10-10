.action-feedback { display:flex; flex-wrap:wrap; align-items:center; gap:{{space.1.px}}; min-width:0; padding:{{space.0.px}} {{space.1.px}}; margin:{{space.1.px}} 0; border-radius:{{radius.1.px}}; background:{{brandSoft}}; color:{{brand}}; font-size:inherit; animation:feedback-appear 180ms ease-out; }
.feedback-message { flex:1 1 120px; min-width:0; overflow-wrap:anywhere; font-size:{{font.secondary.em}}; line-height:1.5; }
.feedback-actions { display:flex; flex-wrap:wrap; gap:{{space.0.px}}; min-width:0; }
.feedback-action { min-height:44px; min-width:44px; max-width:100%; padding:{{space.1.px}} {{space.0.px}}; margin:0; border:0; border-radius:{{radius.0.px}}; background:transparent; color:{{brand}}; font-family:inherit; font-size:{{font.secondary.em}}; line-height:1.5; font-weight:600; overflow-wrap:anywhere; }
.feedback-action::after { border:0; }
.action-feedback.error { background:{{dangerSoft}}; color:{{danger}}; }
.action-feedback.unknown { background:{{warningSoft}}; color:{{warning}}; }
@keyframes feedback-appear { from { transform:translateY(2px); } to { transform:translateY(0); } }
