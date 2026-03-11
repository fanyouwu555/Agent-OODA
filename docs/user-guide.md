# OODA Agent 用户指南

## 快速开始

### 安装

1. 克隆项目
```bash
git clone https://github.com/your-repo/ooda-agent.git
cd ooda-agent
```

2. 安装依赖
```bash
npm install --registry=https://registry.npmmirror.com
```

3. 构建项目
```bash
npm run build
```

### 启动服务器

```bash
npm run dev:server
```

服务器将在 `http://localhost:3000` 启动。

### 启动前端

```bash
npm run dev:app
```

前端将在 `http://localhost:5173` 启动。

## 基本使用

### 1. 创建会话

首先，创建一个新的会话：

```bash
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"message": "你好，我想读取一个文件"}'
```

响应：
```json
{
  "sessionId": "session-123",
  "status": "created"
}
```

### 2. 发送消息

使用会话ID发送消息：

```bash
curl -X POST http://localhost:3000/api/session/session-123/message \
  -H "Content-Type: application/json" \
  -d '{"message": "读取文件：test.txt"}'
```

### 3. 查看历史记录

查看会话的历史记录：

```bash
curl http://localhost:3000/api/session/session-123/history
```

## 技能使用示例

### 文件操作

#### 读取文件
```
读取文件：/path/to/file.txt
```

#### 写入文件
```
写入文件：/path/to/file.txt，内容：Hello World
```

### 网络搜索

```
搜索：AI Agent 技术
```

### 数据分析

```
分析数据：[1, 2, 3, 4, 5]，类型：summary
```

### 图像处理

```
处理图像：/path/to/image.jpg，操作：resize，参数：{width: 100, height: 100}
```

### PDF 处理

```
提取PDF文本：/path/to/document.pdf
```

### 代码分析

```
分析代码：/path/to/code.ts，语言：typescript，类型：quality
```

### API 测试

```
测试API：https://api.example.com/users，方法：GET
```

### 数据库查询

```
查询数据库：SELECT * FROM users WHERE id = 1
```

## 配置本地模型

### 安装 Ollama

1. 下载并安装 Ollama: https://ollama.ai/

2. 启动 Ollama 服务：
```bash
ollama serve
```

3. 下载 Qianwen3 模型：
```bash
ollama pull qianwen3:8b
```

### 配置 Agent

在配置文件中设置：

```typescript
const config = {
  type: 'ollama',
  model: 'qianwen3:8b',
  baseUrl: 'http://localhost:11434',
  temperature: 0.7,
  maxTokens: 1000
};
```

## 高级功能

### 性能监控

系统会自动收集性能指标，可以在结果中查看：

```json
{
  "metadata": {
    "performanceMetrics": {
      "observeTime": 5,
      "orientTime": 3,
      "decideTime": 8,
      "actTime": 12,
      "totalTime": 28
    }
  }
}
```

### 缓存机制

系统会自动缓存观察、定向和决策的结果，提高执行效率。缓存默认过期时间为 30 秒。

### 历史记录优化

系统会自动限制历史记录大小，默认最多保留 100 条记录，防止内存占用过高。

## 最佳实践

### 1. 明确任务描述

提供清晰、具体的任务描述，有助于系统更好地理解和执行：

**好的示例:**
```
读取文件：/home/user/documents/report.txt，从第 10 行开始，读取 50 行
```

**不好的示例:**
```
读取文件
```

### 2. 使用正确的路径

始终使用绝对路径，确保路径在工作目录内：

**好的示例:**
```
读取文件：/home/user/workspace/project/file.txt
```

**不好的示例:**
```
读取文件：../file.txt
```

### 3. 检查权限

确保技能有所需的权限，否则会执行失败：

```
错误: 权限不足：无法访问工作目录外的文件
```

### 4. 处理错误

捕获并处理可能的错误：

```typescript
try {
  const result = await oodaLoop.run('读取文件：test.txt');
  console.log(result.output);
} catch (error) {
  console.error('执行失败:', error.message);
}
```

## 故障排除

### 服务器无法启动

**问题:** 服务器启动失败，提示端口被占用

**解决方案:**
```bash
# 查找占用端口的进程
lsof -i :3000

# 终止进程
kill -9 <PID>

# 或使用其他端口
PORT=3001 npm run dev:server
```

### Ollama 连接失败

**问题:** 无法连接到 Ollama 服务

**解决方案:**
```bash
# 检查 Ollama 服务状态
ollama list

# 重启 Ollama 服务
ollama serve

# 检查模型是否下载
ollama pull qianwen3:8b
```

### 技能执行失败

**问题:** 技能执行失败，提示权限不足

**解决方案:**
- 检查文件路径是否在工作目录内
- 检查技能是否有所需的权限
- 检查输入参数是否符合要求

### 性能问题

**问题:** 系统响应缓慢

**解决方案:**
- 减少历史记录大小
- 增加缓存过期时间
- 优化技能执行逻辑
- 使用更快的模型

## 开发指南

### 添加新技能

1. 创建技能类：

```typescript
export class MyCustomSkill implements Tool {
  name = 'my_custom_skill';
  description = '我的自定义技能';
  schema = z.object({
    input: z.string().describe('输入参数'),
  });
  permissions: Permission[] = [
    { type: 'file_read', pattern: '**/*' },
  ];
  
  async execute(input: { input: string }, context: ExecutionContext) {
    // 实现技能逻辑
    return { result: 'success' };
  }
}
```

2. 注册技能：

```typescript
import { MyCustomSkill } from './skills/my-custom-skill';

export function initializeSkills(): void {
  const skillRegistry = getSkillRegistry();
  skillRegistry.register(new MyCustomSkill());
}
```

### 扩展 MCP 系统

1. 订阅事件：

```typescript
mcp.subscribe('custom.event', (message) => {
  console.log('收到自定义事件:', message);
});
```

2. 发布事件：

```typescript
await mcp.publishEvent('custom.event', {
  data: '自定义数据'
});
```

## 常见问题

### Q: 如何查看可用的技能列表？

A: 访问 `/api/skills` 端点：

```bash
curl http://localhost:3000/api/skills
```

### Q: 如何清除会话历史？

A: 删除会话并创建新的会话：

```bash
curl -X DELETE http://localhost:3000/api/session/session-123
```

### Q: 如何修改系统配置？

A: 通过环境变量或配置文件修改：

```bash
MAX_ITERATIONS=20 TIMEOUT=120000 npm run dev:server
```

### Q: 如何查看系统日志？

A: 查看控制台输出或日志文件：

```bash
tail -f logs/ooda-agent.log
```

## 获取帮助

- **文档**: https://docs.ooda-agent.com
- **GitHub**: https://github.com/your-repo/ooda-agent
- **问题反馈**: https://github.com/your-repo/ooda-agent/issues
- **社区讨论**: https://community.ooda-agent.com

## 更新日志

查看 [API 文档](./api-documentation.md) 中的更新日志部分。
