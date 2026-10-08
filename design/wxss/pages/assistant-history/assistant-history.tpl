@import "../../styles/theme.wxss";
.history-session { width:100%;margin:{{space.1.rpx}} 0;white-space:normal; }
.history-message { margin:{{space.2.rpx}} 0;white-space:pre-wrap;overflow-wrap:anywhere; }

/* Warm table v2: assistant-history */
 .history-session { display:flex; align-items:center; justify-content:space-between; text-align:left; background:{{card}}; color:{{text}}; border:0; border-bottom:1px solid {{divider}}; border-radius:0; padding:16px; margin:0; font-size:{{font.reading.em}}; line-height:1.6; }.history-session.active { background:{{brandSoft}}; color:{{brand}}; }.history-message { padding:14px 0; border-bottom:1px solid {{divider}}; line-height:1.8; font-size:{{font.reading.em}}; }.history-message > view { white-space:pre-wrap; overflow-wrap:anywhere; }.history-message .ew-muted { font-size:{{font.caption.em}}; margin-bottom:6px; }
