# 阿里云新加坡节点部署指南 (Deployment Guide)

本指南将帮助您将 GEA SaaS Admin 项目部署到阿里云新加坡节点（ECS）。我们将使用 Docker 和 Docker Compose 进行部署，这是最标准且易于维护的方式。

## 1. 准备工作

### 1.1 购买阿里云 ECS 实例
- **地域**: 新加坡 (Singapore)
- **操作系统**: 推荐 Ubuntu 22.04 LTS 或 Debian 11/12 (本指南基于 Ubuntu)
- **规格**: 建议至少 2 vCPU, 4GB RAM (Node.js 应用和构建过程需要一定内存)
- **公网 IP**: 确保分配了公网 IPv4 地址

### 1.2 配置安全组 (Security Group)
在 ECS 控制台的安全组规则中，开放以下端口：
- **22**: SSH 连接 (默认开放)
- **80**: HTTP (用于 Nginx 或直接访问)
- **443**: HTTPS (如果配置 SSL)
- **3000**: 应用端口 (如果直接访问，不经过 Nginx)
- **3306**: 数据库端口 (仅在需要远程连接数据库时开放，建议仅限特定 IP 访问)

## 2. 环境安装 (在 ECS 服务器上)

通过 SSH 连接到您的服务器：
```bash
ssh root@<您的服务器IP>
```

### 2.1 安装 Docker 和 Docker Compose
```bash
# 更新软件包索引
apt-get update

# 安装必要的证书和工具
apt-get install -y ca-certificates curl gnupg

# 添加 Docker 官方 GPG 密钥
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# 设置仓库
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Docker Engine
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 验证安装
docker compose version
```

## 3. 部署代码

### 3.1 上传代码到服务器
您可以使用 `scp` 或 `rsync` 将本地代码上传到服务器的 `/opt/gea-saas` 目录。

**在本地终端执行（不是服务器终端）：**
```bash
# 假设您在项目根目录
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' ./ root@<您的服务器IP>:/opt/gea-saas
```

### 3.2 配置环境变量
在服务器上创建 `.env` 文件：

```bash
cd /opt/gea-saas
cp .env.example .env
nano .env
```

**关键配置：**
- `JWT_SECRET`: 生成一个随机的长字符串。
- `DATABASE_URL`: 
  - 如果使用 Docker 内置 MySQL（推荐用于测试），设置为 `mysql://gea_user:gea_password@db:3306/gea_saas` (与 docker-compose.yml 中的配置一致)。
  - 如果使用阿里云 RDS MySQL（推荐用于生产），设置为 RDS 的连接地址。

### 3.3 启动服务

使用 Docker Compose 构建并启动服务：

```bash
cd /opt/gea-saas
docker compose up -d --build
```

- `--build`: 强制重新构建镜像。
- `-d`: 后台运行。

查看日志确保服务正常启动：
```bash
docker compose logs -f app
```

## 4. 数据库初始化

如果这是首次部署，数据库可能需要初始化结构。

### 方式 A: 本地运行迁移 (推荐)
如果您的开发环境可以连接到生产数据库（例如通过 SSH 隧道），您可以在本地运行：
```bash
# 在本地项目目录
pnpm db:push
```
注意：这需要 `.env` 中的 `DATABASE_URL` 指向生产数据库。

### 方式 B: 在容器内运行迁移
进入应用容器运行迁移命令：
```bash
docker compose exec app pnpm db:push
```
*注意：这要求容器内包含 `drizzle-kit`。我们的 Dockerfile 是生产构建，可能未包含 devDependencies。如果此命令失败，请使用方式 A 或在 Dockerfile 中临时包含 devDependencies。*

## 5. 配置域名和 HTTPS (可选但推荐)

为了安全和易用性，建议配置 Nginx 反向代理和 SSL 证书。

### 5.1 安装 Nginx
```bash
apt-get install -y nginx
```

### 5.2 配置 Nginx
创建配置文件 `/etc/nginx/sites-available/gea-saas`:

```nginx
server {
    listen 80;
    server_name your-domain.com; # 替换为您的域名

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置并重启 Nginx：
```bash
ln -s /etc/nginx/sites-available/gea-saas /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default # 移除默认配置
nginx -t # 测试配置
systemctl restart nginx
```

### 5.3 配置 SSL (HTTPS)
使用 Certbot 自动配置 Let's Encrypt 证书：
```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## 6. 维护与更新

### 更新代码
1. 在本地提交代码更改。
2. 重新上传代码到服务器 (rsync)。
3. 在服务器上重建并重启容器：
   ```bash
   cd /opt/gea-saas
   docker compose up -d --build
   ```

### 查看日志
```bash
docker compose logs -f --tail=100
```
