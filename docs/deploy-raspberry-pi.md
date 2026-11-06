# 树莓派部署指南

把 Word Island 跑在家里的树莓派上，在外面用手机 / 电脑随时背单词。

## 硬件与系统要求

- 树莓派 4 / 5（建议 4GB 内存以上；1GB 的老型号跑 `next build` 会内存不足，可改用「本地构建镜像」方式）
- 64 位 Raspberry Pi OS（`uname -m` 输出 `aarch64`）
- 建议 U 盘 / SSD 做系统盘或数据盘，Postgres 长期写 SD 卡有损耗

## 方案一：Docker Compose（推荐）

```bash
# 1. 安装 Docker（官方脚本支持 arm64）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 重新登录生效

# 2. 拿到代码
sudo apt install -y git
git clone https://github.com/weiyuzzz/word-island.git
cd word-island

# 3. 改密码：编辑 docker-compose.yml，把两处 change-me-please 换成强密码

# 4. 构建并启动（首次构建约 10 分钟，之后秒起）
docker compose up -d --build

# 5. 查看状态
docker compose logs -f app
curl http://localhost:3000/api/health   # {"ok":true} 即成功
```

首次访问任意页面会自动建表并播种 5 个内置词库 / 130 个单词，无需手动迁移。

> 内存不足 4GB 时在本地电脑构建 arm64 镜像再导入树莓派：
> ```bash
> docker buildx build --platform linux/arm64 -t word-island . --load
> docker save word-island | ssh <pi> docker load
> ```

## 方案二：不用 Docker，直接跑

```bash
# Node 22（arm64）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git

# PostgreSQL（树莓派源里是 15，本项目兼容）
sudo apt install -y postgresql
sudo -u postgres psql -c "create database app_db; alter user postgres password 'your-password';"

git clone https://github.com/weiyuzzz/word-island.git
cd word-island
echo "DATABASE_URL=postgresql://postgres:your-password@127.0.0.1:5432/app_db" > .env
npm ci
npm run build
npm start   # 生产模式；想开机自启用 pm2 或 systemd
```

开机自启（systemd）示例 `/etc/systemd/system/word-island.service`：

```ini
[Unit]
Description=Word Island
After=network.target postgresql.service

[Service]
WorkingDirectory=/home/pi/word-island
Environment=NODE_ENV=production
EnvironmentFile=/home/pi/word-island/.env
ExecStart=/usr/bin/npm start
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now word-island`

## 外网访问：三种方式

### Tailscale（推荐，免费、加密、不开端口）

项目**没有登录系统**，直接把端口暴露到公网等于任何人都能改你的数据。Tailscale 组一个只有你自己的虚拟局域网，手机装上就能访问：

```bash
# 树莓派上
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4   # 记下 100.x.x.x
```

手机 / 笔记本安装 Tailscale 并登录同一账号，浏览器访问 `http://100.x.x.x:3000` 即可。开启 MagicDNS 后还可以用主机名访问。

### Cloudflare Tunnel（有自己的域名时）

免费、自带 HTTPS，也不用在路由器开端口：

```bash
tailscale 方案之外的选择：
cloudflared tunnel --url http://localhost:3000
# 或绑定自己的域名：cloudflared tunnel create word-island && cloudflared tunnel route ...
```

### 路由器端口转发 + DDNS（不推荐）

除非加一层反向代理 + 鉴权，否则不建议：应用无登录，公网任何人扫到就能读写你的学习数据。

## 备份

词库页右上角有「导出进度」，会下载包含全部单词、学习记录与成就的 JSON；建议定期导出一份。Docker 方案也可以直接备份 `pgdata` 卷。

## 更新版本

```bash
cd word-island && git pull
docker compose up -d --build   # Docker 方案
# 或：git pull && npm ci && npm run build && sudo systemctl restart word-island
```
