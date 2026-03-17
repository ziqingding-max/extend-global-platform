# 阿里云国内节点部署指南

## 🚀 快速开始

### 1. 购买ECS实例
选择推荐配置：
- **实例规格**: ecs.c6.large (2核4GB)
- **操作系统**: Ubuntu 22.04 LTS
- **系统盘**: 60GB SSD
- **地域**: 华北2(北京) 或 华东1(杭州)

### 2. 安全组配置
```bash
# 开放端口
22/tcp    # SSH
80/tcp    # HTTP
443/tcp   # HTTPS
3000/tcp  # 应用端口（可选，如使用Nginx反向代理）
```

### 3. 系统初始化
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要软件
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx mysql-client redis-tools

# 验证安装
node --version  # v22.x.x
npm --version
```

### 4. 应用部署
```bash
# 克隆代码
git clone your-repository-url.git
cd geaplatform_trae

# 安装依赖
npm install -g pnpm
pnpm install

# 配置环境变量
cp config/aliyun-domestic-config.env .env
# 编辑 .env 文件，填入你的实际配置

# 数据库迁移
pnpm db:push

# 构建应用
pnpm build

# 启动应用（使用PM2守护进程）
npm install -g pm2
pm2 start dist/index.js --name "gea-eor-app"
pm2 startup
pm2 save
```

### 5. Nginx配置
```nginx
# /etc/nginx/sites-available/gea-eor
server {
    listen 80;
    server_name your-domain.com;
    
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
    }
    
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# 启用配置
sudo ln -s /etc/nginx/sites-available/gea-eor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL证书（可选）
```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期（已内置）
```

### 7. 数据库配置（阿里云RDS）
```bash
# 连接RDS
mysql -h rm-xxxxxx.mysql.rds.aliyuncs.com -u username -p

# 创建数据库（如需要）
CREATE DATABASE gea_eor_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 授权（如需要）
GRANT ALL PRIVILEGES ON gea_eor_db.* TO 'username'@'%';
FLUSH PRIVILEGES;
```

### 8. OSS配置
```bash
# 安装阿里云CLI
curl -O https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz
tar -xzf aliyun-cli-linux-latest-amd64.tgz
sudo mv aliyun /usr/local/bin/

# 配置认证
aliyun configure
# 输入AccessKey ID和AccessKey Secret
```

### 9. 系统优化
```bash
# 配置SWAP（如内存较小）
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 添加到/etc/fstab
/swapfile none swap sw 0 0

# 优化内核参数
echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
echo "net.core.somaxconn=65535" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### 10. 监控和日志
```bash
# 安装监控工具
sudo apt install htop iotop nethogs

# 配置日志轮转
sudo tee /etc/logrotate.d/gea-eor << EOF
/var/log/gea-eor/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data www-data
}
EOF

# 创建日志目录
sudo mkdir -p /var/log/gea-eor
sudo chown www-data:www-data /var/log/gea-eor
```

## 🔧 故障排查

### 查看应用日志
```bash
pm2 logs gea-eor-app
pm2 monit  # 实时监控
```

### 查看系统日志
```bash
sudo journalctl -u nginx -f
sudo tail -f /var/log/nginx/error.log
```

### 数据库连接测试
```bash
mysql -h your-rds-endpoint -u username -p -e "SELECT 1"
```

### OSS连接测试
```bash
aliyun oss ls --bucket your-bucket-name
```

## 📊 性能监控

### 基础监控命令
```bash
# 系统资源
htop
iostat -x 1

# 网络连接
netstat -tuln
ss -tuln

# 磁盘使用
df -h
du -sh *

# 内存使用
free -h
vmstat 1
```

### 应用性能
```bash
# Node.js性能
node --inspect dist/index.js  # 开启调试模式

# 数据库性能
mysql -h rds-endpoint -u user -p -e "SHOW PROCESSLIST"
```

## 🚀 日常维护

### 备份策略
```bash
# 数据库备份
mysqldump -h rds-endpoint -u user -p gea_eor_db > backup-$(date +%Y%m%d).sql

# 上传到OSS
aliyun oss cp backup-$(date +%Y%m%d).sql oss://your-bucket/backups/

# 清理旧备份（保留7天）
find . -name "backup-*.sql" -mtime +7 -delete
```

### 应用更新
```bash
# 拉取最新代码
git pull origin main

# 安装依赖
pnpm install

# 重新构建
pnpm build

# 重启应用
pm2 restart gea-eor-app

# 验证状态
pm2 status
```

## 📞 技术支持

### 阿里云支持
- 控制台: https://ecs.console.aliyun.com
- 文档: https://help.aliyun.com/product/25365.html
- 工单: 控制台右上角"工单" → "提交工单"

### 常用链接
- ECS定价: https://www.aliyun.com/price/product#/ecs/detail
- RDS定价: https://www.aliyun.com/price/product#/rds/detail
- OSS定价: https://www.aliyun.com/price/product#/oss/detail