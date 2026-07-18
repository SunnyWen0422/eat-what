
#!/bin/bash
# 部署脚本
# 用途：自动打包并上传到服务器

set -e

# ===== 配置信息 =====
SERVER_IP="60.205.194.136"
SERVER_USER="root"
APP_NAME="eatwhat-backend-1.0.0.jar"
REMOTE_DIR="/root"

echo "========================================="
echo "开始部署吃什么小程序后端服务"
echo "========================================="

# 1. 清理旧的构建
echo "1. 清理旧的构建文件..."
mvn clean

# 2. 打包项目
echo "2. 打包项目（跳过测试）..."
mvn package -DskipTests

# 3. 检查jar包是否生成
if [ ! -f "target/${APP_NAME}" ]; then
    echo "❌ 错误：打包失败，未找到 target/${APP_NAME}"
    exit 1
fi

echo "✅ 打包成功: target/${APP_NAME}"

# 4. 上传到服务器
echo "3. 上传到服务器 ${SERVER_IP}..."
scp target/${APP_NAME} ${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/

# 5. 上传配置文件（如果有修改）
echo "4. 上传配置文件..."
scp src/main/resources/application-prod.yml ${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/

# 6. 远程重启服务
echo "5. 重启服务..."
ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
    echo "停止旧服务..."
    sudo systemctl stop eatwhat || true
    
    echo "启动新服务..."
    sudo systemctl start eatwhat
    
    echo "等待服务启动..."
    sleep 5
    
    echo "检查服务状态..."
    sudo systemctl status eatwhat --no-pager
    
    echo "查看最新日志..."
    sudo journalctl -u eatwhat -n 20 --no-pager
ENDSSH

# 7. 测试API
echo "6. 测试API接口..."
sleep 2
curl -s https://chishenme.icu/api/dishes | head -n 10

echo ""
echo "========================================="
echo "✅ 部署完成！"
echo "========================================="
echo "API地址: https://chishenme.icu/api"
echo "查看日志: ssh ${SERVER_USER}@${SERVER_IP} 'sudo journalctl -u eatwhat -f'"
echo "========================================="

