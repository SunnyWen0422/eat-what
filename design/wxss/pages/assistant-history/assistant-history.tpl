@import "../../styles/theme.wxss";
.history-session { width:100%;margin:{{space.1.rpx}} 0;white-space:normal; }
.history-message { margin:{{space.2.rpx}} 0;white-space:pre-wrap;overflow-wrap:anywhere; }
.ew-page button.history-session { width:100%; max-width:100%; margin:0; white-space:normal; font-family:inherit; font-weight:400; box-sizing:border-box; }

/* Warm table v2: assistant-history */
 .history-session { display:flex; align-items:center; justify-content:space-between; text-align:left; background:{{card}}; color:{{text}}; border:0; border-bottom:1px solid {{divider}}; border-radius:0; padding:16px; margin:0; font-size:{{font.reading.em}}; line-height:1.6; }.history-session.active { background:{{brandSoft}}; color:{{brand}}; }.history-message { padding:14px 0; border-bottom:1px solid {{divider}}; line-height:1.8; font-size:{{font.reading.em}}; }.history-message > view { white-space:pre-wrap; overflow-wrap:anywhere; }.history-message .ew-muted { font-size:{{font.caption.em}}; margin-bottom:6px; }
.ew-page button.history-session { background:{{glassSurface}}; border:1px solid {{glassBorder}}; border-radius:16px; margin:8px 0; }
.ew-page button.history-session.active { background:{{brandSoft}}; border-color:{{controlBorder}}; }
.history-content { margin:20px 0; }
.history-message { max-width:94%; padding:14px; background:{{glassSurface}}; border:1px solid {{glassBorder}}; border-radius:16px 16px 16px 4px; }
.history-message.history-user { margin-left:auto; background:{{brand}}; color:{{card}}; border-color:{{brand}}; border-radius:16px 16px 4px 16px; }
.history-user .ew-muted { color:{{card}}; }
.history-meal { padding:16px; margin:16px 0; }
