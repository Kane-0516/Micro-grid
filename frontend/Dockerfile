# ============================================================
# Frontend Dockerfile — 多阶段构建：Node.js 构建 → Nginx 托管
# ============================================================

# ── Stage 1: 构建 ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 先装依赖（利用缓存层）
COPY package.json package-lock.json ./
RUN npm ci

# 复制源码并构建（跳过 tsc 类型检查，只执行 vite bundle）
COPY . .
RUN npx vite build

# ── Stage 2: 生产镜像（Nginx）────────────────────────────
FROM nginx:1.27-alpine

# 删除默认配置，替换为我们的配置
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 将构建产物复制到 Nginx 静态目录
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
