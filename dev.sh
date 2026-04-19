#!/bin/bash
# FiKA SaaS 本地开发一键启动脚本
# 前端: http://localhost:5173  (实时热更新)
# 后端: http://localhost:3000  (API + AI)

ROOT="$(cd "$(dirname "$0")" && pwd)"

# 颜色
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}===========================================${NC}"
echo -e "${CYAN}   FiKA SaaS 本地开发环境启动中...${NC}"
echo -e "${CYAN}===========================================${NC}"

# 检查依赖
if ! command -v node &> /dev/null; then
  echo "❌ 未找到 node，请先安装 Node.js"
  exit 1
fi

# 安装后端依赖
if [ ! -d "$ROOT/backend/node_modules" ]; then
  echo -e "${YELLOW}📦 安装后端依赖...${NC}"
  cd "$ROOT/backend" && npm install
fi

# 安装前端依赖
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo -e "${YELLOW}📦 安装前端依赖...${NC}"
  cd "$ROOT/frontend" && npm install
fi

# 启动后端（后台）
echo -e "${GREEN}🚀 启动后端 (API + AI + MongoDB)...${NC}"
cd "$ROOT/backend" && npm run dev &
BACKEND_PID=$!

# 等后端起来
sleep 2

# 更新前端 vite 代理指向正确端口（如果 .env 里 PORT=3000 则指向 3000）
BACKEND_PORT=$(grep -E '^PORT=' "$ROOT/backend/.env" 2>/dev/null | cut -d= -f2 | tr -d ' \r')
BACKEND_PORT=${BACKEND_PORT:-4000}

# 如果 vite.config.ts 里的端口和实际不符，提示用户
VITE_PROXY=$(grep -o 'http://127.0.0.1:[0-9]*' "$ROOT/frontend/vite.config.ts" | head -1)
echo -e "${CYAN}后端端口: ${BACKEND_PORT}，Vite 代理: ${VITE_PROXY}${NC}"
if [ "$VITE_PROXY" != "http://127.0.0.1:${BACKEND_PORT}" ]; then
  echo -e "${YELLOW}⚠️  注意：vite.config.ts 代理指向 ${VITE_PROXY}，但后端实际跑在 ${BACKEND_PORT}${NC}"
  echo -e "${YELLOW}   如果 API 调用失败，请修改 vite.config.ts 里的 target 端口${NC}"
fi

# 启动前端（前台，这样 Ctrl+C 可以同时停止）
echo -e "${GREEN}🌐 启动前端 (Vite 热更新)...${NC}"
echo -e "${CYAN}===========================================${NC}"
echo -e "${GREEN}✅ 前端地址: http://localhost:5173${NC}"
echo -e "${GREEN}✅ 后端地址: http://localhost:${BACKEND_PORT}${NC}"
echo -e "${CYAN}   按 Ctrl+C 停止所有服务${NC}"
echo -e "${CYAN}===========================================${NC}"

# Ctrl+C 时同时杀掉后端
trap "echo ''; echo '停止所有服务...'; kill $BACKEND_PID 2>/dev/null; exit 0" INT TERM

cd "$ROOT/frontend" && npm run dev

# 前端退出后也关掉后端
kill $BACKEND_PID 2>/dev/null
