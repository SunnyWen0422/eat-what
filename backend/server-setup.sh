#!/bin/bash
# 服务器初始化脚本
# 用途：在新服务器上自动安装所有必要软件
# 使用方法：
#   1. 上传到服务器: scp server-setup.sh root@115.190.206.149:/root/
#   2. 添加执行权限: chmod +x /root/server-setup.sh
#   3. 运行: /root/server-setup.sh

set -e

echo "========================================="
echo "开始配置服务器环境"
echo "服务器: 115.190.206.149"
echo "域名: chishenme.icu"
echo "========================================="

# 检测操作系统
if [ -f /etc/redhat-release ]; then
    OS="centos"
    PKG_MANAGER="yum"
elif [ -f /etc/lsb-release ]; then
    OS="ubuntu"
    PKG_MANAGER="apt"
else
    echo "❌ 不支持的操作系统"
    exit 1
fi

echo "检测到操作系统: $OS"

# 1. 更新系统
echo ""
echo "1. 更新系统..."
if [ "$OS" = "centos" ]; then
    sudo yum update -y
else
    sudo apt update && sudo apt upgrade -y
fi

# 2. 安装Java 8
echo ""
echo "2. 安装Java 8..."
if [ "$OS" = "centos" ]; then
    sudo yum install java-1.8.0-openjdk -y
else
    sudo apt install openjdk-8-jdk -y
fi

java -version

# 3. 安装MySQL 8
echo ""
echo "3. 安装MySQL 8..."
if [ "$OS" = "centos" ]; then
    sudo yum install mysql-server -y
else
    sudo apt install mysql-server -y
fi

sudo systemctl start mysqld || sudo systemctl start mysql
sudo systemctl enable mysqld || sudo systemctl enable mysql

# 4. 安装Nginx
echo ""
echo "4. 安装Nginx..."
if [ "$OS" = "centos" ]; then
    sudo yum install nginx -y
else
    sudo apt install nginx -y
fi

sudo systemctl start nginx
sudo systemctl enable nginx

# 5. 配置防火墙
echo ""
echo "5. 配置防火墙..."
if [ "$OS" = "centos" ]; then
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --permanent --add-port=22/tcp
    sudo firewall-cmd --reload
else
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw --force enable
fi

# 6. 创建必要的目录
echo ""
echo "6. 创建目录结构..."
sudo mkdir -p /etc/nginx/ssl
sudo mkdir -p /var/www/chishenme
sudo mkdir -p /var/log/eatwhat

# 7. 配置MySQL
echo ""
echo "7. 配置MySQL..."
sudo mysql -e "CREATE DATABASE IF NOT EXISTS food CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER IF NOT EXISTS 'eatwhat'@'localhost' IDENTIFIED BY 'Sunny418@Cloud';"
sudo mysql -e "GRANT ALL PRIVILEGES ON food.* TO 'eatwhat'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"

# 8. 创建systemd服务文件
echo ""
echo "8. 创建systemd服务..."
sudo tee /etc/systemd/system/eatwhat.service > /dev/null <<EOF
[Unit]
Description=EatWhat Backend Service
After=network.target mysqld.service

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStart=/usr/bin/java -jar /root/eatwhat-backend-1.0.0.jar --spring.profiles.active=prod
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable eatwhat

# 9. 显示MySQL临时密码（如果有）
echo ""
echo "9. MySQL配置信息..."
if [ "$OS" = "centos" ]; then
    echo "MySQL临时密码（如果有）:"
    sudo grep 'temporary password' /var/log/mysqld.log 2>/dev/null || echo "未找到临时密码"
fi

echo ""
echo "========================================="
echo "✅ 服务器环境配置完成！"
echo "========================================="
echo ""
echo "下一步操作："
echo "1. 上传SQL脚本并执行:"
echo "   scp backend/init_database.sql root@115.190.206.149:/root/"
echo "   mysql -u eatwhat -pSunny418@Cloud food < /root/init_database.sql"
echo ""
echo "2. 上传后端jar包:"
echo "   scp target/eatwhat-backend-1.0.0.jar root@115.190.206.149:/root/"
echo ""
echo "3. 上传并配置SSL证书:"
echo "   scp chishenme.icu.pem root@115.190.206.149:/etc/nginx/ssl/"
echo "   scp chishenme.icu.key root@115.190.206.149:/etc/nginx/ssl/"
echo ""
echo "4. 上传Nginx配置:"
echo "   scp nginx-chishenme.conf root@115.190.206.149:/etc/nginx/conf.d/"
echo "   sudo nginx -t"
echo "   sudo systemctl restart nginx"
echo ""
echo "5. 启动后端服务:"
echo "   sudo systemctl start eatwhat"
echo "   sudo systemctl status eatwhat"
echo ""
echo "========================================="

