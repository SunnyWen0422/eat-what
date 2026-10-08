@import "styles/theme.wxss";
/**app.wxss - 全局样式 **/

page {
  height: 100%;
  background-color: {{card}};
  color: {{text}};
  font-size:{{font.body.px}};
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 原生导航之外的可用窗口；操作栏占据真实高度，滚动区自动让位。 */
.mobile-screen {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  background: {{background}};
}
.mobile-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
}
.mobile-scroll-content {
  min-width: 0;
  padding:{{space.3.px}} {{space.3.px}} {{space.5.px}};
  box-sizing: border-box;
}

.container {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding:0;
  box-sizing: border-box;
}

/* 通用卡片 */
.card {
  background: {{card}};
  border-radius:{{radius.0.rpx*1.1666667}};
  padding:{{space.2.rpx}};
  border: 1rpx solid #e3eeea;
}

/* 按钮重置 */
button::after { border: none; }
.btn-primary {
  background: {{brand}};
  color: {{card}};
  font-weight: 600;
  border-radius:{{radius.0.rpx*1.1666667}};
}

/* 标签 */
.tag-green {
  font-size:{{font.caption.em}};
  padding:{{space.0.rpx*0.25}} {{space.0.rpx*1.5}};
  border-radius:{{radius.0.rpx*0.83333333}};
  background: {{brandSoft}};
  color: {{brand}};
}

/* 骨架屏动画 */
@keyframes shimmer {
  from { background-position: -200% 0; }
  to { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, {{border}} 25%, {{background}} 50%, {{border}} 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

/* 空状态 */
.empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding:{{space.6.rpx*1.25}} {{space.4.rpx}};
}
.empty-icon { font-size:{{font.page.em*1.66664}}; opacity: 0.5; margin-bottom:{{space.1.rpx*1.25}}; }
.empty-title { font-size:{{font.card.em}}; font-weight: bold; color: {{text}}; }
.empty-desc { font-size:{{font.caption.em}}; color: {{muted}}; margin-top:{{space.0.rpx*1.25}}; }

page{background:{{background}};color:{{text}};font-size:{{font.body.px}}}
.mobile-screen{background:{{background}}}
