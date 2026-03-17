# 🚀 ECS部署操作清单

## 📋 部署前准备

### ✅ 1. 确认ECS基本信息
```bash
# 登录阿里云控制台获取以下信息
- 公网IP地址: xxx.xxx.xxx.xxx
- 实例ID: i-xxxxxxxxxxxxx
- 登录密码: ********
- 操作系统: Ubuntu 22.04 LTS
```

### ✅ 2. 本地环境准备
```bash
# 确保本地有SSH客户端
ssh -V  # Windows用户需要安装PuTTY或Git Bash
```

## 🎯 第一步：连接ECS服务器

### 📡 SSH连接
```bash
# 使用root用户连接（默认用户名）
ssh root@your-ecs-ip-address

# 首次连接会提示接受主机密钥，输入yes
# 然后输入您的ECS密码
```

### 🔐 安全设置（立即执行）
```bash
# 1. 更新系统（连接后立即执行）
sudo apt update && sudo apt upgrade -y

# 2. 设置时区
sudo timedatectl set-timezone Asia/Shanghai

# 3. 创建新用户（推荐，避免直接使用root）
adduser geauser
usermod -aG sudo geauser

# 4. 配置SSH密钥（更安全）
# 在本地生成SSH密钥对
ssh-keygen -t rsa -b 4096 -f ~/.ssh/gea_ecs_key

# 将公钥复制到服务器
ssh-copy-id -i ~/.ssh/gea_ecs_key.pub geauser@your-ecs-ip-address

# 5. 禁用root密码登录（重要安全设置）
sudo nano /etc/ssh/sshd_config
# 修改以下配置
PermitRootLogin no
PasswordAuthentication no

# 重启SSH服务
sudo systemctl restart sshd
```

## 🛠️ 第二步：系统环境配置

### 📦 安装必要软件
```bash
# 1. Node.js 22（GEA系统要求）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # 应显示 v22.x.x
npm --version

# 2. 安装pnpm包管理器
sudo npm install -g pnpm

# 3. 安装PM2进程管理器
sudo npm install -g pm2

# 4. 安装Nginx
sudo apt install -y nginx

# 5. 安装MySQL（本地数据库方案）
sudo apt install -y mysql-server mysql-client

# 6. 安装Git
sudo apt install -y git

# 7. 安装其他工具
sudo apt install -y curl wget vim htop
```

### 🔧 MySQL配置
```bash
# 1. MySQL安全配置
sudo mysql_secure_installation

# 2. 创建数据库
sudo mysql -e "CREATE DATABASE gea_eor_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. 创建数据库用户
sudo mysql -e "CREATE USER 'geauser'@'localhost' IDENTIFIED BY 'your-strong-password';"
sudo mysql -e "GRANT ALL PRIVILEGES ON gea_eor_db.* TO 'geauser'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"

# 4. 测试连接
mysql -u geauser -p gea_eor_db -e "SELECT 1;"
```

### 🌐 Nginx配置
```bash
# 1. 创建Nginx配置文件
sudo nano /etc/nginx/sites-available/gea-eor

# 粘贴以下配置
server {
    listen 80;
    server_name localhost your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 静态文件缓存（可选）
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# 2. 启用站点配置
sudo ln -s /etc/nginx/sites-available/gea-eor /etc/nginx/sites-enabled/

# 3. 测试Nginx配置
sudo nginx -t

# 4. 重启Nginx服务
sudo systemctl restart nginx

# 5. 设置开机自启
sudo systemctl enable nginx
```

## 🔥 第三步：应用部署

### 📥 代码获取
```bash
# 1. 切换到应用目录
cd /home/geauser

# 2. 克隆代码仓库（使用您的仓库地址）
git clone https://github.com/your-username/geaplatform_trae.git

# 3. 进入项目目录
cd geaplatform_trae

# 4. 切换到稳定分支（推荐）
git checkout main  # 或您要部署的分支
```

### 📦 依赖安装
```bash
# 1. 安装项目依赖
pnpm install

# 2. 检查是否有安装错误
# 如果有错误，根据提示解决
```

### ⚙️ 环境配置
```bash
# 1. 复制环境配置文件
cp config/aliyun-domestic-config.env .env

# 2. 编辑配置文件
nano .env

# 3. 修改以下关键配置
DATABASE_URL="mysql://geauser:your-password@localhost:3306/gea_eor_db"
JWT_SECRET="your-very-strong-jwt-secret-minimum-32-characters"
PORT=3000
NODE_ENV=production

# 4. 保存并退出
```

### 🏗️ 数据库迁移
```bash
# 1. 运行数据库迁移
pnpm db:push

# 2. 验证数据库表是否创建成功
mysql -u geauser -p gea_eor_db -e "SHOW TABLES;"
```

### 🔨 构建应用
```bash
# 1. 构建前端和后端
pnpm build

# 2. 检查构建结果
ls -la dist/  # 应该看到构建输出文件
```

### 🚀 启动应用
```bash
# 1. 使用PM2启动应用
pm2 start dist/index.js --name "gea-eor-app"

# 2. 查看应用状态
pm2 status

# 3. 查看应用日志
pm2 logs gea-eor-app

# 4. 设置开机自启
pm2 startup
pm2 save
```

## 🧪 第四步：功能验证

### 🌐 Web访问测试
```bash
# 1. 检查应用是否运行
curl http://localhost:3000/api/health  # 或您的健康检查端点

# 2. 通过Nginx访问（浏览器访问）
# 打开浏览器访问: http://your-ecs-ip-address

# 3. 检查Nginx错误日志
sudo tail -f /var/log/nginx/error.log
```

### 🔍 应用日志检查
```bash
# 1. 查看应用日志
pm2 logs gea-eor-app --lines 50

# 2. 实时查看日志
pm2 logs gea-eor-app --follow

# 3. 查看PM2监控面板
pm2 monit
```

### 📊 系统资源监控
```bash
# 1. 系统资源使用情况
htop

# 2. 磁盘空间
df -h

# 3. 内存使用
free -h

# 4. 网络连接
netstat -tuln | grep :3000
```

## 🛡️ 第五步：安全配置

### 🔥 防火墙配置
```bash
# 1. 启用UFW防火墙
sudo ufw enable

# 2. 配置防火墙规则
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow from your-office-ip to any port 3000  # 可选：限制应用端口访问

# 3. 查看防火墙状态
sudo ufw status verbose
```

### 🔑 SSL证书配置（可选）
```bash
# 1. 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 2. 获取SSL证书（需要域名）
sudo certbot --nginx -d your-domain.com

# 3. 自动续期测试
sudo certbot renew --dry-run
```

## 📋 部署验证清单

### ✅ 基础功能验证
```bash
□ SSH连接正常
□ 系统更新完成
□ Node.js 22安装成功
□ MySQL服务运行正常
□ Nginx服务运行正常
□ 应用端口(3000)可访问
□ 数据库连接正常
□ 应用日志无严重错误
```

### ✅ 性能验证
```bash
□ CPU使用率 < 80%
□ 内存使用率 < 80%
□ 磁盘空间 < 90%
□ 应用响应时间 < 2秒
□ 数据库查询正常
□ 静态文件加载正常
```

## 🚨 常见问题解决

### ❌ 连接被拒绝
```bash
# 检查应用是否运行
pm2 status

# 检查端口监听
netstat -tuln | grep :3000

# 检查防火墙
sudo ufw status
```

### ❌ Nginx 502错误
```bash
# 检查应用是否运行
pm2 logs gea-eor-app

# 检查Nginx配置
sudo nginx -t

# 重启Nginx
sudo systemctl restart nginx
```

### ❌ 数据库连接失败
```bash
# 检查MySQL服务
sudo systemctl status mysql

# 检查用户权限
mysql -u geauser -p gea_eor_db -e "SELECT 1;"

# 检查数据库配置
nano .env
```

### ❌ 内存不足
```bash
# 添加SWAP空间
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## 📞 紧急联系方式

### 🆘 紧急情况处理
```bash
# 应用无法启动时
pm2 restart gea-eor-app

# 系统资源耗尽时
sudo reboot  # 重启服务器（最后手段）

# 数据库崩溃时
sudo systemctl restart mysql

# 完全重置应用
pm2 delete gea-eor-app
pm2 start dist/index.js --name "gea-eor-app"
```

## 📊 下一步计划

### 🎯 短期目标（本周）
- [ ] 完成基础部署验证
- [ ] 测试核心功能模块
- [ ] 配置监控告警
- [ ] 创建备份策略

### 🎯 中期目标（本月）
- [ ] 优化系统性能
- [ ] 配置RDS数据库
- [ ] 集成OSS存储
- [ ] 添加SSL证书

### 🎯 长期目标
- [ ] 实现自动化部署
- [ ] 配置负载均衡
- [ ] 完善监控体系
- [ ] 优化成本结构

---

**💡 提示**: 每个步骤完成后在方框内打勾，确保不遗漏重要配置。如遇到问题，请查看对应步骤的故障排除部分。