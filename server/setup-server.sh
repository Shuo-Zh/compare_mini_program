#!/bin/bash

# 服务器初始化脚本 - 在新服务器上运行一次

set -e

echo "=========================================="
echo "  服务器初始化脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请使用 sudo 运行此脚本${NC}"
    exit 1
fi

echo -e "${YELLOW}[1/8] 更新系统...${NC}"
apt update && apt upgrade -y

echo -e "${YELLOW}[2/8] 安装基础软件...${NC}"
apt install -y curl wget vim unzip git software-properties-common

echo -e "${YELLOW}[3/8] 安装 Node.js 18...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

echo -e "${YELLOW}[4/8] 安装 PM2...${NC}"
npm install -g pm2

echo -e "${YELLOW}[5/8] 安装 Nginx...${NC}"
apt install -y nginx

echo -e "${YELLOW}[6/8] 安装 Certbot...${NC}"
apt install -y certbot python3-certbot-nginx

echo -e "${YELLOW}[7/8] 配置防火墙...${NC}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo -e "${YELLOW}[8/8] 创建应用目录...${NC}"
mkdir -p /opt/server

echo -e "${GREEN}✓ 服务器初始化完成！${NC}"
echo ""
echo "下一步："
echo "1. 上传代码到 /opt/server"
echo "2. 配置并启动服务"
echo ""
echo "查看 Node.js 版本："
node -v
echo ""
echo "查看 PM2 版本："
pm2 -v
