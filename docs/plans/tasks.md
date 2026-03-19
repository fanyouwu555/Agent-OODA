# OODA Agent 系统重构 - 总任务清单

> 项目名称：OODA Agent 系统重构
> 方案版本：1.0.0
> 创建日期：2026-03-20
> 状态：规划中

---

## 项目概述

### 目标
对 OODA Agent 系统进行渐进式重构，解决以下高优先级问题：
1. 缓存无 LRU 淘汰策略
2. 结果验证范围有限
3. Agent/权限配置未持久化
4. 记忆过期机制未集成
5. 适应策略未实际执行

### 重构原则
- 渐进式改进，不影响现有功能
- 遵循 SOLID 原则和项目编码标准
- 避免硬编码，使用配置化方案
- 优先使用成熟库和现有组件

---

## 任务分解总览

| 阶段 | 名称 | 优先级 | 预估工时 | 风险 |
|------|------|--------|----------|------|
| Phase 1 | LRU 缓存系统重构 | 🔴 高 | 6h | 低 |
| Phase 2 | 结果验证扩展 | 🔴 高 | 10h | 中 |
| Phase 3 | 配置持久化 | 🔴 高 | 14h | 中 |
| Phase 4 | 记忆过期机制 | 🟡 中 | 8h | 低 |
| Phase 5 | 适应策略实现 | 🟡 中 | 9h | 高 |
| **总计** | | | **47h** | |

---

## Phase 1: LRU 缓存系统重构

**详细计划**: [phase-1-lru-cache-refactoring.md](./phase-1-lru-cache-refactoring.md)

### 任务清单

| ID | 任务 | 状态 | 负责人 | 备注 |
|----|------|------|--------|------|
| P1-T1 | 创建 LRUCache 核心类 | ⬜ 待开始 | | |
| P1-T2 | 编写单元测试 | ⬜ 待开始 | | 覆盖率 > 90% |
| P1-T3 | 集成到 OODA Loop | ⬜ 待开始 | | |
| P1-T4 | 更新现有测试 | ⬜ 待开始 | | |

### 产出文件

```
packages/core/src/utils/cache.ts (新增)
packages/core/src/utils/__tests__/cache.test.ts (新增)
packages/core/src/ooda/loop.ts (修改)
```

---

## Phase 2: 结果验证扩展

**详细计划**: [phase-2-result-validation-extension.md](./phase-2-result-validation-extension.md)

### 任务清单

| ID | 任务 | 状态 | 负责人 | 备注 |
|----|------|------|--------|------|
| P2-T1 | 定义验证类型 | ⬜ 待开始 | | |
| P2-T2 | 实现 LLMValidator | ⬜ 待开始 | | |
| P2-T3 | 实现 SchemaValidator | ⬜ 待开始 | | |
| P2-T4 | 实现 RuleValidator | ⬜ 待开始 | | |
| P2-T5 | 实现 ValidationManager | ⬜ 待开始 | | |
| P2-T6 | 定义默认验证规则 | ⬜ 待开始 | | |
| P2-T7 | 重构 validateActionResult | ⬜ 待开始 | | |
| P2-T8 | 编写测试 | ⬜ 待开始 | | |

### 产出文件

```
packages/core/src/ooda/validation/types.ts (新增)
packages/core/src/ooda/validation/validators.ts (新增)
packages/core/src/ooda/validation/manager.ts (新增)
packages/core/src/ooda/validation/rules.ts (新增)
packages/core/src/ooda/validation/__tests__/validators.test.ts (新增)
packages/core/src/ooda/validation/__tests__/manager.test.ts (新增)
packages/core/src/ooda/loop.ts (修改)
```

---

## Phase 3: 配置持久化

**详细计划**: [phase-3-config-persistence.md](./phase-3-config-persistence.md)

### 任务清单

| ID | 任务 | 状态 | 负责人 | 备注 |
|----|------|------|--------|------|
| P3-T1 | 创建 agent_configs 表迁移 | ⬜ 待开始 | | |
| P3-T2 | 创建 permission_configs 表迁移 | ⬜ 待开始 | | |
| P3-T3 | 实现 AgentConfigRepository | ⬜ 待开始 | | |
| P3-T4 | 实现 PermissionConfigRepository | ⬜ 待开始 | | |
| P3-T5 | 重构 agents.ts | ⬜ 待开始 | | |
| P3-T6 | 重构 permissions.ts | ⬜ 待开始 | | |
| P3-T7 | 创建数据迁移脚本 | ⬜ 待开始 | | |
| P3-T8 | 测试 CRUD 操作 | ⬜ 待开始 | | |

### 产出文件

```
packages/storage/src/migrations/003_add_agent_configs.ts (新增)
packages/storage/src/migrations/004_add_permission_configs.ts (新增)
packages/storage/src/repositories/agent-config.ts (新增)
packages/storage/src/repositories/permission-config.ts (新增)
packages/storage/src/scripts/migrate-configs.ts (新增)
packages/server/src/routes/agents.ts (修改)
packages/server/src/routes/permissions.ts (修改)
packages/server/src/index.ts (修改)
```

---

## Phase 4: 记忆过期机制

**详细计划**: [phase-4-memory-expiration.md](./phase-4-memory-expiration.md)

### 任务清单

| ID | 任务 | 状态 | 负责人 | 备注 |
|----|------|------|--------|------|
| P4-T1 | 定义 ExpirationPolicy 类型 | ⬜ 待开始 | | |
| P4-T2 | 实现 MemoryExpirationManager | ⬜ 待开始 | | |
| P4-T3 | 实现内置过期策略 | ⬜ 待开始 | | TTL/LRU/Importance/Hybrid |
| P4-T4 | 集成到 HierarchicalMemoryManager | ⬜ 待开始 | | |
| P4-T5 | 添加配置支持 | ⬜ 待开始 | | |
| P4-T6 | 编写测试 | ⬜ 待开始 | | |

### 产出文件

```
packages/core/src/memory/expiration/types.ts (新增)
packages/core/src/memory/expiration/manager.ts (新增)
packages/core/src/memory/expiration/policies.ts (新增)
packages/core/src/memory/expiration/__tests__/manager.test.ts (新增)
packages/core/src/memory/hierarchical-memory.ts (修改)
packages/core/src/memory/memory-config.ts (修改)
```

---

## Phase 5: 适应策略实现

**详细计划**: [phase-5-adaptation-strategy.md](./phase-5-adaptation-strategy.md)

### 任务清单

| ID | 任务 | 状态 | 负责人 | 备注 |
|----|------|------|--------|------|
| P5-T1 | 定义 AdaptationStrategy 类型 | ⬜ 待开始 | | |
| P5-T2 | 实现 AdaptationEngine | ⬜ 待开始 | | |
| P5-T3 | 实现内置策略 | ⬜ 待开始 | | Cache/Retry/ToolSelection/Model |
| P5-T4 | 集成到 OODA Loop | ⬜ 待开始 | | |
| P5-T5 | 实现策略效果评估 | ⬜ 待开始 | | |
| P5-T6 | 编写测试 | ⬜ 待开始 | | |

### 产出文件

```
packages/core/src/ooda/adaptation/types.ts (新增)
packages/core/src/ooda/adaptation/engine.ts (新增)
packages/core/src/ooda/adaptation/strategies.ts (新增)
packages/core/src/ooda/adaptation/__tests__/engine.test.ts (新增)
packages/core/src/ooda/loop.ts (修改)
packages/core/src/types/index.ts (修改)
```

---

## 验收标准

### 功能验收

- [ ] LRU 缓存正确淘汰最久未使用的条目
- [ ] TTL 过期正常工作
- [ ] 验证规则可配置，支持 LLM/Schema/Rule 三种验证器
- [ ] Agent 配置重启后恢复
- [ ] 权限配置重启后恢复
- [ ] 记忆过期自动清理
- [ ] 适应策略可配置，基于指标自动调整

### 性能验收

- [ ] 缓存命中时响应时间 < 100ms
- [ ] 验证执行时间 < 500ms
- [ ] 记忆无明显内存增长
- [ ] 重启后配置加载 < 2s

### 质量验收

- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试通过率 100%
- [ ] 无 TypeScript 编译错误
- [ ] ESLint 检查通过

---

## 测试计划

### 单元测试

| 阶段 | 测试文件 | 覆盖率目标 |
|------|----------|------------|
| Phase 1 | cache.test.ts | > 90% |
| Phase 2 | validators.test.ts, manager.test.ts | > 85% |
| Phase 3 | agent-config.test.ts, permission-config.test.ts | > 90% |
| Phase 4 | manager.test.ts | > 85% |
| Phase 5 | engine.test.ts | > 80% |

### 集成测试

| 测试文件 | 覆盖范围 |
|----------|----------|
| ooda.test.ts | OODA 循环完整流程 |
| integration.test.ts | 模块间交互 |

### 系统测试

| 测试场景 | 验证点 |
|----------|--------|
| 完整流程 | OODA 循环 + 缓存 + 验证 + 持久化 |
| 配置管理 | Agent 创建/修改/删除，重启后恢复 |
| 记忆系统 | 长期运行，内存稳定 |

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 数据迁移丢失 | 高 | 中 | 迁移前备份 |
| 缓存不一致 | 中 | 低 | 添加一致性检查 |
| 验证规则误判 | 中 | 低 | 添加人工审核接口 |
| 策略震荡调整 | 中 | 中 | 添加冷却期 |
| 性能回退 | 中 | 低 | 添加性能监控 |

---

## 时间线

```
Week 1:
├── Monday - Tuesday: Phase 1 (LRU 缓存)
├── Wednesday - Friday: Phase 2 (结果验证)
│
Week 2:
├── Monday - Wednesday: Phase 3 (配置持久化)
├── Thursday - Friday: Phase 4 (记忆过期)
│
Week 3:
├── Monday - Wednesday: Phase 5 (适应策略)
├── Thursday - Friday: 集成测试 & 修复
│
Week 4:
├── Monday - Tuesday: 系统测试
├── Wednesday: 性能测试
├── Thursday - Friday: 文档 & 验收
```

---

## 文档清单

| 文档 | 路径 | 状态 |
|------|------|------|
| 重构设计文档 | docs/plans/2026-03-20-ooda-system-refactoring-design.md | ✅ 已完成 |
| Phase 1 计划 | docs/plans/phase-1-lru-cache-refactoring.md | ✅ 已完成 |
| Phase 2 计划 | docs/plans/phase-2-result-validation-extension.md | ✅ 已完成 |
| Phase 3 计划 | docs/plans/phase-3-config-persistence.md | ✅ 已完成 |
| Phase 4 计划 | docs/plans/phase-4-memory-expiration.md | ✅ 已完成 |
| Phase 5 计划 | docs/plans/phase-5-adaptation-strategy.md | ✅ 已完成 |
| 本任务清单 | docs/plans/tasks.md | ✅ 本文件 |

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-03-20 | 1.0.0 | 初始版本 |

---

*任务清单版本：1.0.0*
*最后更新：2026-03-20*
