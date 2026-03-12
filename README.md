# OODA Agent

基于 OODA 循环和 ReAct 框架的 AI Agent 系统，借鉴 Manus 的 PEV 架构设计。

## 功能特性

- **OODA 循环**: 完整的观察-定向-决策-行动循环
- **多 Agent 协作**: Planning-Execution-Verification 三层架构
- **工具系统**: 可扩展的工具生态（文件、网络、代码等）
- **记忆系统**: 短期记忆 + 长期记忆 + 向量检索
- **权限系统**: 三级权限模式（allow/deny/ask）
- **流式输出**: 实时显示处理进度和思考过程
- **本地模型**: 支持 Ollama 本地部署

## 技术栈

- **语言**: TypeScript
- **运行时**: Node.js 18+
- **后端**: Hono API 框架
- **前端**: SolidJS + Vite
- **数据库**: SQLite
- **验证**: Zod

## 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/your-repo/ooda-agent.git
cd ooda-agent

# 安装依赖
npm install

# 构建项目
npm run build
```

### 配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入必要的配置
```

### 启动

```bash
# 同时启动前后端
npm run dev

# 或分别启动
npm run dev:server  # 后端 http://localhost:3000
npm run dev:app     # 前端 http://localhost:5173
```

## 项目结构

```
AgentProject/
├── config/                 # 配置文件
├── docs/                   # 文档
│   ├── architecture/       # 架构设计
│   ├── guides/             # 使用指南
│   ├── api/                # API 文档
│   └── development/        # 开发文档
├── packages/               # 核心包
│   ├── core/               # 核心逻辑（OODA、LLM、记忆等）
│   ├── server/             # 后端服务
│   ├── app/                # 前端应用
│   ├── tools/              # 工具实现
│   └── storage/            # 数据存储
├── scripts/                # 脚本工具
└── tests/                  # 测试
```

## 文档

- [快速开始](docs/guides/quickstart.md)
- [用户指南](docs/guides/user-guide.md)
- [API 文档](docs/api/README.md)
- [记忆系统](docs/guides/memory-system.md)
- [流式输出](docs/guides/streaming.md)
- [Ollama 部署](docs/guides/ollama-setup.md)
- [架构设计](docs/architecture/ooda-agents.md)

## 核心概念

### OODA 循环

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Observe │───▶│ Orient  │───▶│ Decide  │───▶│   Act   │
│  观察    │    │  定向    │    │  决策    │    │  行动    │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
```

### 工具系统

| 工具 | 功能 |
|------|------|
| `read_file` | 读取文件内容 |
| `write_file` | 写入文件内容 |
| `run_bash` | 执行 bash 命令 |
| `search_web` | 搜索网络信息 |
| `data_analysis` | 数据分析 |
| `image_processing` | 图像处理 |
| `pdf_processing` | PDF 处理 |

### 权限模式

| 模式 | 说明 |
|------|------|
| `allow` | 自动允许 |
| `ask` | 需要用户确认 |
| `deny` | 自动拒绝 |

## 示例

### 文件操作

```
读取文件：/path/to/file.txt
写入文件：/path/to/file.txt，内容：Hello World
```

### 网络搜索

```
搜索：AI Agent 最新进展
```

### 代码执行

```
执行代码：
```python
print("Hello, World!")
```
```

## 开发

```bash
# 运行测试
npm test

# 代码检查
npm run lint

# 类型检查
npm run typecheck
```

## 配置本地模型

### 安装 Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: 下载安装包 https://ollama.com/download
```

### 拉取模型

```bash
ollama pull qwen3:8b
```

### 配置项目

编辑 `config/local-model.json`：

```json
{
  "providers": [
    {
      "id": "local-ollama",
      "type": "ollama",
      "baseUrl": "http://localhost:11434",
      "models": [{ "id": "qwen3:8b", "name": "Qwen3 8B" }]
    }
  ]
}
```

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

MIT License
