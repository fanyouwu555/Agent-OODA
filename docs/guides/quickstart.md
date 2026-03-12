# 快速开始指南

本文档帮助您快速启动和运行 OODA Agent 项目。

## 环境要求

- Node.js 18+
- npm 或 pnpm
- (可选) Ollama - 用于本地模型支持

## 安装步骤

### 1. 克隆项目

```bash
git clone https://github.com/your-repo/ooda-agent.git
cd ooda-agent
```

### 2. 安装依赖

```bash
npm install --registry=https://registry.npmmirror.com
```

### 3. 构建项目

```bash
npm run build
```

### 4. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入必要的配置
```

## 启动服务

### 方式一：同时启动前后端

```bash
npm run dev
```

### 方式二：分别启动

**启动服务端：**

```bash
npm run dev:server
```

服务将在 `http://localhost:3000` 启动。

**启动前端：**

```bash
npm run dev:app
```

前端将在 `http://localhost:5173` 启动。

## 验证安装

### 1. 健康检查

```bash
curl http://localhost:3000/health
```

预期响应：
```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "skills": 9,
  "mcp": "active"
}
```

### 2. 查看技能列表

```bash
curl http://localhost:3000/api/skills
```

### 3. 创建测试会话

```bash
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'
```

## 配置本地模型（可选）

### 安装 Ollama

1. 访问 [Ollama 官网](https://ollama.com/download) 下载并安装
2. 启动 Ollama 服务：
   ```bash
   ollama serve
   ```
3. 拉取模型：
   ```bash
   ollama pull qwen3:8b
   ```

### 配置项目使用 Ollama

编辑 `config/local-model.json`：

```json
{
  "providers": [
    {
      "id": "local-ollama",
      "name": "Local Ollama",
      "type": "ollama",
      "baseUrl": "http://localhost:11434",
      "models": [
        {
          "id": "qwen3:8b",
          "name": "Qwen3 8B"
        }
      ]
    }
  ]
}
```

## 基本使用

### 通过 Web 界面

1. 打开浏览器访问 `http://localhost:5173`
2. 创建新会话或选择现有会话
3. 在输入框中输入消息，按 Enter 发送

### 通过 API

**发送消息：**

```bash
curl -X POST http://localhost:3000/api/session/{session-id}/message \
  -H "Content-Type: application/json" \
  -d '{"message": "读取文件：test.txt"}'
```

**查看历史记录：**

```bash
curl http://localhost:3000/api/session/{session-id}/history
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动前后端开发服务器 |
| `npm run dev:server` | 仅启动后端服务 |
| `npm run dev:app` | 仅启动前端服务 |
| `npm run build` | 构建所有包 |
| `npm run test` | 运行测试 |
| `npm run lint` | 运行代码检查 |

## 故障排除

### 端口被占用

如果端口 3000 或 5173 被占用，服务会自动切换到其他端口。查看控制台输出获取实际端口号。

### 前端无法连接后端

如果后端端口不是 3000，需要在前端配置代理：

创建 `packages/app/.env.local`：
```
VITE_API_PORT=3001
VITE_WS_PORT=3001
```

### 依赖安装失败

尝试使用其他镜像源：
```bash
npm install --registry=https://registry.npmjs.org
```

## 下一步

- 阅读 [用户指南](./user-guide.md) 了解更多功能
- 查看 [API 文档](../api/README.md) 了解接口详情
- 探索 [记忆系统](./memory-system.md) 了解高级功能
