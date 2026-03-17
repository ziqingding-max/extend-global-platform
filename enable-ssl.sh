#!/bin/bash
# =============================================================================
# Extend Global (EG) — 启用 SSL/HTTPS 脚本（通配符子域名版）
# =============================================================================
# 使用前提：
#   1. 域名已解析到服务器 IP（包括 *.extendglobal.ai 通配符 A 记录）
#   2. HTTP 版本已正常运行（docker compose up -d）
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 域名配置
ADMIN_DOMAIN="admin.extendglobal.ai"
PORTAL_DOMAIN="app.extendglobal.ai"
WORKER_DOMAIN="worker.extendglobal.ai"
WILDCARD_DOMAIN="*.extendglobal.ai"
BASE_DOMAIN="extendglobal.ai"

# 证书邮箱
CERT_EMAIL="${CERT_EMAIL:-admin@extendglobal.ai}"

# 项目目录
PROJECT_DIR="${PROJECT_DIR:-/opt/eg-platform}"
cd ${PROJECT_DIR}

echo ""
info "=== Extend Global SSL 配置脚本 ==="
info "管理后台: ${ADMIN_DOMAIN}"
info "客户门户: ${PORTAL_DOMAIN}"
info "员工门户: ${WORKER_DOMAIN}"
info "CP 白标:  ${WILDCARD_DOMAIN}"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    error "Docker 未安装"
fi

# 创建 certbot 目录
mkdir -p certbot/conf certbot/www

# ─── SSL 证书申请方式选择 ────────────────────────────────────────────────
echo "请选择 SSL 证书申请方式："
echo "  1) 仅为固定子域名申请证书（admin/app/worker）— HTTP 验证，全自动"
echo "  2) 申请通配符证书（*.extendglobal.ai）— DNS 验证，需手动添加 TXT 记录"
echo ""
read -p "请输入选项 (1/2): " SSL_MODE

WILDCARD_CERT_DIR=""

if [ "$SSL_MODE" = "2" ]; then
    # 通配符证书 — DNS 验证
    info "申请通配符证书（需要手动添加 DNS TXT 记录）..."
    docker run --rm -it \
        -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
        -v "$(pwd)/certbot/www:/var/www/certbot" \
        certbot/certbot certonly \
        --manual \
        --preferred-challenges dns \
        -d "${BASE_DOMAIN}" \
        -d "${WILDCARD_DOMAIN}" \
        --email "${CERT_EMAIL}" \
        --agree-tos \
        --no-eff-email

    ADMIN_CERT_DIR="${BASE_DOMAIN}"
    PORTAL_CERT_DIR="${BASE_DOMAIN}"
    WORKER_CERT_DIR="${BASE_DOMAIN}"
    WILDCARD_CERT_DIR="${BASE_DOMAIN}"
else
    # 固定子域名证书 — HTTP 验证
    info "为固定子域名申请证书..."

    # 停止 nginx 以释放 80 端口
    docker compose -f docker-compose.prod.yml stop nginx 2>/dev/null || true

    docker run --rm \
        -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
        -v "$(pwd)/certbot/www:/var/www/certbot" \
        -p 80:80 \
        certbot/certbot certonly \
        --standalone \
        -d "${ADMIN_DOMAIN}" \
        -d "${PORTAL_DOMAIN}" \
        -d "${WORKER_DOMAIN}" \
        --email "${CERT_EMAIL}" \
        --agree-tos \
        --no-eff-email

    ADMIN_CERT_DIR="${ADMIN_DOMAIN}"
    PORTAL_CERT_DIR="${ADMIN_DOMAIN}"
    WORKER_CERT_DIR="${ADMIN_DOMAIN}"
fi

# ─── 生成 HTTPS Nginx 配置 ──────────────────────────────────────────────
info "正在生成 HTTPS Nginx 配置..."

cat > nginx/conf.d/eg-saas.conf << EOF
# =============================================================================
# Extend Global (EG) — Nginx HTTPS 配置（通配符子域名版）
# =============================================================================

upstream eg_app {
    server app:3000;
    keepalive 32;
}

# ─── HTTP → HTTPS 重定向 ─────────────────────────────────────────────────
server {
    listen 80;
    server_name ${ADMIN_DOMAIN} ${PORTAL_DOMAIN} ${WORKER_DOMAIN} *.extendglobal.ai;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# ─── 默认服务器（IP 直接访问）────────────────────────────────────────────
server {
    listen 80 default_server;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://${ADMIN_DOMAIN}\$request_uri;
    }
}

# ─── 管理后台 HTTPS ──────────────────────────────────────────────────────
server {
    listen 443 ssl;
    http2 on;
    server_name ${ADMIN_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${ADMIN_CERT_DIR}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${ADMIN_CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    client_max_body_size 50m;

    location /api/ {
        proxy_pass http://eg_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://eg_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://eg_app;
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# ─── 客户门户 HTTPS ──────────────────────────────────────────────────────
server {
    listen 443 ssl;
    http2 on;
    server_name ${PORTAL_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${PORTAL_CERT_DIR}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${PORTAL_CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    client_max_body_size 50m;

    location /api/ {
        proxy_pass http://eg_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://eg_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://eg_app;
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# ─── 员工门户 HTTPS ──────────────────────────────────────────────────────
server {
    listen 443 ssl;
    http2 on;
    server_name ${WORKER_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${WORKER_CERT_DIR}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${WORKER_CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    client_max_body_size 50m;

    location /api/ {
        proxy_pass http://eg_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://eg_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://eg_app;
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# ─── 如果有通配符证书，添加 CP 白标 HTTPS server 块 ─────────────────────
if [ -n "${WILDCARD_CERT_DIR}" ]; then
cat >> nginx/conf.d/eg-saas.conf << 'CPEOF'

# ─── CP 白标通配符 HTTPS ────────────────────────────────────────────────
# 匹配所有未被上面 server 块捕获的 *.extendglobal.ai 子域名
# 前端 SPA 通过 isCpDomain() 检测 CP 子域名后加载品牌
server {
    listen 443 ssl;
    http2 on;
    server_name *.extendglobal.ai;
CPEOF

cat >> nginx/conf.d/eg-saas.conf << EOF

    ssl_certificate /etc/letsencrypt/live/${WILDCARD_CERT_DIR}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${WILDCARD_CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    client_max_body_size 50m;

    location /api/ {
        proxy_pass http://eg_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://eg_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://eg_app;
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF
fi

# 重启 Nginx
info "重启 Nginx 使 HTTPS 配置生效..."
docker compose -f docker-compose.prod.yml restart nginx

ok "HTTPS 已启用！"
echo ""
echo "  管理后台：https://${ADMIN_DOMAIN}"
echo "  客户门户：https://${PORTAL_DOMAIN}"
echo "  员工门户：https://${WORKER_DOMAIN}"
if [ -n "${WILDCARD_CERT_DIR}" ]; then
echo "  CP 白标：  https://<cp-subdomain>.extendglobal.ai"
fi
echo ""
