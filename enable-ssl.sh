#!/bin/bash
# =============================================================================
# GEA EOR SaaS — 启用 SSL/HTTPS 脚本（三子域名版）
# =============================================================================
# 使用前提：
#   1. 三个域名已解析到服务器 IP
#   2. 已成功申请 SSL 证书
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[✅ OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠️  WARN]${NC} $1"; }
error() { echo -e "${RED}[❌ ERROR]${NC} $1"; exit 1; }

# 获取域名
ADMIN_DOMAIN="${1:-admin.geahr.com}"
PORTAL_DOMAIN="${2:-app.geahr.com}"
WORKER_DOMAIN="${3:-worker.geahr.com}"

if [ -z "$1" ]; then
    read -p "请输入管理后台域名（默认 admin.geahr.com）: " input
    ADMIN_DOMAIN=${input:-admin.geahr.com}
    read -p "请输入客户门户域名（默认 app.geahr.com）: " input
    PORTAL_DOMAIN=${input:-app.geahr.com}
    read -p "请输入员工门户域名（默认 worker.geahr.com）: " input
    WORKER_DOMAIN=${input:-worker.geahr.com}
fi

echo ""
info "域名配置："
echo "  管理后台：${ADMIN_DOMAIN}"
echo "  客户门户：${PORTAL_DOMAIN}"
echo "  员工门户：${WORKER_DOMAIN}"
echo ""

PROJECT_DIR="/opt/geaplatform_trae"
cd ${PROJECT_DIR}

# 检查证书是否存在
CERT_DIR=""
for domain in "${ADMIN_DOMAIN}" "${PORTAL_DOMAIN}" "${WORKER_DOMAIN}"; do
    if [ -d "certbot/conf/live/${domain}" ]; then
        CERT_DIR="certbot/conf/live/${domain}"
        info "找到 ${domain} 的 SSL 证书"
    fi
done

# 检查是否有通配符证书或合并证书
if [ -d "certbot/conf/live/${ADMIN_DOMAIN}" ]; then
    ADMIN_CERT_DIR="${ADMIN_DOMAIN}"
else
    error "未找到 ${ADMIN_DOMAIN} 的 SSL 证书，请先申请证书"
fi

# 门户和员工域名证书可能与管理后台在同一证书中（SAN 证书）
PORTAL_CERT_DIR="${PORTAL_DOMAIN}"
if [ ! -d "certbot/conf/live/${PORTAL_DOMAIN}" ]; then
    PORTAL_CERT_DIR="${ADMIN_DOMAIN}"
    warn "${PORTAL_DOMAIN} 无独立证书，尝试使用 ${ADMIN_DOMAIN} 的证书（SAN 证书）"
fi

WORKER_CERT_DIR="${WORKER_DOMAIN}"
if [ ! -d "certbot/conf/live/${WORKER_DOMAIN}" ]; then
    WORKER_CERT_DIR="${ADMIN_DOMAIN}"
    warn "${WORKER_DOMAIN} 无独立证书，尝试使用 ${ADMIN_DOMAIN} 的证书（SAN 证书）"
fi

info "正在生成 HTTPS Nginx 配置..."

cat > nginx/conf.d/gea-saas.conf << EOF
# =============================================================================
# GEA EOR SaaS — Nginx HTTPS 配置（三子域名版）
# =============================================================================

upstream gea_app {
    server app:3000;
    keepalive 32;
}

# ─── HTTP → HTTPS 重定向 ─────────────────────────────────────────────────
server {
    listen 80;
    server_name ${ADMIN_DOMAIN} ${PORTAL_DOMAIN} ${WORKER_DOMAIN};

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
        proxy_pass http://gea_app;
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
        proxy_pass http://gea_app;
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
        proxy_pass http://gea_app;
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
        proxy_pass http://gea_app;
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
        proxy_pass http://gea_app;
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
        proxy_pass http://gea_app;
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

    # Worker API 请求直接代理
    location /api/ {
        proxy_pass http://gea_app;
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

    # 所有请求直接代理到 Node.js（不做 rewrite）
    # 前端 SPA 通过 isWorkerDomain() 检测域名后自动路由到 Worker Portal
    location / {
        proxy_pass http://gea_app;
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
        proxy_pass http://gea_app;
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# 重启 Nginx
info "重启 Nginx 使 HTTPS 配置生效..."
docker compose -f docker-compose.prod.yml restart nginx

ok "HTTPS 已启用！"
echo ""
echo "  管理后台：https://${ADMIN_DOMAIN}"
echo "  客户门户：https://${PORTAL_DOMAIN}"
echo "  员工门户：https://${WORKER_DOMAIN}"
echo ""
