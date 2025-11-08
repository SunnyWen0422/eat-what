# 云服务器部署指南

## 🚀 您的服务器信息

```yaml
服务器名称: instance1761731222975R290
实例ID: i-ye7xyk2kg0xjd1vl0js8
公网IP: 115.190.206.149
私网IP: 192.168.74.177
域名: chishenme.icu
SSL证书ID: 21211380
```

---

## 📋 部署步骤总览

1. [连接服务器](#1-连接服务器)
2. [安装必要软件](#2-安装必要软件)
3. [部署数据库](#3-部署数据库)
4. [部署后端服务](#4-部署后端服务)
5. [配置Nginx](#5-配置nginx)
6. [配置SSL证书](#6-配置ssl证书)
7. [配置域名解析](#7-配置域名解析)
8. [配置小程序](#8-配置小程序)
9. [配置微信服务器域名](#9-配置微信服务器域名)

---

## 1. 连接服务器

### Windows用户（使用PowerShell或CMD）

```bash
ssh root@115.190.206.149
```

输入密码后登录。

### 或使用SSH工具
- PuTTY
- Xshell
- MobaXterm

**主机地址：** 115.190.206.149  
**端口：** 22  
**用户名：** root

---

## 2. 安装必要软件

### 2.1 更新系统

```bash
# CentOS/RHEL
sudo yum update -y

# 或 Ubuntu/Debian
sudo apt update && sudo apt upgrade -y
```

### 2.2 安装Java 8

```bash
# CentOS/RHEL
sudo yum install java-1.8.0-openjdk -y

# Ubuntu/Debian
sudo apt install openjdk-8-jdk -y

# 验证安装
java -version
```

### 2.3 安装MySQL 8

```bash
# CentOS/RHEL
sudo yum install mysql-server -y
sudo systemctl start mysqld
sudo systemctl enable mysqld

# Ubuntu/Debian
sudo apt install mysql-server -y
sudo systemctl start mysql
sudo systemctl enable mysql

# 获取临时密码（CentOS）
sudo grep 'temporary password' /var/log/mysqld.log

# 或直接修改密码
sudo mysql_secure_installation
```

**设置MySQL密码：** 建议使用强密码（如 `Sunny418@Cloud`）

### 2.4 安装Nginx

```bash
# CentOS/RHEL
sudo yum install nginx -y

# Ubuntu/Debian
sudo apt install nginx -y

# 启动Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 验证
curl http://localhost
```

---

## 3. 部署数据库

### 3.1 配置MySQL允许远程连接

```bash
# 登录MySQL
sudo mysql -u root -p

# 执行以下命令
```

```sql
-- 创建数据库
CREATE DATABASE food CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建用户（使用强密码）
CREATE USER 'eatwhat'@'localhost' IDENTIFIED BY 'Sunny418@Cloud';
CREATE USER 'eatwhat'@'%' IDENTIFIED BY 'Sunny418@Cloud';

-- 授权
GRANT ALL PRIVILEGES ON food.* TO 'eatwhat'@'localhost';
GRANT ALL PRIVILEGES ON food.* TO 'eatwhat'@'%';
FLUSH PRIVILEGES;

-- 退出
EXIT;
```

### 3.2 导入数据

**方式A：本地上传SQL文件**

```bash
# 在本地电脑上执行（上传SQL文件到服务器）
scp backend/init_database.sql root@115.190.206.149:/root/

# 在服务器上执行
mysql -u eatwhat -p food < /root/init_database.sql
```

**方式B：直接在服务器创建**

1. 复制 `backend/init_database.sql` 的内容
2. 在服务器上创建文件并粘贴：

```bash
nano /root/init_database.sql
# 粘贴内容，Ctrl+O保存，Ctrl+X退出

# 执行
mysql -u eatwhat -p food < /root/init_database.sql
```

### 3.3 验证数据

```bash
mysql -u eatwhat -p food

# 在MySQL中执行
SELECT COUNT(*) FROM food;
SELECT TYPE, COUNT(*) FROM food GROUP BY TYPE;
EXIT;
```

---

## 4. 部署后端服务

### 4.1 打包项目

**在本地电脑上执行：**

```bash
cd backend
mvn clean package -DskipTests
```

生成的文件：`target/eatwhat-backend-1.0.0.jar`

### 4.2 修改配置文件

**在打包前，修改 `backend/src/main/resources/application.yml`：**

```yaml
server:
  port: 8080

spring:
  datasource:
    # 使用云服务器配置
    url: jdbc:mysql://localhost:3306/food?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai
    username: eatwhat
    password: Sunny418@Cloud  # 使用新密码
    driver-class-name: com.mysql.cj.jdbc.Driver
```

重新打包后上传。

### 4.3 上传到服务器

```bash
# 在本地执行
scp target/eatwhat-backend-1.0.0.jar root@115.190.206.149:/root/
```

### 4.4 创建启动脚本

在服务器上创建启动脚本：

```bash
nano /root/start-eatwhat.sh
```

内容：

```bash
#!/bin/bash
cd /root
nohup java -jar eatwhat-backend-1.0.0.jar > eatwhat.log 2>&1 &
echo $! > eatwhat.pid
echo "后端服务已启动，PID: $(cat eatwhat.pid)"
```

赋予执行权限：

```bash
chmod +x /root/start-eatwhat.sh
```

### 4.5 创建停止脚本

```bash
nano /root/stop-eatwhat.sh
```

内容：

```bash
#!/bin/bash
if [ -f /root/eatwhat.pid ]; then
    PID=$(cat /root/eatwhat.pid)
    kill $PID
    rm /root/eatwhat.pid
    echo "后端服务已停止"
else
    echo "未找到运行的服务"
fi
```

赋予执行权限：

```bash
chmod +x /root/stop-eatwhat.sh
```

### 4.6 启动服务

```bash
/root/start-eatwhat.sh

# 查看日志
tail -f /root/eatwhat.log

# 测试
curl http://localhost:8080/api/dishes
```

### 4.7 配置开机自启

创建systemd服务：

```bash
sudo nano /etc/systemd/system/eatwhat.service
```

内容：

```ini
[Unit]
Description=EatWhat Backend Service
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStart=/usr/bin/java -jar /root/eatwhat-backend-1.0.0.jar
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable eatwhat
sudo systemctl start eatwhat

# 查看状态
sudo systemctl status eatwhat

# 查看日志
sudo journalctl -u eatwhat -f
```

---

## 5. 配置Nginx

### 5.1 创建Nginx配置文件

```bash
sudo nano /etc/nginx/conf.d/chishenme.conf
```

内容（先配置HTTP，后面添加HTTPS）：

```nginx
# HTTP配置（临时，用于申请证书）
server {
    listen 80;
    server_name chishenme.icu www.chishenme.icu;
    
    # 临时root目录，用于证书验证
    root /var/www/html;
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}
```

### 5.2 测试并重启Nginx

```bash
# 测试配置
sudo nginx -t

# 重启Nginx
sudo systemctl restart nginx

# 查看状态
sudo systemctl status nginx
```

---

## 6. 配置SSL证书

### 6.1 下载SSL证书

从云服务提供商下载您的SSL证书文件：
- 证书文件：`chishenme.icu.pem` 或 `chishenme.icu.crt`
- 私钥文件：`chishenme.icu.key`

### 6.2 上传证书到服务器

```bash
# 创建证书目录
sudo mkdir -p /etc/nginx/ssl

# 上传证书（在本地执行）
scp chishenme.icu.pem root@115.190.206.149:/etc/nginx/ssl/
scp chishenme.icu.key root@115.190.206.149:/etc/nginx/ssl/

# 设置权限
sudo chmod 600 /etc/nginx/ssl/chishenme.icu.key
sudo chmod 644 /etc/nginx/ssl/chishenme.icu.pem
```

### 6.3 更新Nginx配置（添加HTTPS）

```bash
sudo nano /etc/nginx/conf.d/chishenme.conf
```

完整内容：

```nginx
# HTTP - 重定向到HTTPS
server {
    listen 80;
    server_name chishenme.icu www.chishenme.icu;
    
    # 强制使用HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS - 主要配置
server {
    listen 443 ssl http2;
    server_name chishenme.icu www.chishenme.icu;
    
    # SSL证书配置
    ssl_certificate /etc/nginx/ssl/chishenme.icu.pem;
    ssl_certificate_key /etc/nginx/ssl/chishenme.icu.key;
    
    # SSL优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # 日志
    access_log /var/log/nginx/chishenme_access.log;
    error_log /var/log/nginx/chishenme_error.log;
    
    # API代理
    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS配置（如果后端没配置）
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, POST, PUT, DELETE, OPTIONS';
        add_header Access-Control-Allow-Headers 'Content-Type, Authorization';
        
        # 处理OPTIONS请求
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }
    
    # 静态文件（可选，如果有前端页面）
    location / {
        root /var/www/chishenme;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```

### 6.4 测试并重启

```bash
# 测试配置
sudo nginx -t

# 重启Nginx
sudo systemctl restart nginx

# 查看错误日志（如果有问题）
sudo tail -f /var/log/nginx/chishenme_error.log
```

---

## 7. 配置域名解析

### 7.1 添加DNS记录

在您的域名服务商（购买 chishenme.icu 的地方）添加以下DNS记录：

| 类型 | 主机记录 | 记录值 | TTL |
|------|----------|--------|-----|
| A | @ | 115.190.206.149 | 600 |
| A | www | 115.190.206.149 | 600 |

**说明：**
- `@` 代表根域名 chishenme.icu
- `www` 代表 www.chishenme.icu
- 记录值填写您的公网IP

### 7.2 验证DNS解析

等待5-10分钟后，在本地电脑测试：

```bash
# Windows PowerShell
nslookup chishenme.icu
nslookup www.chishenme.icu

# 或使用ping
ping chishenme.icu
```

应该返回 `115.190.206.149`

---

## 8. 配置小程序

### 8.1 更新API配置

修改 `utils/config.js`（您已经修改了部分）：

```javascript
// 是否使用后端API
const USE_BACKEND_API = true  // ✅ 已修改

// 生产环境API地址
const PROD_API_BASE_URL = 'https://chishenme.icu/api'  // 改为您的域名
```

### 8.2 测试API

在浏览器访问：

```
https://chishenme.icu/api/dishes
```

应该返回菜品的JSON数据。

---

## 9. 配置微信服务器域名

### 9.1 登录微信公众平台

1. 访问：https://mp.weixin.qq.com/
2. 登录小程序账号

### 9.2 配置服务器域名

1. 进入：**开发 → 开发管理 → 开发设置**
2. 找到：**服务器域名**
3. 点击：**修改**

添加以下域名：

**request合法域名：**
```
https://chishenme.icu
```

**注意事项：**
- 必须是 `https://` 开头
- 不要加端口号
- 不要加 `/api` 路径
- 域名必须已备案（如果是中国大陆服务器）

### 9.3 保存配置

点击保存，等待生效（通常立即生效）。

---

## 10. 测试验证

### 10.1 测试域名访问

```bash
# 测试HTTP（应该自动跳转HTTPS）
curl -I http://chishenme.icu

# 测试HTTPS
curl https://chishenme.icu/api/dishes
```

### 10.2 测试SSL证书

在浏览器访问：
```
https://chishenme.icu
```

点击地址栏的锁图标，查看证书信息。

### 10.3 测试小程序

1. 打开微信开发者工具
2. 取消勾选"不校验合法域名"
3. 编译运行小程序
4. 测试功能：
   - 查看菜品列表
   - 搜索菜品
   - 添加自定义菜品
   - 生成推荐

### 10.4 查看网络请求

在微信开发者工具的 Network 面板：
- 请求地址应为：`https://chishenme.icu/api/dishes`
- 状态码应为：200
- 有返回数据

---

## 🔒 安全配置

### 配置防火墙

```bash
# CentOS/RHEL - firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --reload

# Ubuntu/Debian - ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 配置MySQL安全

```bash
# 只允许本地连接
sudo nano /etc/my.cnf  # 或 /etc/mysql/mysql.conf.d/mysqld.cnf

# 添加或确认
[mysqld]
bind-address = 127.0.0.1
```

重启MySQL：
```bash
sudo systemctl restart mysqld  # 或 mysql
```

---

## 📊 监控和维护

### 查看后端日志

```bash
# 如果使用systemd
sudo journalctl -u eatwhat -f

# 如果使用nohup
tail -f /root/eatwhat.log
```

### 查看Nginx日志

```bash
# 访问日志
sudo tail -f /var/log/nginx/chishenme_access.log

# 错误日志
sudo tail -f /var/log/nginx/chishenme_error.log
```

### 查看系统资源

```bash
# CPU和内存
top

# 磁盘空间
df -h

# 网络连接
netstat -tuln
```

### 重启服务

```bash
# 重启后端
sudo systemctl restart eatwhat

# 重启Nginx
sudo systemctl restart nginx

# 重启MySQL
sudo systemctl restart mysqld  # 或 mysql
```

---

## 🔄 更新部署

当代码有更新时：

```bash
# 1. 本地打包
cd backend
mvn clean package -DskipTests

# 2. 上传到服务器
scp target/eatwhat-backend-1.0.0.jar root@115.190.206.149:/root/

# 3. 重启服务
ssh root@115.190.206.149
sudo systemctl restart eatwhat

# 4. 查看日志确认
sudo journalctl -u eatwhat -f
```

---

## ❗ 常见问题

### 1. 域名无法访问

**检查：**
- DNS是否生效（nslookup）
- 防火墙是否开放80/443端口
- Nginx是否启动
- 域名解析是否正确

### 2. SSL证书错误

**检查：**
- 证书文件路径是否正确
- 证书文件权限是否正确
- 证书是否过期
- 域名是否匹配

### 3. API返回404

**检查：**
- 后端服务是否启动
- Nginx代理配置是否正确
- 后端端口是否为8080
- 防火墙是否阻止

### 4. 小程序无法调用API

**检查：**
- 服务器域名是否配置
- 域名是否使用HTTPS
- SSL证书是否有效
- 微信开发者工具是否取消勾选"不校验域名"

---

## 📝 部署检查清单

- [ ] 服务器SSH连接成功
- [ ] Java 8 安装成功
- [ ] MySQL 8 安装成功
- [ ] Nginx 安装成功
- [ ] 数据库创建成功
- [ ] SQL脚本执行成功
- [ ] 后端jar包上传成功
- [ ] 后端服务启动成功
- [ ] Nginx配置正确
- [ ] SSL证书上传成功
- [ ] HTTPS访问成功
- [ ] DNS解析成功
- [ ] 域名访问成功
- [ ] API测试成功
- [ ] 微信服务器域名配置成功
- [ ] 小程序调用API成功
- [ ] 防火墙配置正确
- [ ] 开机自启配置成功

---

## 🎉 部署完成

全部完成后，您的架构如下：

```
用户手机
    ↓
微信小程序
    ↓ HTTPS
域名: chishenme.icu
    ↓
云服务器: 115.190.206.149
    ├── Nginx (443端口) - HTTPS/SSL
    │   └── 反向代理到后端
    ├── Spring Boot (8080端口) - 后端API
    │   └── 连接数据库
    └── MySQL (3306端口) - 数据存储
```

**恭喜！您的小程序已成功部署到生产环境！** 🚀

---

## 📞 技术支持

遇到问题请检查：
1. 服务器日志
2. Nginx日志
3. 微信开发者工具Console
4. 防火墙配置

祝您部署顺利！

