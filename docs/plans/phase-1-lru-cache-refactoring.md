# Phase 1: LRU 缓存系统重构

> 所属项目：OODA Agent 系统重构
> 阶段序号：1/5
> 设计文档：docs/plans/2026-03-20-ooda-system-refactoring-design.md

---

## 1. 任务概述

### 1.1 目标
将现有的简单 `Map` 缓存替换为支持 LRU（Least Recently Used）淘汰策略和 TTL（Time To Live）过期的缓存系统。

### 1.2 当前问题
- 现有缓存使用简单 `Map` 实现，无 LRU 淘汰机制
- 可能导致内存泄漏
- 无 TTL 过期支持

### 1.3 验收标准
- [ ] `LRUCache` 类正确实现 get/set/delete/evict 操作
- [ ] 缓存满时自动淘汰最久未使用的条目
- [ ] 支持 TTL 过期
- [ ] 回调函数 `onEvict` 正常工作
- [ ] 所有现有缓存调用正常迁移

---

## 2. 文件清单

### 2.1 新增文件

| 文件路径 | 描述 | 优先级 |
|----------|------|--------|
| `packages/core/src/utils/cache.ts` | LRUCache 核心实现 | 🔴 高 |
| `packages/core/src/utils/__tests__/cache.test.ts` | LRUCache 单元测试 | 🔴 高 |

### 2.2 修改文件

| 文件路径 | 修改内容 | 优先级 |
|----------|----------|--------|
| `packages/core/src/ooda/loop.ts` | 替换缓存实现为 LRUCache | 🔴 高 |
| `packages/core/src/ooda/__tests__/ooda.test.ts` | 更新缓存相关测试 | 🟡 中 |

---

## 3. 详细实施步骤

### 3.1 Step 1: 创建 LRUCache 核心类

**文件**: `packages/core/src/utils/cache.ts`

```typescript
// 核心接口定义
interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessTime: number;
}

interface LRUCacheOptions<V> {
  maxSize: number;
  ttl?: number;
  onEvict?: (key: string, value: V) => void;
}

// 实现要求：
// 1. 使用 Map 保持插入顺序
// 2. get() 时移动到尾部（最新位置）
// 3. set() 时如果 key 存在则更新值并移动到尾部
// 4. 缓存满时从头部删除（最老位置）
// 5. 检查 TTL 过期
```

**实施要点**:
1. 构造函数接收 `maxSize`, `ttl`, `onEvict` 参数
2. `evictIfNeeded()` 私有方法在设置前检查是否需要淘汰
3. `access()` 私有方法在每次访问时更新 `lastAccessTime` 并移动位置
4. `isExpired()` 方法检查条目是否超过 TTL

### 3.2 Step 2: 编写单元测试

**文件**: `packages/core/src/utils/__tests__/cache.test.ts`

```typescript
// 测试用例覆盖：
// 1. 基本 get/set 操作
// 2. LRU 淘汰验证（访问过的不会被淘汰）
// 3. TTL 过期验证
// 4. onEvict 回调触发
// 5. clear() 操作
// 6. has() 操作
// 7. delete() 操作
// 8. 边界情况（maxSize=1, ttl=0）
```

### 3.3 Step 3: 集成到 OODA Loop

**文件**: `packages/core/src/ooda/loop.ts`

**修改点 1**: 添加导入
```typescript
import { LRUCache } from '../utils/cache';
```

**修改点 2**: 替换缓存声明
```typescript
// 之前
private observationCache = new Map<string, CacheEntry<Observation>>();
private orientationCache = new Map<string, CacheEntry<Orientation>>();
private decisionCache = new Map<string, CacheEntry<Decision>>();

// 之后
private observationCache: LRUCache<string, Observation>;
private orientationCache: LRUCache<string, Orientation>;
private decisionCache: LRUCache<string, Decision>;
```

**修改点 3**: 构造函数中初始化
```typescript
this.observationCache = new LRUCache<string, Observation>({
  maxSize: this.config.cacheMaxSize || 100,
  ttl: this.config.cacheTTL || 60000,
  onEvict: (key, value) => {
    console.log(`[Cache] Observe evicted: ${key}`);
  }
});
// orientationCache, decisionCache 类似
```

**修改点 4**: 更新缓存方法
```typescript
// 查找缓存 - 之前
const cached = this.observationCache.get(cacheKey);

// 查找缓存 - 之后
const cached = this.observationCache.get(cacheKey);

// 设置缓存 - 之前
this.observationCache.set(cacheKey, { data: observation, timestamp: Date.now() });

// 设置缓存 - 之后
this.observationCache.set(cacheKey, observation);
```

---

## 4. 测试计划

### 4.1 单元测试

```bash
# 运行 LRUCache 测试
npm test -- --testPathPattern="cache.test.ts"

# 验证覆盖率
npm test -- --coverage --testPathPattern="cache.test.ts"
```

**覆盖率目标**: > 90%

### 4.2 集成测试

```bash
# 运行 OODA Loop 测试
npm test -- --testPathPattern="ooda.test.ts"
```

---

## 5. 风险与回滚

### 5.1 风险识别

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 缓存行为不一致 | 低 | 中 | 添加详细测试 |
| 性能回退 | 低 | 中 | 性能监控 |

### 5.2 回滚方案

如果出现问题，可以快速回滚到 Map 实现：
```typescript
// 临时回滚用
private observationCache = new Map<string, Observation>();
```

---

## 6. 时间估算

| 步骤 | 预估时间 | 实际时间 | 备注 |
|------|----------|----------|------|
| Step 1: LRUCache 实现 | 2h | - | |
| Step 2: 单元测试 | 1h | - | |
| Step 3: 集成到 OODA Loop | 2h | - | |
| 测试与修复 | 1h | - | |
| **总计** | **6h** | - | |

---

## 7. 依赖项

- TypeScript 4.9+
- Jest 测试框架
- 现有 `packages/core/src/ooda/loop.ts`

---

## 8. 下游阶段

Phase 1 完成后的缓存系统将支持：
- Phase 2: 结果验证的缓存
- Phase 5: 适应策略的缓存

---

*阶段负责人：待定*
*创建日期：2026-03-20*
