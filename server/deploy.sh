#!/bin/bash

# 部署脚本 - 一键部署到腾讯云服务器

set -e

echo "=========================================="
echo "  后端 API 部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查命令
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}错误: $1 未安装${NC}"
        exit 1
    fi
}

echo -e "${YELLOW}[1/6] 检查必要命令...${NC}"
check_command node
check_command npm
check_command pm2

echo -e "${GREEN}✓ 命令检查通过${NC}"

echo -e "${YELLOW}[2/6] 安装依赖...${NC}"
npm install

echo -e "${GREEN}✓ 依赖安装完成${NC}"

echo -e "${YELLOW}[3/6] 配置生产环境...${NC}"
cp .env.production .env
echo -e "${GREEN}✓ 环境配置完成${NC}"

echo -e "${YELLOW}[4/6] 创建数据目录...${NC}"
mkdir -p data/evidence
mkdir -p tmp/images
echo -e "${GREEN}✓ 目录创建完成${NC}"

echo -e "${YELLOW}[5/6] 使用 PM2 启动服务...${NC}"
pm2 stop compare-api 2>/dev/null || true
pm2 delete compare-api 2>/dev/null || true
pm2 start src/index.js --name compare-api --env production

echo -e "${GREEN}✓ 服务启动成功${NC}"

echo -e "${YELLOW}[6/6] 保存 PM2 进程列表...${NC}"
pm2 save

echo -e "${GREEN}✓ 部署完成！${NC}"

echo ""
echo "=========================================="
echo "  服务状态"
echo "=========================================="
pm2 status

echo ""
echo -e "${YELLOW}查看日志：${NC} pm2 logs compare-api"
echo -e "${YELLOW}重启服务：${NC} pm2 restart compare-api"
echo -e "${YELLOW}停止服务：${NC} pm2 stop compare-api"
echo ""
