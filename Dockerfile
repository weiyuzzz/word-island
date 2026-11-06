# 树莓派（linux/arm64）与其他平台通用：node:22-slim 官方镜像自带 arm64 变体
FROM node:22-slim

WORKDIR /app

# 先装依赖，利用 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# ensureSeeded 会在首次请求时自动建表并播种内置词库，无需额外迁移步骤
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["npm", "start"]
