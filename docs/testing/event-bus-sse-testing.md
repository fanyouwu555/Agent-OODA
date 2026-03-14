# Event Bus + SSE 流式架构测试计划

## 一、测试范围

本次修改涉及的核心模块：

| 模块 | 文件 | 测试重点 |
|------|------|----------|
| EventBus | `packages/core/src/event-bus/index.ts` | 订阅/发布/过滤 |
| SSE 端点 | `packages/server/src/routes/events.ts` | 连接/心跳/事件推送 |
| OODA Streaming | `packages/core/src/ooda/streaming.ts` | 事件转发 |
| EventClient | `packages/app/src/services/event-client.ts` | 连接/订阅/重连 |
| App.tsx | `packages/app/src/App.tsx` | 集成测试 |

---

## 二、测试用例

### 2.1 EventBus 单元测试

#### TC-EB-001: 基本订阅与发布

```typescript
// 测试场景：单一订阅者接收事件
const bus = new EventBus();
const handler = vi.fn();

const subId = bus.subscribe(['message'], handler);
bus.publish({ namespace: 'message', action: 'part', payload: 'test', timestamp: Date.now() });

expect(handler).toHaveBeenCalledTimes(1);
expect(handler.mock.calls[0][0].payload).toBe('test');
```

**预期结果**: 订阅者正确接收事件

#### TC-EB-002: 命名空间过滤

```typescript
// 测试场景：只订阅 message 命名空间，不接收 session 事件
const bus = new EventBus();
const handler = vi.fn();

bus.subscribe(['message'], handler);
bus.publish({ namespace: 'session', action: 'created', payload: 'test', timestamp: Date.now() });

expect(handler).not.toHaveBeenCalled();
```

**预期结果**: 事件按命名空间正确过滤

#### TC-EB-003: 会话过滤

```typescript
// 测试场景：只接收特定 sessionId 的事件
const bus = new EventBus();
const handler = vi.fn();

bus.subscribe(['message'], handler, 'session-1');
bus.publish({ namespace: 'message', action: 'part', sessionId: 'session-1', payload: 'test', timestamp: Date.now() });
bus.publish({ namespace: 'message', action: 'part', sessionId: 'session-2', payload: 'test', timestamp: Date.now() });

expect(handler).toHaveBeenCalledTimes(1);
```

**预期结果**: 按 sessionId 正确过滤

#### TC-EB-004: 取消订阅

```typescript
const bus = new EventBus();
const handler = vi.fn();

const subId = bus.subscribe(['message'], handler);
bus.unsubscribe(subId);
bus.publish({ namespace: 'message', action: 'part', payload: 'test', timestamp: Date.now() });

expect(handler).not.toHaveBeenCalled();
```

**预期结果**: 取消订阅后不再接收事件

#### TC-EB-005: 多订阅者

```typescript
const bus = new EventBus();
const handler1 = vi.fn();
const handler2 = vi.fn();

bus.subscribe(['message'], handler1);
bus.subscribe(['message'], handler2);
bus.publish({ namespace: 'message', action: 'part', payload: 'test', timestamp: Date.now() });

expect(handler1).toHaveBeenCalledTimes(1);
expect(handler2).toHaveBeenCalledTimes(1);
```

**预期结果**: 所有订阅者都收到事件

---

### 2.2 SSE 端点测试

#### TC-SSE-001: 基本连接

```typescript
// 使用 supertest 或 fetch 测试
const response = await fetch('/api/events');
const reader = response.body?.getReader();

// 验证连接建立
expect(response.status).toBe(200);
expect(response.headers.get('content-type')).toContain('text/event-stream');
```

**预期结果**: 返回 SSE 流

#### TC-SSE-002: 连接成功事件

```typescript
// 读取第一个事件
const event = await readSSEEvent(reader);
expect(event.event).toBe('connected');
expect(event.data).toContain('timestamp');
```

**预期结果**: 收到 `connected` 事件

#### TC-SSE-003: 会话过滤

```typescript
const response = await fetch('/api/events?session=test-session');
// 验证只收到该会话的事件
```

**预期结果**: URL 参数正确过滤

#### TC-SSE-004: 心跳事件

```typescript
// 等待 30 秒后检查心跳
await sleep(35000);
const event = await readSSEEvent(reader);
expect(event.event).toBe('heartbeat');
```

**预期结果**: 定期收到心跳

#### TC-SSE-005: 连接断开清理

```typescript
// 关闭连接
response.controller.abort();

// 验证订阅已清理
const status = await fetch('/api/events/status');
const data = await status.json();
expect(data.subscribers.message).toBe(0);
```

**预期结果**: 断开后订阅自动清理

---

### 2.3 前端 EventClient 测试

#### TC-CLIENT-001: 连接与断开

```typescript
const client = createEventClient({ autoConnect: false });
client.connect();

await waitFor(() => expect(client.isConnected()).toBe(true));

client.disconnect();
await waitFor(() => expect(client.isConnected()).toBe(false));
```

**预期结果**: 连接状态正确

#### TC-CLIENT-002: 事件订阅

```typescript
const handler = vi.fn();
const unsub = client.on('message.part', handler);

// 模拟事件
simulateSSEEvent({ namespace: 'message', action: 'part', payload: { part: 'test' } });

expect(handler).toHaveBeenCalledTimes(1);
```

**预期结果**: 事件正确触发处理器

#### TC-CLIENT-003: 自动重连

```typescript
const client = createEventClient({ reconnectInterval: 1000, autoConnect: false });
client.connect();

// 模拟断开
simulateDisconnect();

await waitFor(() => expect(client.isConnected()).toBe(true), { timeout: 5000 });
```

**预期结果**: 自动重连成功

#### TC-CLIENT-004: 取消订阅

```typescript
const handler = vi.fn();
const unsub = client.on('message.part', handler);

unsub();
simulateSSEEvent({ namespace: 'message', action: 'part', payload: {} });

expect(handler).not.toHaveBeenCalled();
```

**预期结果**: 取消后不再触发

#### TC-CLIENT-005: 通配符订阅

```typescript
const handler = vi.fn();
client.on('message.*', handler); // 订阅所有 message 事件

simulateSSEEvent({ namespace: 'message', action: 'part', payload: {} });
simulateSSEEvent({ namespace: 'message', action: 'completed', payload: {} });

expect(handler).toHaveBeenCalledTimes(2);
```

**预期结果**: 通配符匹配多个事件

---

### 2.4 集成测试

#### TC-INT-001: 端到端消息流

```typescript
// 1. 前端发送消息
await apiClient.sendMessage('test-session', 'hello');

// 2. 验证收到 message.part 事件
const partEvent = await waitForSSEEvent('message.part');
expect(partEvent.payload.part).toBeDefined();

// 3. 验证收到 message.completed 事件
const completeEvent = await waitForSSEEvent('message.completed');
expect(completeEvent.payload.fullContent).toBeDefined();
```

**预期结果**: 完整消息流程

#### TC-INT-002: 权限请求流程

```typescript
// 触发需要权限的操作
await apiClient.sendMessage('test-session', '删除文件');

// 验证收到 permission.asked 事件
const permEvent = await waitForSSEEvent('permission.asked');
expect(permEvent.payload.toolName).toBe('delete_file');

// 用户确认
await apiClient.confirmPermission('test-session', permEvent.payload.confirmationId, true);

// 验证操作继续执行
```

**预期结果**: 权限流程完整

#### TC-INT-003: 多客户端同步

```typescript
// 打开两个客户端
const client1 = createEventClient({ sessionId: 'test' });
const client2 = createEventClient({ sessionId: 'test' });

// 客户端1发送消息
await apiClient.sendMessage('test', 'hello');

// 两个客户端都应收到事件
const event1 = await waitForSSEEvent('message.part');
const event2 = await waitForSSEEvent('message.part');
```

**预期结果**: 多客户端同步

---

## 三、潜在问题与排查

### 3.1 连接问题

| 问题 | 症状 | 排查方法 |
|------|------|----------|
| SSE 连接失败 | `EventSource` 报错 | 检查 `/api/events` 端点是否可达 |
| CORS 错误 | 跨域被阻止 | 检查服务器 CORS 配置 |
| 心跳超时 | 连接意外断开 | 检查防火墙/代理超时设置 |

**排查命令**:
```bash
# 测试 SSE 端点
curl -N http://localhost:3000/api/events

# 检查事件流
curl -N http://localhost:3000/api/events?session=test
```

### 3.2 事件问题

| 问题 | 症状 | 排查方法 |
|------|------|----------|
| 事件不触发 | 前端收不到事件 | 检查 EventBus 是否正确发布 |
| 事件顺序错乱 | part 事件在 completed 后 | 检查事件发布顺序 |
| 事件丢失 | 部分事件未收到 | 检查订阅是否正确建立 |

**排查方法**:
```typescript
// 开启调试日志
localStorage.setItem('DEBUG_API', 'true');

// 浏览器控制台查看日志
```

### 3.3 内存泄漏

| 问题 | 症状 | 排查方法 |
|------|------|----------|
| 订阅未清理 | 订阅数量持续增长 | 检查 `/api/events/status` |
| 定时器泄漏 | 内存持续增长 | 检查 heartbeat 定时器清理 |

**排查命令**:
```bash
# 检查订阅状态
curl http://localhost:3000/api/events/status
```

### 3.4 兼容性问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| WebSocket 客户端失效 | 旧代码未迁移 | 保留 WebSocket 向后兼容 |
| 旧 API 失效 | 路由变化 | 使用 `/api/events` 替代 |

---

## 四、测试检查清单

### 4.1 功能测试

- [ ] EventBus 订阅/发布正常
- [ ] 命名空间过滤正确
- [ ] 会话过滤正确
- [ ] SSE 端点可访问
- [ ] 心跳事件正常
- [ ] 连接断开清理正常
- [ ] 前端 EventClient 连接正常
- [ ] 事件订阅/取消正常
- [ ] 自动重连正常

### 4.2 集成测试

- [ ] 消息发送-接收流程
- [ ] 权限请求流程
- [ ] 工具调用事件
- [ ] 多客户端同步

### 4.3 边界测试

- [ ] 空事件 payload
- [ ] 大量事件并发
- [ ] 网络中断恢复
- [ ] 会话快速切换

### 4.4 性能测试

- [ ] 1000+ 订阅者性能
- [ ] 事件吞吐量
- [ ] 内存使用稳定

---

## 五、回滚方案

如遇到严重问题，按以下步骤回滚：

```bash
# 1. 恢复 App.tsx
git checkout packages/app/src/App.tsx

# 2. 删除新文件
rm packages/app/src/services/event-client.ts
rm packages/server/src/routes/events.ts
rm packages/core/src/event-bus/index.ts

# 3. 恢复 streaming.ts
git checkout packages/core/src/ooda/streaming.ts

# 4. 重新构建
npm run build
```

---

## 六、监控指标

上线后监控以下指标：

| 指标 | 告警阈值 |
|------|----------|
| SSE 连接数 | > 100 |
| `/api/events` 响应时间 | > 1s |
| EventBus 订阅总数 | > 1000 |
| 事件丢失率 | > 1% |
