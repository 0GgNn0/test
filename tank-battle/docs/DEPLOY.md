# 坦克大战游戏 - 部署指南

## TankBattle Online - Deployment Guide

### 环境要求

- Node.js 18+
- Docker & Docker Compose
- 2GB+ RAM
- 端口 3000 可用

### 本地开发运行

```bash
# 1. 进入项目目录
cd tank-battle

# 2. 安装后端依赖
cd server
npm install

# 3. 编译TypeScript
npm run build

# 4. 返回项目根目录
cd ..

# 5. 使用Docker运行
docker-compose up --build
```

或者不使用Docker：

```bash
cd server
npm run dev
```

访问 http://localhost:3000

### Docker部署

#### 快速部署

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

#### 生产环境部署

1. 确保Docker已安装
2. 复制项目到服务器
3. 运行部署命令

```bash
docker-compose up -d --build
```

### 服务器要求

| 配置 | 最低 | 推荐 |
|------|------|------|
| CPU | 1核 | 2核 |
| 内存 | 1GB | 2GB |
| 带宽 | 5Mbps | 10Mbps |

### 端口配置

- `3000`: 游戏服务器（HTTP + WebSocket）

如需修改端口，编辑 `docker-compose.yml`

### 数据持久化

数据库文件存储在Docker卷 `tankbattle-data` 中

### 常用命令

```bash
# 重启服务
docker-compose restart

# 查看状态
docker-compose ps

# 查看实时日志
docker-compose logs -f --tail=100

# 更新并重新部署
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### 防火墙配置

```bash
# Ubuntu/Debian
sudo ufw allow 3000/tcp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```
