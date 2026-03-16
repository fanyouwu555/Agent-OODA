# OODA 四代理架构接入计划

## 1. 项目分析结果

### 1.1 OODA 使用位置

| 文件 | 使用方式 | 优先级 |
|------|----------|--------|
| `packages/server/src/routes/session.ts` | 主要入口，创建 OODALoop 实例 | **高** |
| `scripts/functional-test.ts` | 功能测试脚本 | 中 |
| `scripts/functional-test.cjs` | 功能测试脚本 | 中 |
| `tests/performance/ooda-performance-test.ts` | 性能测试 | 低 |
| `tests/streaming/streaming-demo.ts` | 流式输出演示 | 低 |

### 1.2 现有 OODALoop 接口使用情况

```typescript
// 当前使用方式
const oodaLoop = new OODALoop(sessionId);
oodaLoop.enableStreaming({ onEvent: ... }, { ... });
oodaLoop.setThinkingCallback(async (phase, type, content) => ...);
oodaLoop.runWithCallback(message, async (event) => ...);
```

### 1.3 兼容性问题

| 接口 | 现有实现 | 新架构 | 兼容性 |
|------|----------|--------|--------|
| `new OODALoop(sessionId)` | ✅ | ✅ | ✅ 兼容 |
| `enableStreaming()` | ✅ | ✅ | ✅ 兼容 |
| `setThinkingCallback()` | ✅ | ✅ | ✅ 兼容 |
| `runWithCallback()` | ✅ | ✅ | ✅ 兼容 |
| `getSessionId()` | ❌ 缺失 | 需添加 | ⚠️ 需修复 |

---

## 2. 实施方案

### Phase 1: 完善 OODALoop 兼容性 (30 分钟)

**任务**:
1. 在 `loop.ts` 中添加 `getSessionId()` 方法
2. 验证所有现有接口兼容

### Phase 2: 更新 server 入口 (30 分钟)

**任务**:
1. 更新 `session.ts` 使用新配置
2. 可选：启用新的四代理功能

### Phase 3: 更新测试脚本 (15 分钟)

**任务**:
1. 更新 `functional-test.ts`
2. 运行功能测试

### Phase 4: 清理旧代码 (可选)

**任务**:
1. 移除重复的类型定义
2. 清理未使用的文件

---

## 3. 详细任务清单

| 序号 | 任务 | 文件 | 状态 |
|------|------|------|------|
| 1 | 添加 getSessionId() 方法 | `ooda/loop.ts` | ⬜ |
| 2 | 验证 OODALoop 接口兼容 | 测试文件 | ⬜ |
| 3 | 更新 session.ts 注释 | `server/routes/session.ts` | ⬜ |
| 4 | 运行集成测试 | `tests/ooda/` | ⬜ |
| 5 | 运行功能测试 | `scripts/functional-test.ts` | ⬜ |
| 6 (可选) | 清理重复代码 | 多个文件 | ⬜ |

---

## 4. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 运行时错误 | 高 | 先运行测试验证 |
| 接口不兼容 | 中 | 添加适配器 |
| 性能下降 | 低 | 监控并优化 |

---

## 5. 实施顺序

```
1. 修复 getSessionId() → 2. 运行测试 → 3. 更新 session.ts → 4. 功能测试
```

由于新架构已经保持了与现有 OODALoop 的兼容性，大部分情况下可以直接使用。只需要：
1. 修复 `getSessionId()` 方法
2. 验证测试通过
