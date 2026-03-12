# 多阶段构建 Dockerfile

# ==================== 构建阶段 ====================
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 复制 package 文件
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/server/package*.json ./packages/server/
COPY packages/app/package*.json ./packages/app/
COPY packages/tools/package*.json ./packages/tools/
COPY packages/storage/package*.json ./packages/storage/

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建项目
RUN npm run build

# ==================== 生产阶段 ====================
FROM node:20-alpine AS production

# 设置工作目录
WORKDIR /app

# 安装生产环境依赖
RUN apk add --no-cache git

# 复制 package 文件
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/server/package*.json ./packages/server/
COPY packages/tools/package*.json ./packages/tools/
COPY packages/storage/package*.json ./packages/storage/

# 只安装生产依赖
RUN npm ci --only=production && npm cache clean --force

# 从构建阶段复制构建产物
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/tools/dist ./packages/tools/dist
COPY --from=builder /app/packages/storage/dist ./packages/storage/dist
COPY --from=builder /app/packages/app/dist ./packages/app/dist

# 复制配置文件
COPY config ./config

# 创建数据目录
RUN mkdir -p /app/data

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动命令
CMD ["node", "packages/server/dist/index.js"]
