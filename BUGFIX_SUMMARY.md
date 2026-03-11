# Bug 修复总结：前端发送消息后无回复

## 问题描述
用户在前端发送消息后，没有看到任何回复。

## 根本原因分析

### 1. SSE 事件格式问题
**文件**: `packages/server/src/routes/session.ts`

**问题**: 服务器发送的 SSE 事件使用了 `event: 'message'` 字段：
```typescript
await stream.writeSSE({
  event: 'message',  // 问题所在
  data: JSON.stringify({ type, ...data }),
});
```

这导致前端无法正确解析事件类型，因为前端期望的是不同的 SSE 事件类型（如 `thinking`, `intent`, `result` 等）。

**修复**: 移除了 `event` 字段，只使用 `data` 字段：
```typescript
await stream.writeSSE({
  data: JSON.stringify({ type, ...data }),
});
```

### 2. 前端缺少 `end` 事件处理
**文件**: `packages/app/src/App.tsx`

**问题**: 前端没有处理服务器发送的 `end` 事件，这可能导致连接状态不一致。

**修复**: 添加了 `case 'end'` 处理逻辑：
```typescript
case 'end':
  // Stream ended, do nothing
  break;
```

### 3. 类型定义不完整
**文件**: `packages/app/src/types/index.ts`

**问题**: `SSEEvent` 类型缺少 `end` 类型和 `status` 字段。

**修复**: 更新了类型定义：
```typescript
export interface SSEEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'result' | 'error' | 'confirmation' | 'intent' | 'reasoning' | 'end';
  content?: string;
  toolCall?: ToolCall;
  confirmation?: ConfirmationRequest;
  status?: string;  // 新增
}
```

## 修改的文件

1. `packages/server/src/routes/session.ts` - 修复 SSE 事件格式
2. `packages/app/src/App.tsx` - 添加 `end` 事件处理
3. `packages/app/src/types/index.ts` - 更新类型定义

## 验证步骤

1. 重新构建项目：`npm run build`
2. 启动服务器：`npm run dev:server`
3. 启动前端：`npm run dev:app`
4. 在前端发送消息，检查是否能看到回复

## 注意事项

- 确保 Ollama 服务正在运行（如果使用本地模型）
- 确保配置的模型（如 `qwen3:4b`）已经下载到 Ollama
- 检查浏览器控制台是否有错误信息
