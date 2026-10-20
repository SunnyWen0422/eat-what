@import "../../styles/theme.wxss";
.page{height:100vh;display:flex;flex-direction:column;background:#f7fbf9;box-sizing:border-box;padding-bottom:env(safe-area-inset-bottom)}
.assistant-head{display:flex;align-items:center;justify-content:space-between;padding:{{space.2.rpx}} {{space.3.rpx}} {{space.1.rpx*1.125}};background:linear-gradient(180deg,#e7f8f1 0%,{{card}} 100%);flex-shrink:0}
.head-title{font-size:{{font.section.em}};font-weight:500;color:{{brand}};line-height:1.25}.head-subtitle{margin-top:{{space.0.rpx}};font-size:{{font.caption.em}};color:{{muted}}}
.clear-btn{display:flex;align-items:center;gap:{{space.0.rpx}};color:{{muted}};font-size:{{font.caption.em}};padding:{{space.0.rpx*1.25}}}.clear-btn .line-icon{width:28rpx;height:28rpx}
.task-summary{display:flex;align-items:center;gap:{{space.0.rpx*1.25}};margin:0 {{space.2.rpx}} {{space.0.rpx}};padding:{{space.0.rpx*1.5}} {{space.1.rpx}};background:{{card}};border:1rpx solid #dcece5;border-radius:{{radius.0.rpx}};color:{{brand}};font-size:{{font.caption.em}};flex-shrink:0}.task-summary text:last-child{margin-left:auto;color:{{muted}}}.task-dot{width:12rpx;height:12rpx;border-radius:50%;background:{{brand}}}.task-dot-loading{animation:blink 1.2s infinite}.stop-task{color:{{brand}}!important;padding-left:{{space.1.rpx*1.125}}}.mode-badge{margin-left:{{space.0.rpx*1.25}}!important;padding:{{space.0.rpx*0.25}} {{space.0.rpx*1.25}};border-radius:{{radius.0.rpx*1.1666667}};background:#e8f8f1;color:{{brand}}!important;font-size:{{font.caption.em}}}
.msg-list{flex:1;min-height:0;padding:{{space.1.rpx*1.125}} {{space.2.rpx}} {{space.2.rpx}};box-sizing:border-box;overflow-y:auto}.welcome-block{text-align:center;padding:{{space.6.rpx*1.125}} {{space.4.rpx}} {{space.4.rpx*1.05}}}.welcome-icon{width:92rpx;height:92rpx;border-radius:50%;margin:0 auto {{space.2.rpx}};display:flex;align-items:center;justify-content:center;background:#dff4ec;color:{{brand}}}.welcome-icon .line-icon{width:48rpx;height:48rpx}.welcome-title{font-size:{{font.card.em}};font-weight:500;color:{{brand}}}.welcome-text{font-size:{{font.secondary.em}};line-height:1.7;color:{{muted}};margin-top:{{space.1.rpx*0.875}}}
.msg-row{display:flex;align-items:flex-start;margin-bottom:{{space.1.rpx*1.25}}}.row-right{flex-direction:row-reverse}.avatar-bot-fb,.avatar-user,.avatar-user-fb{width:64rpx;height:64rpx;border-radius:50%;flex-shrink:0;margin:0 {{space.0.rpx*1.25}}}.avatar-bot-fb,.avatar-user-fb{display:flex;align-items:center;justify-content:center}.avatar-bot-fb{background:#e1f4ed;color:{{brand}}}.avatar-user-fb{background:#e7ecea;color:{{muted}}}.avatar-bot-fb .line-icon,.avatar-user-fb .line-icon{width:36rpx;height:36rpx}.msg-bubble{max-width:78%;padding:{{space.1.rpx}} {{space.1.rpx*1.25}};border-radius:{{radius.1.rpx*0.9}};font-size:{{font.body.em}};line-height:1.65;white-space:pre-wrap;word-break:break-word}.bubble-left{background:{{card}};color:{{text}};border:1rpx solid #deebe5;border-top-left-radius:6rpx}.bubble-right{background:{{brand}};color:{{card}};border-top-right-radius:6rpx}
.dish-cards{display:flex;flex-direction:column;gap:{{space.0.rpx*1.25}};padding:0 {{space.0.rpx}} {{space.0.rpx*1.5}} {{space.6.rpx*1.3125}}}.dish-card{display:flex;align-items:center;min-height:92rpx;padding:{{space.0.rpx*1.5}} {{space.1.rpx*0.875}};background:{{card}};border:1rpx solid {{brandSoft}};border-radius:{{radius.0.rpx}};box-sizing:border-box}.dc-img,.dc-img-fb{width:100rpx;height:76rpx;border-radius:{{radius.0.rpx*0.66666667}};flex-shrink:0;margin-right:{{space.1.rpx*0.875}};background:#eff6f3}.dc-img-fb{display:flex;align-items:center;justify-content:center;color:{{brand}}}.dc-img-fb .line-icon{width:36rpx;height:36rpx}.dc-info,.plan-dish-main{flex:1;min-width:0}.dc-name,.plan-dish-name{display:block;font-size:{{font.body.em}};font-weight:500;color:{{text}};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dc-reason,.plan-reason{display:block;margin-top:{{space.0.rpx*0.75}};font-size:{{font.caption.em}};color:{{muted}};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dc-arrow,.plan-arrow{font-size:{{font.section.em}};color:{{muted}};margin-left:{{space.0.rpx*1.25}}}
.plan-block{margin:{{space.0.rpx*0.75}} {{space.0.rpx}} {{space.1.rpx*1.25}};padding:{{space.1.rpx*1.25}};background:{{card}};border:1rpx solid {{brandSoft}};border-radius:{{radius.0.rpx*1.1666667}}}.plan-heading{display:flex;justify-content:space-between;align-items:center;font-size:{{font.body.em}};color:{{brand}};font-weight:500}.plan-version{font-size:{{font.caption.em}};color:{{muted}};font-weight:400}.meal-group{margin-top:{{space.1.rpx*1.125}}}.meal-heading{display:flex;justify-content:space-between;color:{{muted}};font-size:{{font.caption.em}};padding-bottom:{{space.0.rpx}};border-bottom:1rpx solid #edf3f0}.plan-dish{display:flex;align-items:center;padding:{{space.1.rpx}} 0;border-bottom:1rpx solid #f0f4f2}.plan-dish:last-child{border-bottom:0}.plan-actions{display:flex;gap:{{space.0.rpx*1.5}};margin-top:{{space.1.rpx}}}.secondary-action,.primary-action{border-radius:{{radius.0.rpx*0.83333333}};font-size:{{font.secondary.em}};line-height:70rpx;height:70rpx;padding:0 {{space.1.rpx*1.25}};box-sizing:border-box}.secondary-action{flex:1;color:{{brand}};background:#f0faf6;border:1rpx solid #cce9dc}.plan-warning{display:flex;align-items:flex-start;gap:{{space.0.rpx}};margin-top:{{space.0.rpx*1.5}};padding:{{space.0.rpx*1.5}};background:#fff9e9;color:{{warning}};font-size:{{font.caption.em}};line-height:1.5;border-radius:{{radius.0.rpx*0.66666667}}}.plan-warning .line-icon{width:28rpx;height:28rpx;flex-shrink:0}
.howto-block{margin:{{space.0.rpx*0.75}} {{space.0.rpx}} {{space.1.rpx*1.25}};padding:{{space.1.rpx*1.25}};background:{{card}};border:1rpx solid {{brandSoft}};border-radius:{{radius.0.rpx*1.1666667}}}.howto-heading{display:flex;align-items:center;justify-content:space-between;color:{{brand}};font-size:{{font.body.em}};font-weight:500}.howto-source{font-size:{{font.caption.em}};font-weight:400;color:{{muted}}}.howto-step{display:flex;align-items:flex-start;gap:{{space.0.rpx*1.5}};margin-top:{{space.1.rpx}};color:{{muted}};font-size:{{font.secondary.em}};line-height:1.55}.step-index{width:34rpx;height:34rpx;line-height:34rpx;border-radius:50%;background:#e1f4ed;color:{{brand}};text-align:center;font-size:{{font.caption.em}};flex-shrink:0}.step-text{flex:1;word-break:break-word}.howto-empty{margin-top:{{space.1.rpx}};color:{{muted}};font-size:{{font.caption.em}};line-height:1.5}
.alternatives-block{margin:0 {{space.0.rpx}} {{space.1.rpx*1.25}};padding:{{space.1.rpx*1.125}} {{space.1.rpx*1.25}};background:#fbfefd;border:1rpx solid #e3eee9;border-radius:{{radius.0.rpx*1.1666667}}}.alternatives-heading{display:flex;justify-content:space-between;align-items:center;color:{{brand}};font-size:{{font.secondary.em}}}.alternatives-heading text:last-child{font-size:{{font.caption.em}};color:{{muted}}}.alternative-row{display:flex;align-items:center;padding:{{space.1.rpx*0.875}} 0;border-bottom:1rpx solid #edf3f0}.alternative-row:last-child{border-bottom:0}.alternative-main{flex:1;min-width:0}.alternative-name{display:block;color:{{brand}};font-size:{{font.secondary.em}}}.alternative-reason{display:block;margin-top:{{space.0.rpx*0.5}};color:{{muted}};font-size:{{font.caption.em}};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.action-bar{display:flex;gap:{{space.0.rpx*1.5}};flex-wrap:wrap;padding:{{space.1.rpx*0.875}} {{space.2.rpx}} {{space.0.rpx*0.75}};background:{{card}};border-top:1rpx solid #e8efec;flex-shrink:0}.primary-action{flex:1;min-width:260rpx;color:{{card}};background:{{brand}}}.ew-page .primary-action[disabled]{opacity:1;background:{{disabled}};color:{{text}}}
.quick-bar{display:flex;white-space:nowrap;background:{{card}};border-top:1rpx solid #eef3f1;padding:{{space.0.rpx*1.5}} {{space.2.rpx}};box-sizing:border-box;flex-shrink:0}.quick-btn{display:inline-block;margin-right:{{space.0.rpx*1.5}};padding:{{space.0.rpx*1.25}} {{space.1.rpx*1.125}};border-radius:{{radius.1.rpx*1.1}};background:#eef9f5;color:{{brand}};font-size:{{font.caption.em}};white-space:nowrap}.input-bar{display:flex;align-items:center;gap:{{space.0.rpx*1.5}};padding:{{space.0.rpx*1.5}} {{space.2.rpx}} calc({{space.0.rpx*1.5}} + env(safe-area-inset-bottom));background:{{card}};border-top:1rpx solid #e8efec;flex-shrink:0}.chat-input{flex:1;min-width:0;height:76rpx;padding:0 {{space.2.rpx*0.91666667}};border-radius:{{radius.3.rpx*1.0555556}};background:#f3f6f5;color:{{text}};font-size:{{font.body.em}};box-sizing:border-box}.send-btn{width:76rpx;height:76rpx;line-height:76rpx;padding:0;border-radius:50%;background:{{brand}};display:flex;align-items:center;justify-content:center;flex-shrink:0}.send-btn .line-icon{width:34rpx;height:34rpx;color:{{card}}}.send-btn[disabled]{opacity:1;background:{{disabled}};color:{{text}}}.typing-dots{display:flex;gap:{{space.0.rpx}};padding:{{space.1.rpx*0.875}} {{space.2.rpx*0.91666667}}}.dot{font-size:{{font.caption.em}};color:{{brand}};animation:blink 1.2s infinite}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}@keyframes blink{0%,100%{opacity:.85}50%{opacity:1}}.error-state{display:flex;align-items:center;gap:{{space.0.rpx*1.5}};padding:{{space.0.rpx*1.5}} {{space.1.rpx}};margin:0 {{space.0.rpx}} {{space.1.rpx}};background:#fff2f0;border-radius:{{radius.0.rpx*0.83333333}};color:{{danger}};font-size:{{font.caption.em}}}.error-state text{flex:1}.error-state button{margin:0;padding:0 {{space.1.rpx*1.125}};height:54rpx;line-height:54rpx;border-radius:{{radius.0.rpx*0.66666667}};color:{{danger}};background:{{card}};border:1rpx solid #edc6c0;font-size:{{font.caption.em}}}

/* 页面共享主题，适用于本页详情、表单和弹层。 */

.plan-dish { flex-wrap:wrap; }
.dish-commands { display:flex;gap:{{space.0.rpx*1.5}};width:100%; }
.clear-btn,.quick-btn,.stop-task { min-height:{{controls.touchSize.px}};min-width:{{controls.touchSize.px}};display:inline-flex;align-items:center;justify-content:center; }

/* Shared finish for legacy pages; layout and permission-specific states remain local. */
.ew-page { background:{{background}}; color:{{text}}; }
.ew-page .btn-primary, .ew-page .primary-btn, .ew-page .save-btn, .ew-page .primary-action, .ew-page .generate-btn { background:{{brand}}; border-radius:{{radius.1.rpx*1.2}}; }
.ew-page .choice-chip, .ew-page .ingredient-chip, .ew-page .count-btn, .ew-page .clear-btn, .ew-page .period-nav, .ew-page .filter-chip { min-height:{{controls.touchSize.px}}; min-width:{{controls.touchSize.px}}; box-sizing:border-box; }

@import "../../styles/workspace.wxss";

/* Input and touch minima remain fixed under small screens/font changes. */
.ew-page button,.ew-page input,.ew-page .count-btn,.ew-page .choice-chip,.ew-page .filter-chip,.ew-page .date-picker{min-height:{{controls.touchSize.px}};box-sizing:border-box}
.ew-page .primary-btn,.ew-page .save-btn,.ew-page .primary-action,.ew-page .wx-login-btn{min-height:{{controls.primaryHeight.px}}}

.send-btn { width:auto; min-width:64px; border-radius:{{radius.2.px}}; padding:0 {{space.2.px}}; color:{{card}}; }

/* Fixed CSS pixels protect the actual event node at the 320px baseline. */
.ew-hit-target, .ew-page .ew-hit-target { min-width:{{controls.touchSize.px}}; min-height:{{controls.touchSize.px}}; box-sizing:border-box; }
text.ew-hit-target { display:inline-flex; align-items:center; justify-content:center; }
picker.ew-hit-target { display:block; }
button { min-width:{{controls.touchSize.px}}; min-height:{{controls.primaryHeight.px}}; }


button.ew-hit-target, .ew-page button.ew-hit-target { min-height:{{controls.primaryHeight.px}}; }

.connected-assistant{display:flex;flex-direction:column;height:100vh;box-sizing:border-box;background:{{background}};color:{{text}};line-height:1.5;overflow:hidden}
.connected-header{display:flex;flex:none;align-items:center;gap:{{space.2.px}};padding:{{space.4.px}} {{space.4.px}} {{space.3.px}};border-bottom:1px solid {{divider}}}
.connected-header>view{flex:1;min-width:0}.connected-header .ew-heading{display:block;font-size:{{font.section.em}}}.connected-target{display:block;font-size:{{font.secondary.em}};color:{{muted}};margin-top:{{space.1.px}}}
.connected-messages{flex:1;min-height:0;width:100%;box-sizing:border-box;padding:{{space.4.px}}}
.connected-welcome{display:flex;flex-direction:column;gap:{{space.2.px}};padding:{{space.5.px}} 0;align-items:flex-start}.connected-welcome .ew-muted{font-size:{{font.secondary.em}}}
.connected-message{display:flex;flex-direction:column;gap:{{space.2.px}};margin-bottom:{{space.4.px}};min-width:0}.connected-bubble{white-space:pre-wrap;overflow-wrap:anywhere;padding:{{space.2.px}} {{space.3.px}};border-radius:{{radius.2.px}};background:{{card}};max-width:100%;box-sizing:border-box;align-self:flex-start}
.connected-user .connected-bubble{background:{{brandSoft}};align-self:flex-end}.connected-progress{display:flex;flex-wrap:wrap;align-items:center;font-size:{{font.secondary.em}};color:{{muted}}}
.connected-composer{flex:none;padding:{{space.2.px}} {{space.3.px}} calc({{space.2.px}} + env(safe-area-inset-bottom));border-top:1px solid {{divider}};background:{{card}}}
.connected-input-row{display:flex;align-items:flex-end;gap:{{space.1.px}};min-width:0}.connected-input{flex:1;min-width:0;width:0;min-height:{{controls.touchSize.px}};max-height:160px;box-sizing:border-box;padding:{{space.2.px}};border-radius:{{radius.1.px}};background:{{surfaceSoft}};font-size:1em;line-height:1.5}.connected-send{flex:none;background:{{brand}};color:{{card}};border-radius:{{radius.1.px}};font-size:{{font.secondary.em}};padding:{{space.2.px}} {{space.2.px}};margin:0;min-height:{{controls.touchSize.px}}}.connected-send[disabled]{background:{{disabled}};color:{{muted}}}.connected-voice{flex:none;padding:{{space.1.px}};margin:0;background:transparent;border:0;color:{{brand}}}.connected-voice::after,.connected-send::after{border:0}

/* Approved F assistant: readable glass, with no blur per message. */
.connected-assistant.ew-dish-surface { background:linear-gradient(145deg,{{glassStart}},{{glassMid}} 60%,{{glassEnd}}); }
.connected-header, .assistant-head { background:{{glassChrome}}; border-bottom:1px solid {{glassBorder}}; padding:16px; }
.connected-header .ew-heading { font-size:{{font.section.em}}; }
.connected-messages { padding:16px; }
.connected-bubble, .bubble-left { background:{{glassSurface}}; border:1px solid {{glassBorder}}; border-radius:16px 16px 16px 4px; color:{{text}}; line-height:1.65; box-shadow:0 5px 16px rgba(30,71,56,0.03); }
.connected-user .connected-bubble, .bubble-right { background:{{brand}}; color:{{card}}; border:1px solid {{brand}}; border-radius:16px 16px 4px 16px; }
.connected-bubble { max-width:94%; }.connected-user .connected-bubble { max-width:88%; }
.connected-composer, .input-bar, .quick-bar, .action-bar { background:{{glassChrome}}; border-top-color:{{glassBorder}}; }
.connected-input, .chat-input { background:{{card}}; border:1px solid {{controlBorder}}; border-radius:14px; }
.connected-voice { border:1px solid transparent; border-radius:14px; background:{{brandSoft}}; }
.dish-card, .plan-block, .howto-block, .alternatives-block { background:{{glassSurface}}; border:1px solid {{glassBorder}}; border-radius:16px; padding:10px; box-shadow:0 5px 16px rgba(30,71,56,0.03); }
.dc-img, .dc-img-fb { width:56px; height:56px; border-radius:14px; }.dc-name, .plan-dish-name { white-space:normal; }
.connected-welcome { padding:24px 0; }.connected-welcome .ew-title { font-size:{{font.section.em}}; }
.connected-header .ew-hit-target { width:auto; flex:0 0 auto; margin:0; padding:8px; border:1px solid transparent; border-radius:10px; background:{{brandSoft}}; font-size:{{font.secondary.em}}; }
.connected-input-row .connected-voice { width:auto; flex:0 0 auto; min-width:48px; min-height:48px; margin:0; padding:8px; font-size:{{font.secondary.em}}; line-height:1.5; white-space:nowrap; }
.connected-input-row .connected-send { width:auto; flex:0 0 auto; min-width:56px; min-height:48px; margin:0; padding:12px; line-height:1.5; }
.connected-input-row .connected-input { width:0; flex:1 1 0%; min-width:0; min-height:48px; }
.connected-assistant .connected-input-row .connected-send[disabled] { opacity:1; background:{{disabled}}; color:{{muted}}; }

/* Header and settings are outside the independently scrolling conversation. */
.connected-assistant { position:fixed; top:0; right:0; bottom:0; left:0; }
.connected-context-panel { flex:0 1 auto; height:46%; max-height:340px; min-height:0; width:100%; box-sizing:border-box; padding:12px 16px 0; border-bottom:1px solid {{divider}}; }
.connected-context-panel.is-editing { height:65%; max-height:none; }
.connected-context-panel .connected-context-details { margin-bottom:12px; }
.connected-header { gap:8px; padding:8px 16px; background:transparent; border-bottom:1px solid {{divider}}; }
.connected-assistant button.connected-context { display:flex; align-items:center; gap:8px; flex:1 1 0%; min-width:0; width:auto; max-width:100%; min-height:44px; margin:0; padding:6px 0; background:transparent; color:{{muted}}; border:0; border-radius:0; text-align:left; font-size:.8125em; font-weight:400; line-height:1.5; white-space:normal; }
.connected-context-label { flex:1; min-width:0; word-break:keep-all; overflow-wrap:normal; }
.connected-context-chevron { display:flex; flex:none; align-items:center; transform:rotate(90deg); }
.connected-context-chevron.is-expanded { transform:rotate(-90deg); }
.connected-header button.connected-return { display:flex; align-items:center; justify-content:center; width:44px; min-width:44px; min-height:44px; flex:0 0 44px; margin:0; padding:0; background:transparent; border:0; border-radius:0; }
.connected-context::after,.connected-return::after,.connected-edit::after,.connected-shortcut::after { border:0; }
.connected-messages { padding:12px 16px 20px; }
.connected-context-details { display:flex; flex-direction:column; gap:8px; padding:12px 16px; margin:0 0 16px; background:linear-gradient(145deg,#F5FAF5,#FAF7FF 62%,#FFF8EF) padding-box,linear-gradient(125deg,#92CCB9,#C1B4E3 58%,#E4C8A7) border-box; border:1px solid transparent; border-radius:22px; font-size:.875em; line-height:1.6; overflow-wrap:anywhere; box-shadow:0 5px 18px rgba(55,75,69,.045); animation:assistant-reveal 180ms ease-out; }
.connected-section-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:44px; font-weight:500; }
.connected-assistant button.connected-edit { display:flex; align-items:center; justify-content:center; gap:5px; flex:none; width:auto; min-width:44px; min-height:44px; margin:0; padding:4px 0 4px 8px; background:transparent; border:0; color:{{brand}}; font-size:1em; font-weight:400; line-height:1.5; }
.connected-saved-heading { border-top:1px solid {{divider}}; margin-top:4px; padding-top:4px; }
.connected-context-row { display:flex; align-items:baseline; gap:12px; min-width:0; }
.connected-row-label { flex:0 0 5.5em; color:{{muted}}; }
.connected-row-value { flex:1; min-width:0; color:{{text}}; }
.connected-section-title { display:flex; align-items:center; gap:7px; min-width:0; color:#345E55; }
.connected-saved-heading .connected-section-title { color:{{muted}}; font-weight:500; }
.connected-edit-caption { color:{{muted}}; font-size:.85em; font-weight:400; }
.connected-welcome { align-items:flex-start; gap:16px; padding:24px 0; }
.connected-welcome-title { font-size:1.25em; line-height:1.45; font-weight:500; text-align:left; }
.connected-shortcuts { display:flex; flex-direction:column; align-items:stretch; gap:0; width:100%; max-width:100%; }
.connected-shortcuts button.connected-shortcut { display:flex; align-items:center; justify-content:flex-start; gap:10px; flex:none; min-width:44px; min-height:48px; max-width:100%; width:100%; margin:0; padding:12px 0; border:0; border-bottom:1px solid rgba(40,99,78,.1); border-radius:0; background:transparent; color:{{brand}}; text-align:left; font-size:.875em; font-weight:400; line-height:1.5; white-space:normal; }
.connected-shortcuts button.connected-shortcut:last-child { border-bottom:0; }
.connected-shortcut text { flex:1; min-width:0; overflow-wrap:anywhere; }
.connected-composer { max-height:55%; overflow-y:auto; padding:10px 16px calc(10px + env(safe-area-inset-bottom)); background:transparent; border-top:0; }
.connected-input-row { align-items:center; gap:6px; padding:6px; border:1px solid transparent; border-radius:24px; background:linear-gradient(115deg,#FCFFFC,#FBFAFE 65%,#FFFCF8) padding-box,linear-gradient(115deg,#9DCCBB,#BCB1DB 60%,#E5C5A2) border-box; box-shadow:0 5px 20px rgba(62,75,76,.07); }
.connected-input-row .connected-input { max-height:160px; min-height:44px; padding:10px 8px; border:0; border-radius:0; background:transparent; font-size:.875em; line-height:1.6; }
.connected-input-row .connected-send { min-width:52px; min-height:44px; padding:8px 10px; border:0; border-radius:17px; background:linear-gradient(125deg,#2D7560,#426D7F 60%,#695B8E); font-size:.8125em; font-weight:500; line-height:1.5; transition:opacity 140ms ease,transform 140ms ease; }
.connected-assistant .connected-input-row .connected-send[disabled] { background:{{disabled}}; color:{{muted}}; }
@media(max-width:360px) { .connected-header,.connected-messages,.connected-context-panel { padding-left:12px; padding-right:12px; }.connected-composer { padding-left:12px; padding-right:12px; }.connected-welcome { padding-top:24px; } }

/* Accent the conversation with the same restrained spectrum as the home entry. */
.connected-message { gap:10px; margin-bottom:18px; animation:assistant-reveal 180ms ease-out; }
.connected-bubble { padding:12px 14px; border-radius:18px 18px 18px 6px; font-size:.9375em; line-height:1.7; border:1px solid transparent; background:linear-gradient(125deg,#FDFFFC,#FCFAFE) padding-box,linear-gradient(125deg,#C8DDD0,#DAD3E9 70%,#EADBC8) border-box; box-shadow:0 4px 14px rgba(42,65,55,.035); }
.connected-user .connected-bubble { color:#254D44; background:linear-gradient(115deg,#DAEEE2,#E6E8F4 70%,#F1E8DD) padding-box,linear-gradient(115deg,#B4D6C3,#C8C9E6 70%,#DECAB6) border-box; border:1px solid transparent; border-radius:18px 18px 6px 18px; box-shadow:none; }
.connected-shortcut { transition:background-color 140ms ease,transform 140ms ease; }
.connected-shortcut:active { background-color:rgba(255,255,255,.42); transform:translateX(2px); }
.connected-send:active,.connected-editor-apply:active { opacity:.88; transform:scale(.98); }
.connected-feedback { display:flex; align-items:center; gap:8px; margin-bottom:8px; padding:10px 12px; border-radius:14px; border:1px solid #E1D7C7; background:#FFF9EE; color:#6F5637; font-size:.8125em; line-height:1.6; }
.connected-feedback .connected-feedback-text { flex:1; min-width:0; }
.connected-feedback .connected-feedback-icon { flex:none; align-self:center; margin:0; }
.connected-feedback.is-recoverable { border-color:#C8D8DD; background:#F0F7F7; color:#3D6267; }
.connected-assistant button.connected-recovery { display:inline-flex; align-items:center; justify-content:flex-start; gap:7px; width:auto; min-height:44px; margin:0 0 6px; padding:0 8px; border:0; border-radius:12px; background:transparent; color:{{brand}}; font-size:.8125em; line-height:1.5; }
.connected-recovery::after { border:0; }

/* A waiting indicator expresses activity, never a fabricated completion percent. */
.connected-progress { display:flex; flex-wrap:nowrap; align-items:center; gap:12px; width:100%; box-sizing:border-box; padding:12px; margin:4px 0 16px; border:1px solid transparent; border-radius:20px; background:linear-gradient(120deg,#F5FBF4,#F4F1FD 65%,#FFF7EC) padding-box,linear-gradient(115deg,#A8D0BB,#BFB1DD 62%,#E8CDA9) border-box; color:#35594F; box-shadow:0 5px 18px rgba(66,77,76,.045); animation:assistant-reveal 180ms ease-out; }
.connected-wait-visual { position:relative; display:flex; align-items:center; justify-content:center; width:40px; height:40px; flex:0 0 40px; border-radius:50%; background:rgba(255,255,255,.68); }
.connected-wait-orbit { position:absolute; top:0; right:0; bottom:0; left:0; border:2px solid #CEE1D8; border-top-color:#6F9E8F; border-right-color:#A995C5; border-bottom-color:#DEC39F; border-radius:50%; }
.is-waiting .connected-wait-orbit { animation:assistant-orbit 3s linear infinite; }
.connected-wait-copy { display:flex; flex-direction:column; gap:7px; flex:1; min-width:0; }
.connected-wait-label { font-size:1em; line-height:1.55; overflow-wrap:anywhere; }
.connected-wait-dots { display:flex; align-items:center; gap:5px; height:5px; }
.connected-wait-dots view { width:4px; height:4px; border-radius:50%; background:#648D7E; animation:assistant-breathe 1.5s ease-in-out infinite; }
.connected-wait-dots view:nth-child(2) { background:#9886B6; animation-delay:.2s; }
.connected-wait-dots view:nth-child(3) { background:#B59770; animation-delay:.4s; }
.connected-assistant button.connected-stop { display:flex; align-items:center; justify-content:center; flex:0 0 44px; width:44px; min-width:44px; min-height:44px; margin:0 -4px 0 0; padding:0; border:0; background:transparent; }
.connected-stop::after { border:0; }
.connected-stop-square { width:13px; height:13px; border-radius:3px; background:#5D776C; }

.connected-meal-editor { display:flex; flex-direction:column; gap:12px; min-width:0; padding-bottom:4px; }
.connected-editor-people,.connected-editor-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; min-width:0; }
.connected-editor-heading { min-height:44px; margin-bottom:-8px; }
.connected-stepper { display:flex; align-items:center; justify-content:center; flex:none; min-width:0; border:1px solid #DAE2DA; border-radius:13px; background:rgba(255,255,255,.7); overflow:hidden; }
.connected-assistant .connected-stepper button { display:flex; align-items:center; justify-content:center; width:44px; height:44px; min-width:44px; min-height:44px; padding:0; margin:0; border:0; border-radius:0; background:transparent; color:{{brand}}; font-size:1.15em; line-height:1; }
.connected-stepper button::after { border:0; }
.connected-stepper button[disabled] { opacity:.35; }
.connected-stepper input,.connected-count-value { width:32px; min-width:32px; height:44px; line-height:44px; padding:0; margin:0; border:0; background:transparent; color:{{text}}; font-size:1em; text-align:center; }
.connected-count-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 12px; }
.connected-count-item { min-width:0; display:flex; flex-direction:column; align-items:stretch; gap:4px; }
.connected-count-label { color:{{muted}}; font-size:.9em; }
.connected-editor-label { display:block; color:{{text}}; }
.connected-requirements-input { width:100%; min-height:64px; max-height:140px; box-sizing:border-box; padding:10px 12px; border:1px solid #CDD8CE; border-radius:13px; background:rgba(255,255,255,.85); color:{{text}}; font-size:1em; line-height:1.6; }
.connected-editor-error { color:{{danger}}; font-size:.9em; line-height:1.5; }
.connected-editor-actions { display:flex; align-items:stretch; gap:10px; }
.connected-assistant .connected-editor-actions button { flex:1; display:flex; align-items:center; justify-content:center; min-width:44px; min-height:44px; margin:0; padding:8px 12px; border:0; border-radius:13px; font-size:1em; line-height:1.5; }
.connected-editor-actions button::after { border:0; }
.connected-editor-cancel { background:#E7EEE8; color:#3E6150; }
.connected-editor-apply { background:linear-gradient(125deg,#2D7560,#426D7F 60%,#695B8E); color:#FFFFFF; transition:opacity 140ms ease,transform 140ms ease; }
.connected-editor-actions button[disabled] { opacity:.5; }
@keyframes assistant-reveal { from { opacity:.8; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
@keyframes assistant-orbit { to { transform:rotate(360deg); } }
@keyframes assistant-breathe { 0%,100% { opacity:.45; transform:translateY(0); } 50% { opacity:1; transform:translateY(-2px); } }
.assistant-reduced-motion .connected-message,.assistant-reduced-motion .connected-context-details,.assistant-reduced-motion .connected-progress,.assistant-reduced-motion .connected-wait-orbit,.assistant-reduced-motion .connected-wait-dots view { animation:none; }
.assistant-reduced-motion .connected-shortcut,.assistant-reduced-motion .connected-send,.assistant-reduced-motion .connected-editor-apply { transition:none; transform:none; }
/* User-requested default-on lightweight motion; no OS setting suppresses waiting feedback. */
/* Keep the legacy compatibility indicator static. */
.task-dot-loading,.dot { animation:none; }
