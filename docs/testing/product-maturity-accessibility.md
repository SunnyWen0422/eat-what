# 共享控件与动态效果

T11保留原字号24/18/16/13/12、最小44px点击与48px主按钮。ui-field根据继承字号计算输入高度，2倍字时不固定在48px；标签及错误可以换行。新增accessibleLabel/errorId，输入的可读名称包含标签、必填及一份错误内容，装饰/重复视觉标签不重复暴露。禁用输入不派发修改事件。具体读屏宣告时机仍需iOS/Android验证。

ui-confirm复用现有ui-sheet的键盘、安全区、整面板溢出滚动及returnFocusId/restorefocus机制，不再维护第二套固定50vh确认框。底部操作可换行，不设固定高度。关闭恢复焦点仅是宿主输入框的显式属性事件；没有虚构原生按钮/读屏强制焦点API。迟到的旧面板测量不会覆盖新标题或新开启面板的尺寸。

微信语义依据[官方无障碍示例](https://github.com/wechat-miniprogram/miniprogram-demo/blob/master/miniprogram/packageComponent/pages/obstacle-free/aria-component/aria-component.wxml)中的aria-role/aria-label及[官方WeUI半屏对话框](https://github.com/wechat-miniprogram/weui-miniprogram/blob/master/src/components/half-screen-dialog/half-screen-dialog.wxml)中的dialog/aria-modal。未假定浏览器的aria-describedby或任意focus接口在微信里完整等效。

按压/行反馈/面板继续使用100/180/200ms；样式生成器新增严格motion.*.ms绑定，杜绝把时长当尺寸。共享按钮、行和面板读取现有减少动态效果设置时为0，加载图形静止但保留状态文字；旧兼容聊天不再闪动。没有新增装饰性连续动效。

验证：共享组件/键盘极端高度/字号/语义/样式隔离/图标与面板恢复的Node定向回归通过，模板结构及迁移清单Python2项通过；生成样式只改变相关控件和兼容聊天。当前未观察到运行中的微信开发者工具进程，未采集本版本320/390/430原生几何或真实键盘/读屏；归T23补证，不能据单元断言宣称设备验收通过。
