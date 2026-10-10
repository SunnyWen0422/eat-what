/* Components cannot import page, tag or attribute selectors. Keep this vocabulary scoped. */
:host { font-size:inherit; color:{{text}}; }
.ew-hit-target { min-width:44px; min-height:44px; box-sizing:border-box; }
.ew-placeholder { color:{{muted}}; }
.ew-card { background:{{card}}; border-radius:18px; padding:16px; margin:16px 0; box-sizing:border-box; }
.ew-title { display:block; font-size:{{font.card.em}}; font-weight:600; line-height:1.5; overflow-wrap:break-word; }
.ew-muted { display:block; font-size:{{font.secondary.em}}; color:{{muted}}; line-height:1.6; overflow-wrap:break-word; }
.ew-row,.ew-between { display:flex; align-items:center; gap:8px; min-width:0; }
.ew-between { justify-content:space-between; }
.ew-mask { position:fixed; inset:0; z-index:100; background:rgba(25,40,30,.45); display:flex; align-items:flex-end; }
.ew-sheet { width:100%; max-height:100%; box-sizing:border-box; }
.ew-button { display:flex; align-items:center; justify-content:center; min-height:48px; padding:12px 16px; border:0; border-radius:14px; background:{{brand}}; color:{{card}}; font-size:{{font.body.em}}; line-height:1.5; box-sizing:border-box; }
.ew-button::after { border:0; }
.ew-button.secondary { background:{{card}}; color:{{brand}}; border:1px solid {{controlBorder}}; }
.is-disabled { opacity:1; }
