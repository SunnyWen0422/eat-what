# 📱 底部导航栏图标说明

## ⚠️ 重要提醒

**微信小程序的tabBar图标必须是本地文件，不能使用网络URL！**

## 📋 需要的图标文件

如启用原生 TabBar 图标，请在此目录中添加以下 10 个 PNG 文件（五个一级入口各一组）：

### 选菜图标 (81×81px)
- `home.png` - 未选中状态的选菜图标
- `home-active.png` - 选中状态的选菜图标

### 日历图标 (81×81px)
- `calendar.png` - 未选中状态的日历图标
- `calendar-active.png` - 选中状态的日历图标

### 我的图标 (81×81px)
- `profile.png` - 未选中状态的我的图标
- `profile-active.png` - 选中状态的我的图标

### 定制图标 (81×81px)
- `customize.png` - 未选中状态的定制图标
- `customize-active.png` - 选中状态的定制图标

### 助手图标 (81×81px)
- `assistant.png` - 未选中状态的助手图标
- `assistant-active.png` - 选中状态的助手图标

## 🎨 设计规范

### 尺寸要求
- **标准尺寸**：81×81px (推荐)
- **最小尺寸**：60×60px
- **最大尺寸**：120×120px

### 格式要求
- **文件格式**：PNG格式
- **颜色模式**：支持透明背景 (32位PNG)
- **文件大小**：建议不超过50KB

### 视觉设计
- **选菜图标**：房子、家、餐桌等代表"家"的元素
- **定制图标**：编辑、调色板或菜谱清单
- **助手图标**：对话气泡或星标，但不要使用夸张的机器人形象
- **日历图标**：日历、日期、时间等元素
- **未选中状态**：灰色调 (#7A7E83)
- **选中状态**：绿色调 (#3cc51f)

## 🛠️ 如何制作图标

### 方法1：在线制作工具
1. 访问 [Canva](https://www.canva.com/) 或 [Figma](https://www.figma.com/)
2. 创建 81×81px 的画布
3. 设计图标（保持简洁明了）
4. 导出为 PNG 格式（透明背景）

### 方法2：图标库下载
1. 访问 [Iconfont](https://www.iconfont.cn/) 或 [Flaticon](https://www.flaticon.com/)
2. 搜索相关图标关键词：
- 选菜：home, house, table, eat, food
- 定制：edit, customize, recipe
- 助手：chat, assistant, sparkle
   - 日历：calendar, date, time, schedule
3. 下载 64×64 或 128×128 的PNG图标
4. 使用图片编辑软件调整为 81×81px

### 方法3：使用现成图标
从微信小程序官方文档示例中获取标准图标，然后根据需要修改颜色。

## 📝 图标制作步骤

### 步骤1：准备设计
```bash
# 使用在线工具或本地软件创建图标
# 或者下载现成图标进行修改
```

### 步骤2：调整尺寸
```bash
# 使用图片编辑软件调整为81×81px
# 推荐工具：Photoshop, GIMP, 或在线工具
```

### 步骤3：优化文件
```bash
# 确保PNG格式，支持透明背景
# 文件大小控制在50KB以内
```

### 步骤4：命名文件
- `home.png` - 选菜未选中
- `home-active.png` - 选菜选中
- `customize.png` - 定制未选中
- `customize-active.png` - 定制选中
- `assistant.png` - 助手未选中
- `assistant-active.png` - 助手选中
- `calendar.png` - 日历未选中
- `calendar-active.png` - 日历选中
- `profile.png` - 我的未选中
- `profile-active.png` - 我的选中
- `calendar-active.png` - 日历选中

## ⚙️ 启用底部导航栏

### 步骤1：添加图标文件
将 10 个 PNG 文件放入此 `images/` 目录中

### 步骤2：修改 app.json
在 `app.json` 中添加 tabBar 配置：

```json
{
  "tabBar": {
    "color": "#7A7E83",
    "selectedColor": "#3cc51f",
    "borderStyle": "black",
    "backgroundColor": "#ffffff",
    "list": [
      {
        "pagePath": "pages/index/index",
        "iconPath": "images/home.png",
        "selectedIconPath": "images/home-active.png",
        "text": "首页"
      },
      {
        "pagePath": "pages/calendar/calendar",
        "iconPath": "images/calendar.png",
        "selectedIconPath": "images/calendar-active.png",
        "text": "日历"
      }
    ]
  }
}
```

### 步骤3：验证配置
1. 重启微信开发者工具
2. 清除缓存 (工具 → 清除缓存 → 全部清除)
3. 重新编译运行
4. 检查底部是否显示导航栏

