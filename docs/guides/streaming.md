# 流式输出指南

本文档介绍 OODA Agent 流式输出功能的使用方法。

## 概述

流式输出功能允许 OODA Loop 在处理过程中实时发送进度更新和内容，显著改善用户体验。用户可以看到：

- 当前处理阶段（Observe/Orient/Decide/Act）
- 思考过程和决策理由
- 工具调用和执行结果
- 内容生成的实时进度
- 错误和反馈信息

## 快速开始

### 1. 基本使用

```typescript
import { OODALoop } from '@ooda-agent/core';
import { createConsoleStreamingHandler } from '@ooda-agent/core/ooda/streaming';

// 创建流式处理器
const streamingHandler = createConsoleStreamingHandler();

// 创建 OODALoop 实例，启用流式输出
const loop = new OODALoop('session-id', streamingHandler, {
  enabled: true,
  showThinking: true,
  showProgress: true,
  chunkSize: 10,
  delayBetweenChunks: 50,
});

// 运行处理
const result = await loop.run('你的输入');
```

### 2. 动态启用/禁用

```typescript
const loop = new OODALoop('session-id');

// 稍后启用流式输出
loop.enableStreaming(createConsoleStreamingHandler(), {
  enabled: true,
  showThinking: true,
});

// 禁用流式输出
loop.disableStreaming();
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | true | 是否启用流式输出 |
| `showThinking` | boolean | true | 是否显示思考过程 |
| `showProgress` | boolean | true | 是否显示进度百分比 |
| `chunkSize` | number | 10 | 内容分块大小（字符数） |
| `delayBetweenChunks` | number | 50 | 块间延迟（毫秒） |

## 自定义流式处理器

### WebSocket 处理器示例

```typescript
import { StreamingHandler, StreamingEvent } from '@ooda-agent/core/ooda/streaming';

function createWebSocketStreamingHandler(ws: WebSocket): StreamingHandler {
  return {
    onEvent: async (event: StreamingEvent) => {
      ws.send(JSON.stringify({
        type: event.type,
        phase: event.phase,
        content: event.content,
        progress: event.progress,
        timestamp: event.timestamp,
      }));
    },
  };
}

// 使用
const ws = new WebSocket('ws://localhost:8080');
const loop = new OODALoop('session-id', createWebSocketStreamingHandler(ws));
```

### UI 更新处理器示例

```typescript
function createUIStreamingHandler(updateUI: (state: any) => void): StreamingHandler {
  const uiState = {
    currentPhase: '',
    thinking: '',
    content: '',
    progress: 0,
  };

  return {
    onEvent: async (event: StreamingEvent) => {
      switch (event.type) {
        case 'phase_start':
          uiState.currentPhase = event.phase || '';
          break;
        case 'thinking':
          uiState.thinking = event.content || '';
          break;
        case 'content':
          uiState.content += event.content || '';
          uiState.progress = event.progress || 0;
          break;
      }
      updateUI({ ...uiState });
    },
  };
}

// 在 React 中使用
const [streamState, setStreamState] = useState({});
const loop = new OODALoop('session-id', createUIStreamingHandler(setStreamState));
```

## 事件类型

### phase_start

阶段开始时触发

```typescript
{
  type: 'phase_start',
  phase: 'observe' | 'orient' | 'decide' | 'act',
  content: '阶段描述',
  timestamp: number,
}
```

### phase_complete

阶段完成时触发

```typescript
{
  type: 'phase_complete',
  phase: 'observe' | 'orient' | 'decide' | 'act',
  timestamp: number,
}
```

### thinking

思考过程更新

```typescript
{
  type: 'thinking',
  content: '思考内容',
  timestamp: number,
}
```

### content

内容流式输出

```typescript
{
  type: 'content',
  content: '内容块',
  progress: 50, // 百分比
  metadata: { ... },
  timestamp: number,
}
```

### tool_call

工具调用时触发

```typescript
{
  type: 'tool_call',
  content: '使用工具: read_file',
  metadata: { toolName: 'read_file', args: { ... } },
  timestamp: number,
}
```

### tool_result

工具执行结果

```typescript
{
  type: 'tool_result',
  content: '✅ 工具执行完成: read_file',
  metadata: { toolName: 'read_file', result: ..., isError: false },
  timestamp: number,
}
```

### error

错误发生时触发

```typescript
{
  type: 'error',
  content: '错误信息',
  timestamp: number,
}
```

### complete

处理完成时触发

```typescript
{
  type: 'complete',
  timestamp: number,
}
```

## 高级用法

### 组合多个处理器

```typescript
import { combineStreamingHandlers } from '@ooda-agent/core/ooda/streaming';

const consoleHandler = createConsoleStreamingHandler();
const uiHandler = createUIStreamingHandler(updateUI);
const wsHandler = createWebSocketStreamingHandler(ws);

const combinedHandler = combineStreamingHandlers([
  consoleHandler,
  uiHandler,
  wsHandler,
]);

const loop = new OODALoop('session-id', combinedHandler);
```

### 手动控制流式输出

```typescript
import { StreamingOutputManager } from '@ooda-agent/core/ooda/streaming';

const manager = new StreamingOutputManager(handler, config);

// 处理 OODA 事件
await manager.handleOODAEvent({ phase: 'observe' });

// 流式输出内容
await manager.streamContent('长文本内容...', { source: 'llm' });

// 发送错误
await manager.emitError(new Error('出错了'));

// 更新进度
await manager.emitProgress(50, '处理中...');

// 动态更新配置
manager.updateConfig({ showThinking: false });
```

### 字符串收集器（测试用）

```typescript
import { createStringCollector } from '@ooda-agent/core/ooda/streaming';

const { handler, getOutput } = createStringCollector();
const loop = new OODALoop('session-id', handler);

await loop.run('测试输入');
console.log('完整输出:', getOutput());
```

## 性能优化建议

1. **调整 chunkSize**: 较大的值减少事件数量，较小的值提供更平滑的动画
2. **调整 delayBetweenChunks**: 0 表示无延迟，适合高性能场景
3. **禁用不必要的事件**: 生产环境可以关闭 `showThinking` 减少噪音
4. **使用 WebSocket**: 对于 Web 应用，使用 WebSocket 而不是轮询

## 完整示例

```typescript
import { OODALoop } from '@ooda-agent/core';
import { 
  createConsoleStreamingHandler,
  StreamingConfig 
} from '@ooda-agent/core/ooda/streaming';

async function main() {
  const config: Partial<StreamingConfig> = {
    enabled: true,
    showThinking: true,
    showProgress: true,
    chunkSize: 5,
    delayBetweenChunks: 100,
  };

  const handler = createConsoleStreamingHandler();
  const loop = new OODALoop('demo-session', handler, config);

  console.log('开始处理...\n');
  
  const result = await loop.run('分析项目结构');
  
  console.log('\n最终结果:', result);
}

main().catch(console.error);
```

## 输出示例

```
[17:48:03] 🔍 正在观察和理解您的请求...
[17:48:03] ✓ observe 阶段完成
[17:48:03] 🔍 正在分析上下文和意图...
[17:48:03] 💭 识别到的意图: file_read
[17:48:03] ✓ orient 阶段完成
[17:48:03] 🔍 正在制定执行方案...
[17:48:03] 💭 决策理由: 用户想要读取文件
[17:48:03] 💭 选择方案: 使用 read_file 工具
[17:48:03] ✓ decide 阶段完成
[17:48:03] 🔍 正在执行操作...
[17:48:03] 🔧 使用工具: read_file
[17:48:03] ✅ 工具执行完成: read_file
[17:48:03] ✓ act 阶段完成
[17:48:03] ✅ 处理完成
```

## 注意事项

1. 流式输出是异步的，不会阻塞 OODA Loop 的执行
2. 所有处理器都应该是异步的（返回 Promise 或 async 函数）
3. 错误处理由处理器负责，不会影响 OODA Loop 的主流程
4. 可以通过 `loop.getStreamingManager()` 获取管理器进行动态控制
