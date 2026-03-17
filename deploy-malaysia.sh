#!/bin/bash
# =============================================================================
# GEA EOR SaaS Admin — 阿里云马来西亚节点一键部署脚本
# =============================================================================
# 使用方法：
#   1. 将此脚本上传到服务器
#   2. chmod +x deploy-malaysia.sh
#   3. sudo ./deploy-malaysia.sh
# =============================================================================

set -e

# ── 颜色定义 ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[✅ OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠️  WARN]${NC} $1"; }
error() { echo -e "${RED}[❌ ERROR]${NC} $1"; exit 1; }

# ── 检查 root 权限 ──────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    error "请使用 root 用户运行此脚本：sudo ./deploy-malaysia.sh"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     GEA EOR SaaS Admin — 生产环境部署脚本                  ║"
echo "║     目标节点：阿里云马来西亚（吉隆坡）ap-southeast-3       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── 第一步：系统更新 ────────────────────────────────────────────────────
info "第 1/7 步：更新系统软件包..."
apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg lsb-release git wget unzip htop
ok "系统更新完成"

# ── 第二步：安装 Docker ─────────────────────────────────────────────────
info "第 2/7 步：安装 Docker..."
if command -v docker &> /dev/null; then
    ok "Docker 已安装：$(docker --version)"
else
    # 添加 Docker 官方 GPG 密钥
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # 设置仓库
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    # 安装 Docker Engine
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # 启动 Docker
    systemctl start docker
    systemctl enable docker
    ok "Docker 安装完成：$(docker --version)"
fi

# 验证 Docker Compose
docker compose version || error "Docker Compose 安装失败"
ok "Docker Compose 可用"

# ── 第三步：创建项目目录 ────────────────────────────────────────────────
PROJECT_DIR="/opt/gea-saas"
info "第 3/7 步：创建项目目录 ${PROJECT_DIR}..."
mkdir -p ${PROJECT_DIR}
cd ${PROJECT_DIR}

# 克隆代码（如果尚未克隆）
if [ -d "${PROJECT_DIR}/geaplatform_trae/.git" ]; then
    info "代码仓库已存在，执行 git pull 更新..."
    cd ${PROJECT_DIR}/geaplatform_trae
    git pull origin main || warn "git pull 失败，使用现有代码继续"
else
    info "克隆代码仓库..."
    git clone https://github.com/ziqingding-max/geaplatform_trae.git
    cd ${PROJECT_DIR}/geaplatform_trae
fi
ok "代码准备完成"

# ── 第四步：配置环境变量 ────────────────────────────────────────────────
info "第 4/7 步：配置环境变量..."
if [ ! -f .env ]; then
    if [ -f .env.production ]; then
        cp .env.production .env
        warn "已从 .env.production 创建 .env 文件"
        warn "⚠️  请务必编辑 .env 文件，填写正确的配置信息！"
        echo ""
        echo "  必须修改的配置项："
        echo "  1. JWT_SECRET    — 运行: openssl rand -hex 32"
        echo "  2. ADMIN_BOOTSTRAP_EMAIL    — 您的管理员邮箱"
        echo "  3. ADMIN_BOOTSTRAP_PASSWORD — 设置强密码"
        echo ""
        
        # 自动生成 JWT_SECRET
        JWT_SECRET=$(openssl rand -hex 32)
        sed -i "s/JWT_SECRET=请替换为您生成的随机字符串/JWT_SECRET=${JWT_SECRET}/" .env
        ok "已自动生成 JWT_SECRET"
    else
        error "未找到 .env.production 模板文件，请先配置环境变量"
    fi
else
    ok ".env 文件已存在"
fi

# ── 第五步：创建必要目录 ────────────────────────────────────────────────
info "第 5/7 步：创建必要目录..."
mkdir -p nginx/conf.d
mkdir -p certbot/conf
mkdir -p certbot/www
mkdir -p data
ok "目录创建完成"

# ── 第六步：构建并启动服务 ──────────────────────────────────────────────
info "第 6/7 步：构建并启动 Docker 服务..."

# 使用生产环境 Dockerfile
if [ -f Dockerfile.prod ]; then
    # 临时替换 Dockerfile
    cp Dockerfile Dockerfile.backup
    cp Dockerfile.prod Dockerfile
fi

# 构建并启动
docker compose -f docker-compose.prod.yml up -d --build

# 恢复原始 Dockerfile
if [ -f Dockerfile.backup ]; then
    mv Dockerfile.backup Dockerfile
fi

ok "Docker 服务启动完成"

# ── 第七步：验证部署 ────────────────────────────────────────────────────
info "第 7/7 步：验证部署状态..."
echo ""

# 等待应用启动
info "等待应用启动（约 30 秒）..."
sleep 30

# 检查容器状态
echo "── 容器状态 ──"
docker compose -f docker-compose.prod.yml ps

echo ""

# 检查应用健康
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200"; then
    ok "应用服务运行正常 (HTTP 200)"
else
    warn "应用可能仍在启动中，请稍后检查"
fi

# 检查 Nginx
if curl -s -o /dev/null -w "%{http_code}" http://localhost/ | grep -q "200\|301\|302"; then
    ok "Nginx 反向代理运行正常"
else
    warn "Nginx 可能仍在启动中，请稍后检查"
fi

# ── 配置防火墙 ──────────────────────────────────────────────────────────
info "配置防火墙规则..."
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp   # SSH
    ufw allow 80/tcp   # HTTP
    ufw allow 443/tcp  # HTTPS
    ufw --force enable
    ok "防火墙配置完成"
else
    warn "UFW 未安装，请手动配置阿里云安全组规则"
fi

# ── 创建管理脚本 ────────────────────────────────────────────────────────
cat > /usr/local/bin/gea << 'SCRIPT'
#!/bin/bash
# GEA EOR SaaS 管理命令
PROJECT_DIR="/opt/gea-saas/geaplatform_trae"
cd ${PROJECT_DIR}

case "$1" in
    start)
        docker compose -f docker-compose.prod.yml up -d
        ;;
    stop)
        docker compose -f docker-compose.prod.yml down
        ;;
    restart)
        docker compose -f docker-compose.prod.yml restart
        ;;
    rebuild)
        docker compose -f docker-compose.prod.yml up -d --build
        ;;
    status)
        docker compose -f docker-compose.prod.yml ps
        ;;
    logs)
        docker compose -f docker-compose.prod.yml logs -f --tail=100 ${2:-app}
        ;;
    update)
        echo "正在更新代码..."
        git pull origin main
        echo "正在重新构建..."
        docker compose -f docker-compose.prod.yml up -d --build
        echo "更新完成！"
        ;;
    backup)
        BACKUP_DIR="/opt/gea-saas/backups"
        mkdir -p ${BACKUP_DIR}
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        docker cp gea-saas-app:/app/data/production.db ${BACKUP_DIR}/production_${TIMESTAMP}.db
        echo "数据库已备份到: ${BACKUP_DIR}/production_${TIMESTAMP}.db"
        ;;
    ssl)
        echo "正在申请 SSL 证书..."
        echo "请确保域名已解析到此服务器 IP"
        read -p "请输入域名（如 admin.extendglobal.ai）: " DOMAIN
        docker compose -f docker-compose.prod.yml run --rm certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN} --email admin@extendglobal.ai --agree-tos --no-eff-email
        echo "SSL 证书申请完成，请更新 Nginx 配置启用 HTTPS"
        ;;
    *)
        echo "GEA EOR SaaS 管理命令"
        echo ""
        echo "用法: gea <命令>"
        echo ""
        echo "可用命令:"
        echo "  start    — 启动所有服务"
        echo "  stop     — 停止所有服务"
        echo "  restart  — 重启所有服务"
        echo "  rebuild  — 重新构建并启动"
        echo "  status   — 查看服务状态"
        echo "  logs     — 查看日志 (可选参数: app/nginx)"
        echo "  update   — 拉取最新代码并重新部署"
        echo "  backup   — 备份数据库"
        echo "  ssl      — 申请 SSL 证书"
        ;;
esac
SCRIPT
chmod +x /usr/local/bin/gea

# ── 创建自动备份定时任务 ────────────────────────────────────────────────
info "配置每日自动备份..."
mkdir -p /opt/gea-saas/backups
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/gea backup >> /var/log/gea-backup.log 2>&1") | sort -u | crontab -
ok "每日凌晨 2 点自动备份数据库"

# ── 添加 SWAP（如果内存小于 4GB）────────────────────────────────────────
total_memory=$(free -m | awk 'NR==2{print $2}')
if [ $total_memory -lt 4096 ] && [ ! -f /swapfile ]; then
    info "内存小于 4GB，添加 2GB SWAP 空间..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "SWAP 空间已添加"
fi

# ── 部署完成 ────────────────────────────────────────────────────────────
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "无法获取")

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    🎉 部署完成！                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  📍 服务器 IP：${SERVER_IP}"
echo "  🌐 访问地址：http://${SERVER_IP}"
echo "  🔧 管理命令：gea <start|stop|restart|status|logs|update|backup|ssl>"
echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │ 📋 后续步骤（按顺序完成）：                            │"
echo "  │                                                         │"
echo "  │ 1. 编辑 .env 文件，填写管理员密码等配置                 │"
echo "  │    nano /opt/gea-saas/geaplatform_trae/.env             │"
echo "  │                                                         │"
echo "  │ 2. 重启服务使配置生效                                   │"
echo "  │    gea restart                                          │"
echo "  │                                                         │"
echo "  │ 3. 浏览器访问 http://${SERVER_IP} 测试                  │"
echo "  │                                                         │"
echo "  │ 4. 配置域名解析（将域名指向此 IP）                      │"
echo "  │                                                         │"
echo "  │ 5. 申请 SSL 证书                                        │"
echo "  │    gea ssl                                              │"
echo "  │                                                         │"
echo "  │ 6. 配置阿里云 OSS（可选，用于文件上传）                 │"
echo "  │                                                         │"
echo "  │ 7. 配置邮件服务（可选，用于通知邮件）                   │"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""
echo "  🆘 故障排除："
echo "     查看应用日志：gea logs"
echo "     查看 Nginx 日志：gea logs nginx"
echo "     查看容器状态：gea status"
echo "     重新构建：gea rebuild"
echo ""
