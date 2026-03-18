# Docker 与生产部署指南 (Production Deployment Guide)

Extend Global (EG) 平台采用全栈容器化部署。本文档为运维人员（DevOps）提供了从零开始在生产环境（通常为 Ubuntu 22.04 / 24.04）部署整个系统的标准操作程序（SOP）。

## 1. 基础设施准备

在开始部署之前，请确保生产服务器满足以下最低配置要求：

### 1.1 硬件要求
* **CPU**: 4 Core (推荐 8 Core，用于处理高并发的发票 PDF 生成)
* **RAM**: 8 GB (推荐 16 GB)
* **Disk**: 100 GB SSD (需为 SQLite 数据库文件和生成的 PDF 留出充足空间)
* **OS**: Ubuntu 22.04 LTS 或更高版本

### 1.2 预装软件
服务器必须预装以下软件：
* **Docker Engine** (v24.0+)
* **Docker Compose** (v2.20+)
* **Nginx** (作为前置反向代理，处理 SSL 和子域名路由)
* **Git** (用于拉取代码)

## 2. 核心部署文件结构

部署主要依赖于项目根目录下的两个核心文件：
1. `docker-compose.prod.yml`: 定义了生产环境的服务拓扑。
2. `nginx/conf.d/default.conf`: Nginx 的路由配置文件。

### 2.1 容器拓扑
生产环境通常只启动一个核心容器：
* **`extend-global-app`**: 这是一个将构建好的前端静态文件与 Node.js 后端服务打包在一起的单体容器。前端文件由后端的 Express/Fastify 静态托管。

*(注意：数据库使用的是本地文件 SQLite，因此不需要单独启动 PostgreSQL/MySQL 容器，极大地简化了部署拓扑。)*

## 3. 环境变量配置 (.env)

在项目根目录下创建一个 `.env` 文件，这是系统启动的生命线。必须配置以下核心变量：

```env
# --- 核心基础配置 ---
NODE_ENV=production
PORT=5000

# --- 数据库配置 ---
# 生产环境必须使用绝对路径，并确保该路径被映射到宿主机，防止容器重启丢失数据
DATABASE_URL=sqlite:///data/production.db

# --- 认证与安全 ---
# 必须生成一个 64 位的强随机字符串
JWT_SECRET=your_super_secret_jwt_key_here_must_be_very_long

# --- 第三方 API 密钥 ---
# 汇率服务 (例如 ExchangeRate-API)
EXCHANGE_RATE_API_KEY=your_api_key_here
# 邮件服务 (例如 SendGrid / AWS SES)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_smtp_password
# 存储服务 (用于存放用户上传的护照、报销凭证)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET=eg-production-assets
AWS_REGION=ap-southeast-1

# --- 域名配置 ---
# 用于生成白标链接和回调地址
BASE_DOMAIN=extendglobal.ai
```

## 4. 首次部署流程 (Initial Deployment)

### 4.1 拉取代码与构建镜像
登录生产服务器，执行以下命令：

```bash
# 1. 克隆代码库
git clone git@github.com:your-org/extend-global-platform.git /opt/extend-global
cd /opt/extend-global

# 2. 准备数据目录（关键步骤：确保 SQLite 数据持久化）
sudo mkdir -p /opt/extend-global/data
sudo chown -R 1000:1000 /opt/extend-global/data  # 确保容器内的 node 用户有写权限

# 3. 复制并编辑环境变量
cp .env.example .env
nano .env  # 填入真实的生产配置

# 4. 构建生产镜像
docker compose -f docker-compose.prod.yml build
```

### 4.2 数据库迁移 (Database Migration)
由于是首次部署，必须初始化 SQLite 数据库的表结构。

```bash
# 启动一个临时的容器来执行迁移命令
docker compose -f docker-compose.prod.yml run --rm app npm run db:push
```

### 4.3 启动服务
```bash
# 后台启动服务
docker compose -f docker-compose.prod.yml up -d

# 检查运行状态
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
```

## 5. Nginx 与白标域名配置

Extend Global 的核心卖点是 CP 白标机制。这意味着系统必须能够动态处理无限个子域名的请求（如 `acme.extendglobal.ai`, `hr.partner-domain.com`）。

### 5.1 泛域名解析 (Wildcard DNS)
在您的 DNS 提供商（如 Cloudflare, Route53）处，配置一条泛域名 A 记录：
* `*.extendglobal.ai` -> 指向生产服务器的公网 IP。

### 5.2 Nginx 反向代理配置
在 `/etc/nginx/sites-available/extend-global` 中配置如下内容：

```nginx
server {
    listen 80;
    # 捕获所有子域名
    server_name *.extendglobal.ai extendglobal.ai;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 允许上传大文件（如 PDF 账单、护照）
        client_max_body_size 50M;
    }
}
```

### 5.3 SSL 证书自动签发
使用 Certbot 为泛域名申请免费的 Let's Encrypt 证书。由于是泛域名，必须使用 DNS 验证方式（DNS Challenge）。

```bash
# 安装 certbot 及其 dns 插件 (以 Cloudflare 为例)
sudo apt install certbot python3-certbot-dns-cloudflare

# 申请泛域名证书
sudo certbot --nginx -d "extendglobal.ai" -d "*.extendglobal.ai" \
  --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/certbot/cloudflare.ini
```

## 6. 日常运维与更新 (CI/CD)

当开发团队合并了新的 PR 到 `main` 分支后，执行以下命令进行平滑更新（Zero-downtime 部署视架构而定，单机部署通常会有短暂的重启时间）：

```bash
cd /opt/extend-global
git pull origin main

# 重新构建镜像
docker compose -f docker-compose.prod.yml build

# 执行数据库迁移（如果 schema 有变更）
docker compose -f docker-compose.prod.yml run --rm app npm run db:push

# 重启容器
docker compose -f docker-compose.prod.yml up -d
```

## 7. 数据备份策略 (Backup Strategy)

由于系统使用 SQLite，数据备份变得极其简单，但绝对不能忽视。必须配置 Cron Job 每天定时备份 `production.db` 文件。

```bash
# 创建备份脚本 /opt/extend-global/backup.sh
#!/bin/bash
BACKUP_DIR="/opt/backups"
DB_FILE="/opt/extend-global/data/production.db"
DATE=$(date +%Y%m%d_%H%M%S)

# 使用 sqlite3 的内置备份命令，确保备份时数据一致（避免锁库冲突）
sqlite3 $DB_FILE ".backup '$BACKUP_DIR/db_backup_$DATE.db'"

# 压缩并上传至 AWS S3 (强烈建议)
gzip $BACKUP_DIR/db_backup_$DATE.db
aws s3 cp $BACKUP_DIR/db_backup_$DATE.db.gz s3://eg-database-backups/

# 清理 30 天前的旧备份
find $BACKUP_DIR -name "db_backup_*.db.gz" -mtime +30 -delete
```

将其加入 `crontab -e`：
`0 2 * * * /bin/bash /opt/extend-global/backup.sh` (每天凌晨 2 点执行)

通过严格遵循上述部署与备份指南，运维团队可以确保 Extend Global 平台在生产环境中的高可用性与数据安全性。
