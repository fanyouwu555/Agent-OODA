# 项目清理计划

## 1. 需要删除的文件

### 1.1 临时测试文件（根目录）
- `simple-llm-test.js` - 简单LLM测试
- `simple-ollama-test.js` - 简单Ollama测试
- `simple-skill-mcp-test.js` - 简单Skill MCP测试
- `simple-test.js` - 简单测试
- `test-agent.ts` - Agent测试
- `test-core-features.js` - 核心功能测试
- `test-full-project.js` - 完整项目测试
- `test-llm-agent.js` - LLM Agent测试
- `test-llm-service.js` - LLM服务测试
- `test-memory.js` - 内存测试
- `test-ollama.js` - Ollama测试
- `test-skill-mcp.js` - Skill MCP测试

**原因**: 这些测试文件应该整合到 `tests/` 目录中，而不是散落在根目录。

### 1.2 重复或废弃的文档
- `project-status.md` - 项目状态文档
- `project-summary.md` - 项目总结文档

**原因**: 这些文档可能是临时的或重复的，应该整合到 `docs/` 目录中。

### 1.3 自动生成的文件
- `package-lock.json` - npm自动生成的锁文件

**原因**: 这个文件应该被 `.gitignore` 忽略，不应该提交到版本控制。

## 2. 需要整合的文件

### 2.1 测试文件整合
将根目录的测试文件移动到 `tests/` 目录：
- 移动 `test-*.js` 到 `tests/integration/`
- 移动 `simple-*.js` 到 `tests/unit/`

### 2.2 文档整合
将根目录的文档移动到 `docs/` 目录：
- 移动 `project-status.md` 到 `docs/status/`
- 移动 `project-summary.md` 到 `docs/summary/`

## 3. 需要更新的文件

### 3.1 .gitignore
添加以下内容：
```
# Dependencies
node_modules/

# Build outputs
dist/

# Lock files
package-lock.json

# Environment variables
.env
.env.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
```

### 3.2 README.md
更新项目结构说明，反映清理后的目录结构。

## 4. 清理后的项目结构

```
AgentProject/
├── config/              # 配置文件
│   └── example.json
├── dist/                # 构建输出
├── docs/                # 文档
│   ├── api-documentation.md
│   ├── ollama-qianwen3-guide.md
│   ├── plans/
│   ├── status/
│   │   └── project-status.md
│   ├── summary/
│   │   └── project-summary.md
│   └── user-guide.md
├── packages/            # 包
│   ├── app/            # 前端应用
│   ├── core/           # 核心包
│   ├── server/         # 服务器包
│   └── tools/          # 工具包
├── tests/              # 测试
│   ├── integration/    # 集成测试
│   │   └── ooda-loop.test.ts
│   └── unit/           # 单元测试
│       └── advanced-skills.test.ts
├── .gitignore          # Git忽略文件
├── package.json        # 项目配置
├── tsconfig.json       # TypeScript配置
└── README.md           # 项目说明
```

## 5. 清理步骤

1. **删除无用文件**
   - 删除根目录的临时测试文件
   - 删除重复的文档文件
   - 删除 package-lock.json

2. **整合文件**
   - 移动测试文件到 tests/ 目录
   - 移动文档文件到 docs/ 目录

3. **更新配置**
   - 更新 .gitignore
   - 更新 README.md

4. **验证清理结果**
   - 检查项目结构是否清晰
   - 确保所有功能正常

## 6. 预期效果

- 项目结构更加清晰
- 文件组织更加合理
- 易于维护和扩展
- 符合最佳实践
