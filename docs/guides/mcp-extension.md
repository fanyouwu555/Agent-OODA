# MCP (Message Control Protocol) 扩展指南

本文档说明 MCP 消息系统的功能以及如何扩展它。

## MCP 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP 消息系统                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  Publisher   │───▶│   Router    │───▶│  Subscriber │      │
│  │  (发布者)     │    │   (路由)     │    │  (订阅者)   │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│         │                                      │               │
│         │         MCPServiceImpl               │               │
│         │    ┌──────────────────┐              │               │
│         └───▶│  subscriptions  │◀─────────────┘               │
│              │  (订阅存储)     │                               │
│              └──────────────────┘                               │
│                                                                  │
│  消息类型:                                                        │
│  - command: 命令消息 (需要响应)                                  │
│  - event:   事件消息 (广播)                                     │
│  - status:  状态消息 (持续状态更新)                             │
│  - error:   错误消息 (错误通知)                                 │
└─────────────────────────────────────────────────────────────────┘
```

## MCP 核心功能

### 1. 消息类型

```typescript
interface MCPMessage {
  id: string;           // 唯一标识
  type: 'command' | 'status' | 'event' | 'error';
  topic: string;        // 主题（如 'agent.start', 'tool.execute'）
  payload: unknown;      // 消息内容
  timestamp: number;     // 时间戳
}
```

### 2. MCP 服务 API

```typescript
interface MCPService {
  // 发送消息
  send(message: MCPMessage): Promise<void>;
  
  // 订阅主题
  subscribe(topic: string, handler: (message: MCPMessage) => void): string;
  
  // 取消订阅
  unsubscribe(subscriptionId: string): void;
  
  // 发送请求（带响应）
  request(topic: string, payload: unknown): Promise<unknown>;
  
  // 发布事件
  publishEvent(topic: string, payload: unknown): Promise<void>;
  
  // 发布状态
  publishStatus(topic: string, payload: unknown): Promise<void>;
  
  // 发布错误
  publishError(topic: string, error: Error): Promise<void>;
}
```

## 使用 MCP

### 1. 在技能中使用 MCP

```typescript
import { BaseSkill, SkillContext } from '@ooda-agent/core';

class MySkill extends BaseSkill {
  name = 'my_skill';
  // ... 其他属性
  
  async execute(input: unknown, context: SkillContext) {
    // 发布事件
    await context.mcp.publishEvent('skill.start', {
      skillName: this.name,
    });
    
    // 执行操作...
    const result = await this.doWork(input);
    
    // 发布完成事件
    await context.mcp.publishEvent('skill.complete', {
      skillName: this.name,
      result,
    });
    
    return result;
  }
}
```

### 2. 在 Actor 中使用 MCP

```typescript
// OODA 的 Act 阶段已经集成了 MCP
await this.mcp.publishEvent('ooda.act.complete', {
  actionType: action.type,
  toolName: action.toolName,
  success: !isError,
  executionTime,
});
```

### 3. 订阅消息

```typescript
import { getMCPService } from '@ooda-agent/core';

const mcp = getMCPService();

// 订阅主题
const subscriptionId = mcp.subscribe('agent.message', (message) => {
  console.log('收到消息:', message.payload);
});

// 取消订阅
mcp.unsubscribe(subscriptionId);
```

### 4. 发布进度更新

```typescript
// 在长时间运行的操作中发布进度
async function runLongTask(input, context) {
  const totalSteps = 10;
  
  for (let i = 0; i < totalSteps; i++) {
    await doStep(i);
    
    // 发布进度
    await context.mcp.publishStatus('task.progress', {
      current: i + 1,
      total: totalSteps,
      percentage: ((i + 1) / totalSteps) * 100,
    });
  }
}
```

### 5. 错误处理

```typescript
try {
  await riskyOperation();
} catch (error) {
  await context.mcp.publishError('skill.error', error as Error);
}
```

## 内置 MCP 主题

### OODA 循环事件

| 主题 | 说明 | 载荷 |
|------|------|------|
| `ooda.observe.start` | 观察阶段开始 | `{ input: string }` |
| `ooda.orient.start` | 定向阶段开始 | `{ intent: string }` |
| `ooda.decide.start` | 决策阶段开始 | `{ options: number }` |
| `ooda.act.start` | 行动阶段开始 | `{ action: string }` |
| `ooda.act.complete` | 行动阶段完成 | `{ success: boolean, executionTime: number }` |
| `ooda.complete` | OODA 循环完成 | `{ output: string }` |

### 工具事件

| 主题 | 说明 | 载荷 |
|------|------|------|
| `tool.executing` | 工具执行中 | `{ toolName: string, args: object }` |
| `tool.executed` | 工具执行完成 | `{ toolName: string, result: any }` |
| `tool.error` | 工具执行错误 | `{ toolName: string, error: Error }` |
| `tool.permission_denied` | 权限被拒绝 | `{ toolName: string, message: string }` |

### 技能事件

| 主题 | 说明 | 载荷 |
|------|------|------|
| `skill.start` | 技能开始 | `{ skillName: string }` |
| `skill.executing` | 技能执行中 | `{ skillName: string, action: string }` |
| `skill.executed` | 技能执行完成 | `{ skillName: string, result: any }` |
| `skill.error` | 技能执行错误 | `{ skillName: string, error: Error }` |

### Agent 事件

| 主题 | 说明 | 载荷 |
|------|------|------|
| `agent.start` | Agent 启动 | `{ sessionId: string }` |
| `agent.response` | Agent 响应 | `{ content: string }` |
| `agent.clarification` | 请求澄清 | `{ question: string }` |
| `agent.error` | Agent 错误 | `{ error: Error }` |

## 创建自定义 MCP 中间件

```typescript
import { MCPServiceImpl, MCPMessage } from '@ooda-agent/core';

// 创建自定义 MCP 服务
class CustomMCPService extends MCPServiceImpl {
  // 添加日志中间件
  async send(message: MCPMessage): Promise<void> {
    console.log(`[MCP] ${message.type} - ${message.topic}:`, message.payload);
    await super.send(message);
  }
  
  // 添加消息过滤
  subscribe(topic: string, handler: (message: MCPMessage) => void): string {
    // 只订阅特定前缀的主题
    const filteredHandler = (message: MCPMessage) => {
      if (message.topic.startsWith('allowed:')) {
        handler(message);
      }
    };
    return super.subscribe(topic, filteredHandler);
  }
}

// 使用自定义服务
import { setMCPService } from '@ooda-agent/core';
setMCPService(new CustomMCPService());
```

## MCP 与前端集成

```typescript
// 前端 WebSocket 连接
const ws = new WebSocket('ws://localhost:3000/mcp');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.topic) {
    case 'ooda.act.complete':
      updateUI(message.payload);
      break;
    case 'tool.executed':
      showToolResult(message.payload);
      break;
    // ...
  }
};
```

## 测试 MCP

```typescript
import { describe, it, expect } from 'vitest';
import { MCPServiceImpl } from '@ooda-agent/core';

describe('MCP 测试', () => {
  it('应该正确发送和接收消息', async () => {
    const mcp = new MCPServiceImpl();
    const received: any[] = [];
    
    // 订阅
    const subId = mcp.subscribe('test.topic', (msg) => {
      received.push(msg.payload);
    });
    
    // 发布
    await mcp.publishEvent('test.topic', { data: 'hello' });
    
    // 验证
    expect(received.length).toBe(1);
    expect(received[0].data).toBe('hello');
    
    // 清理
    mcp.unsubscribe(subId);
  });
  
  it('应该支持多个订阅者', async () => {
    const mcp = new MCPServiceImpl();
    const results: number[] = [];
    
    mcp.subscribe('topic', () => results.push(1));
    mcp.subscribe('topic', () => results.push(2));
    
    await mcp.publishEvent('topic', {});
    
    expect(results).toEqual([1, 2]);
  });
});
```

## MCP 最佳实践

### 1. 主题命名规范

```
格式: <组件>.<操作>.<详情>

示例:
- agent.start
- agent.response.partial
- tool.execute.read_file
- skill.progress
- error.validation
```

### 2. 消息载荷结构

```typescript
// 推荐的结构
{
  // 必需字段
  timestamp: number,
  correlationId?: string,  // 用于关联请求/响应
  
  // 业务数据
  data: { ... },
  
  // 上下文
  context?: {
    sessionId: string,
    userId?: string,
  }
}
```

### 3. 错误消息格式

```typescript
// 始终包含以下字段
{
  name: 'ErrorName',           // 错误类型
  message: '用户友好的错误描述',
  stack?: 'error.stack',       // 开发环境
  code?: 'ERROR_CODE',         // 错误代码
  details?: { ... }            // 额外信息
}
```
