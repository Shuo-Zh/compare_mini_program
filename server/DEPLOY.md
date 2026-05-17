# 部署指南 - 后端 API 部署到腾讯云

## 环境要求

- 腾讯云服务器（推荐 Ubuntu 20.04）
- Node.js 18+
- Nginx
- PM2（进程管理器）
- 域名已备案并解析到服务器

---

## 部署步骤

### 第一步：登录服务器

```bash
ssh root@你的服务器IP
```

### 第二步：安装必要软件

```bash
# 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2
sudo npm install -g pm2

# 安装 Nginx
sudo apt-get install -y nginx

# 安装 Certbot（用于 SSL 证书）
sudo apt-get install -y certbot python3-certbot-nginx
```

### 第三步：上传代码到服务器

**方法 A：使用 scp 上传**
```bash
# 在本地执行
scp -r /Users/surebest/WeChatProjects/miniprogram-3/server root@你的服务器IP:/opt/
```

**方法 B：使用 Git**
```bash
# 在服务器上执行
cd /opt
git clone 你的仓库地址
cd server
```

### 第四步：配置并启动服务

```bash
# 进入后端目录
cd /opt/server

# 安装依赖
npm install

# 配置环境变量
cp .env.production .env
nano .env  # 编辑配置

# 创建数据目录
mkdir -p data/evidence tmp/images

# 使用 PM2 启动
pm2 start src/index.js --name compare-api --env production

# 保存 PM2 进程列表
pm2 save

# 设置开机自启
pm2 startup
```

### 第五步：配置 Nginx 和 SSL

```bash
# 上传 Nginx 配置
sudo cp /opt/server/nginx.conf /etc/nginx/sites-available/qhzs.work
sudo ln -s /etc/nginx/sites-available/qhzs.work /etc/nginx/sites-enabled/

# 测试 Nginx 配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

### 第六步：申请 SSL 证书（Let's Encrypt 免费）

```bash
# 申请证书
sudo certbot --nginx -d qhzs.work

# 自动续期测试
sudo certbot renew --dry-run
```

### 第七步：开放防火墙端口

```bash
# 开放端口
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 22

# 启用防火墙
sudo ufw enable
```

### 第八步：测试服务

```bash
# 测试 API
curl https://qhzs.work/health

# 查看 PM2 日志
pm2 logs compare-api

# 重启服务
pm2 restart compare-api
```

---

## 常用命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs compare-api

# 重启服务
pm2 restart compare-api

# 停止服务
pm2 stop compare-api

# 重新加载服务
pm2 reload compare-api

# 监控资源使用
pm2 monit
```

---

## 故障排查

### 1. 服务无法启动
```bash
pm2 logs compare-api
# 查看错误日志
```

### 2. 端口被占用
```bash
lsof -i :3001
# 或
pm2 stop all
pm2 start compare-api
```

### 3. Nginx 无法启动
```bash
sudo nginx -t
# 查看配置错误
```

### 4. SSL 证书问题
```bash
sudo certbot certificates
sudo certbot renew
```

---

## 腾讯云安全组配置

在腾讯云控制台中，确保安全组开放以下端口：

| 端口 | 协议 | 说明 |
|------|------|------|
| 22   | TCP  | SSH |
| 80   | TCP  | HTTP |
| 443  | TCP  | HTTPS |

---

## 自动备份（可选）

创建备份脚本 `backup.sh`：

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/backups
mkdir -p $BACKUP_DIR

# 备份数据
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz /opt/server/data

# 删除 7 天前的备份
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete
```

添加到 crontab：
```bash
crontab -e
# 添加：0 2 * * * /opt/server/backup.sh
```
