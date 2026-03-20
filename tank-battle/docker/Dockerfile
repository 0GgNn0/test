# TankBattle Dockerfile

FROM node:20-alpine

WORKDIR /app

# 安装Python和构建工具（better-sqlite3需要）
RUN apk add --no-cache python3 make g++

# 复制后端代码
COPY server/package*.json ./
RUN npm install --production

COPY server/tsconfig.json ./
COPY server/src ./src

# 编译TypeScript
RUN npm run build

# 复制客户端
COPY client ./client

# 创建数据库目录
RUN mkdir -p database

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "dist/index.js"]
