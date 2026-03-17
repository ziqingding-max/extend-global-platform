# Extend Global (EG) 系统保姆级部署上线教程

这份教程专门为您编写。只要按照以下步骤“复制、粘贴、回车”，即可完成整个系统的上线。

## 准备工作：您需要拥有的东西

在开始之前，请确保您已经准备好以下 3 样东西：
1. **一台云服务器 (VPS)**：比如阿里云、AWS 或腾讯云的服务器，推荐配置 4核 8G 内存，系统为 Ubuntu 22.04。
2. **一个域名**：您已经拥有 `extendglobal.ai` 域名。
3. **域名解析权限**：能够登录您的域名提供商（如阿里云/GoDaddy）后台添加解析记录。

---

## 第一步：配置域名解析 (DNS)

我们需要将域名指向您的服务器 IP 地址。
请登录您的域名提供商后台，找到 `extendglobal.ai` 的 DNS 解析设置页面，添加以下 **3 条 A 记录**：

| 记录类型 | 主机记录 (Name) | 记录值 (Value) | 说明 |
|---|---|---|---|
| A | `@` | 您的服务器 IP | 主域名（如需要） |
| A | `*` | 您的服务器 IP | **关键！** 通配符，用于支持所有 CP 子域名 (如 acme.extendglobal.ai) |
| A | `www` | 您的服务器 IP | www 前缀 |

*注：添加完成后，通常需要 5-10 分钟生效。*

---

## 第二步：登录服务器并安装基础软件

使用 SSH 工具（如 Terminal, PuTTY 或 Xshell）登录到您的服务器：
```bash
ssh root@您的服务器IP
```

登录成功后，依次复制并运行以下三段命令（每段复制后按回车）：

**1. 更新系统并安装 Git：**
```bash
apt update && apt upgrade -y
apt install -y git curl wget
```

**2. 安装 Docker（运行环境）：**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

**3. 安装 Docker Compose（编排工具）：**
```bash
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

---

## 第三步：下载代码

在服务器上运行以下命令，将最新的代码拉取下来：

```bash
cd /opt
git clone https://github.com/ziqingding-max/extend-global-platform.git
cd extendglobal-platform
```
*(如果您的代码库是私有的，系统会提示您输入 GitHub 用户名和密码/Token)*

---

## 第四步：配置环境变量（密码和密钥）

系统需要知道数据库密码、您的 OSS 密钥等信息。

**1. 复制配置文件模板：**
```bash
cp .env.example .env.production
```

**2. 编辑配置文件：**
```bash
nano .env.production
```
*(这会打开一个文本编辑器)*

在打开的文件中，找到并修改以下关键信息（使用键盘上下左右键移动光标）：

- `DOMAIN=extendglobal.ai` (确认域名正确)
- `CP_PORTAL_URL=https://{subdomain}.extendglobal.ai` (确认正确)
- `DB_PASSWORD=这里写一个复杂的数据库密码`
- `JWT_SECRET=这里随便乱敲一串长英文字母作为加密密钥`
- **OSS 配置**（填入您之前提供的密钥）：
  - `OSS_ACCESS_KEY_ID=LTAI5tDnQSzg7mj7CCF21n1L`
  - `OSS_ACCESS_KEY_SECRET=Hq0GrL6U6LwtOWiXXDv0AxZCbPT6Tl`
  - `OSS_BUCKET=您的bucket名称`
  - `OSS_REGION=您的oss地域`

修改完成后，按 `Ctrl + O`（保存），按 `Enter`（确认文件名），然后按 `Ctrl + X`（退出）。

---

## 第五步：申请 SSL 安全证书（让网站显示 HTTPS 绿锁）

我们已经为您写好了自动化脚本，只需运行即可：

```bash
chmod +x enable-ssl.sh
./enable-ssl.sh --wildcard
```
*注意：脚本运行期间可能会要求您输入邮箱地址，并输入 `Y` 同意服务条款。这个过程会向 Let's Encrypt 申请通配符证书（`*.extendglobal.ai`），确保所有 CP 子域名都是安全的。*

---

## 第六步：一键启动系统！

激动人心的时刻到了，运行以下命令启动整个系统：

```bash
docker-compose -f docker-compose.prod.yml up -d
```

系统会自动下载运行环境、安装依赖、执行数据库建表（Migration），然后启动前端和后端。这个过程大约需要 3-5 分钟。

**如何检查是否启动成功？**
运行这个命令查看运行状态：
```bash
docker-compose -f docker-compose.prod.yml ps
```
如果您看到所有的状态都是 `Up`，恭喜您，系统上线成功！

---

## 第七步：验证上线结果

现在，您可以打开浏览器，访问以下地址测试：
1. **Admin 管理后台**：`https://admin.extendglobal.ai`
2. **Client 客户门户**：`https://portal.extendglobal.ai`
3. **Worker 员工门户**：`https://worker.extendglobal.ai`

**测试 CP 白标功能**：
在 Admin 后台创建一个 Channel Partner，假设子域名设置为 `acme`。
然后在浏览器访问 `https://acme.extendglobal.ai/portal`，您应该能看到系统自动切换成了该 CP 的 Logo 和颜色！

---

## 常见问题自救指南

**1. 网站打不开？**
- 检查服务器的安全组/防火墙设置，确保开放了 `80` (HTTP) 和 `443` (HTTPS) 端口。

**2. 如何查看报错日志？**
```bash
docker logs eg_app --tail 100
```

**3. 代码有更新，如何重新部署？**
```bash
cd /opt/extendglobal-platform
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```
