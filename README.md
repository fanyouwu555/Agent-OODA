# OODA Agent 项目

基于 OODA 循环和 ReAct 框架的 AI Agent 项目，借鉴 Manus 的 PEV 架构设计。

## 技术架构

- **核心引擎**：OODA 循环（观察-判断-决策-行动）
- **多Agent协作**：Planning-Execution-Verification 架构
- **工具系统**：可扩展的工具生态
- **服务端**：Hono API 框架
- **前端**：SolidJS 响应式应用

## 项目结构

```
AgentProject/
├── config/              # 配置文件
│   └── example.json     # 示例配置
├── dist/                # 构建输出
├── docs/                # 文档
│   ├── api-documentation.md  # API文档
│   ├── ollama-qianwen3-guide.md  # Ollama指南
│   ├── plans/           # 计划文档
│   ├── status/          # 状态文档
│   ├── summary/         # 总结文档
│   └── user-guide.md    # 用户指南
├── packages/            # 包
│   ├── app/            # 前端应用
│   │   └── src/
│   │       ├── components/  # 组件
│   │       ├── App.tsx      # 主应用
│   │       └── main.tsx     # 入口
│   ├── core/           # 核心包
│   │   └── src/
│   │       ├── config/      # 配置系统
│   │       ├── error/       # 错误处理
│   │       ├── llm/         # LLM集成
│   │       ├── mcp/         # MCP系统
│   │       ├── memory/      # 记忆系统
│   │       ├── ooda/        # OODA循环
│   │       ├── permission/  # 权限系统
│   │       ├── skill/       # 技能系统
│   │       └── types/       # 类型定义
│   ├── server/         # 服务器包
│   │   └── src/
│   │       ├── routes/      # API路由
│   │       └── index.ts     # 服务入口
│   └── tools/          # 工具包
│       └── src/
│           ├── skills/      # 技能实现
│           ├── base-tool.ts # 基础工具
│           └── registry.ts  # 工具注册
├── tests/               # 测试
│   ├── integration/    # 集成测试
│   └── unit/           # 单元测试
├── .gitignore          # Git忽略文件
├── package.json        # 项目配置
├── tsconfig.json       # TypeScript配置
└── README.md           # 项目说明
```

## 核心功能

1. **OODA 循环**：完整实现观察、判断、决策、行动四个阶段
2. **多Agent协作**：规划、执行、验证三层架构
3. **工具系统**：支持文件操作、命令执行、网络搜索等
4. **权限系统**：三级权限模式（allow/deny/ask）
5. **配置系统**：支持文件和环境变量配置
6. **错误处理**：完善的错误处理机制
7. **记忆系统**：短期和长期记忆管理

## 快速开始

### 1. 安装依赖

```bash
npm install --registry=https://registry.npmmirror.com
```

### 2. 配置项目

复制示例配置文件：
```bash
cp config/example.json ~/.config/ooda-agent/config.json
```

### 3. 启动服务端

```bash
npm run dev:server
```

### 4. 启动前端

```bash
npm run dev:app
```

### 5. 访问应用

打开浏览器访问：http://localhost:5173

## API 接口

- **GET /health** - 健康检查
- **GET /api/skills** - 获取技能列表
- **POST /api/session** - 创建会话
- **POST /api/session/:id/message** - 发送消息
- **GET /api/session/:id/history** - 获取历史记录

## 工具列表

### 基础工具
- **read_file** - 读取文件内容
- **write_file** - 写入文件内容
- **run_bash** - 执行bash命令
- **search_web** - 搜索网络信息

### 高级技能
- **data_analysis** - 数据分析
- **image_processing** - 图像处理
- **pdf_processing** - PDF处理
- **code_analysis** - 代码分析
- **api_test** - API测试
- **database_query** - 数据库查询

## 技术栈

- **语言**：TypeScript
- **运行时**：Node.js
- **Web框架**：Hono
- **前端**：SolidJS
- **验证**：Zod
- **构建**：TypeScript + Vite

## 设计理念

1. **OODA-ReAct融合**：结合OODA循环的决策模型和ReAct的推理-行动模式
2. **多Agent协作**：借鉴Manus的PEV架构，实现任务的分解和验证
3. **权限系统**：三级权限模式，确保安全性
4. **配置系统**：灵活的配置管理，支持多种环境
5. **可扩展性**：模块化设计，支持工具和Agent的扩展

## 文档

- [API文档](docs/api-documentation.md)
- [用户指南](docs/user-guide.md)
- [Ollama指南](docs/ollama-qianwen3-guide.md)

## 许可证

MIT License