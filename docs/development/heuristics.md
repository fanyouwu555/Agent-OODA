# OODA Loop 启发式规则

本文档总结了 OODA Loop 系统的启发式规则，这些规则增强了系统的智能决策能力。

## 概述

启发式规则使系统能够更好地理解和适应不同的工作场景，包括：
- 工作流模式识别
- 复杂度评估
- 上下文切换检测
- 智能错误处理

---

## Observe 阶段启发式

### 工作流模式检测

检测常见的多步骤工作流模式：

| 模式 | 描述 | 示例 |
|------|------|------|
| 文件编辑工作流 | 读取 → 修改 → 写入 | `read_file → write_file` |
| 搜索-分析工作流 | 搜索 → 分析 | `search → analysis` |
| 调试工作流 | 运行 → 错误 → 修复 | `run_bash + error → read_file` |

### 复杂度模式检测

评估当前任务的复杂度：

| 指标 | 低复杂度 | 中复杂度 | 高复杂度 |
|------|----------|----------|----------|
| 历史记录长度 | < 20 条 | 20-50 条 | > 50 条 |
| 执行步骤数 | < 5 步 | 5-10 步 | > 10 步 |
| 输入长度 | < 200 字符 | 200-500 字符 | > 500 字符 |
| 涉及文件数 | < 3 个 | 3-5 个 | > 5 个 |

### 上下文切换检测

检测用户是否频繁切换话题：

- 提取关键词进行话题识别
- 检测连续消息间的话题变化
- 识别频繁切换模式（>=2次切换）

---

## Orient 阶段启发式

### 启发式约束识别

基于观察到的模式识别额外约束：

| 约束类型 | 触发条件 | 处理策略 |
|----------|----------|----------|
| 工作流约束 | 调试模式 | 谨慎修改，保持一致性 |
| 复杂度约束 | 高复杂度任务 | 增加处理时间，分步执行 |
| 上下文切换约束 | 频繁切换话题 | 确认用户当前焦点 |
| 连续失败约束 | 连续失败 >= 3 次 | 建议改变策略 |
| 意图类型约束 | 写入/执行类操作 | 权限确认 |
| 历史长度约束 | 长对话历史 | 建议总结上下文 |

---

## Decide 阶段启发式

### 启发式决策增强

- **高权限风险检查**: 高风险命令执行前请求确认
- **连续失败处理**: 检测到连续失败时尝试简化任务
- **上下文切换确认**: 话题切换且置信度低时确认用户意图

### 任务简化策略

当检测到执行失败时，自动简化任务：

| 原任务 | 简化策略 |
|--------|----------|
| 文件读取 | 限制读取行数为 50 行 |
| 搜索查询 | 限制查询词数为 3 个 |

### 智能任务选择

基于依赖关系选择可执行的任务：
- 优先选择低风险任务（非写入/执行类）
- 优先选择读取类任务
- 基于依赖关系排序

---

## Act 阶段启发式

### 启发式错误反馈

基于错误类型提供具体建议：

| 错误类型 | 建议 |
|----------|------|
| 文件不存在 | 检查路径、使用 glob 查找 |
| 权限不足 | 检查权限设置、请求权限 |
| 文件过大 | 分块读取、使用 limit 参数 |
| 命令不存在 | 检查命令名称、确认工具安装 |
| 命令超时 | 简化命令、增加超时时间 |
| 网络问题 | 检查网络、稍后重试 |
| 频率限制 | 稍后重试、减少查询频率 |

### 启发式成功反馈

基于工具类型提供额外信息：

| 工具类型 | 反馈信息 |
|----------|----------|
| 文件读取 | 行数、字符数、JSON 有效性、导入/导出统计 |
| 文件写入 | 写入文件大小 |
| 命令执行 | 输出行数 |
| 搜索 | 结果数量 |

### 进度反馈

评估任务整体进度：

- 计算完成百分比
- 显示完成/失败任务数
- 根据进度提供不同的反馈信息

---

## 测试结果

所有单元测试均通过：

```
✓ Observe Phase Heuristics (4)
  ✓ should detect workflow pattern: read-edit-write
  ✓ should detect complexity pattern for large history
  ✓ should detect context switch pattern
  ✓ should detect debug workflow pattern

✓ Orient Phase Heuristics (2)
  ✓ should identify heuristic constraints based on patterns
  ✓ should identify consecutive failure constraint

✓ Decide Phase Heuristics (4)
  ✓ should select task by dependencies
  ✓ should prefer low-risk tasks when available
  ✓ should create simplified task for read_file on failure
  ✓ should create simplified task for search_web on failure

✓ Act Phase Heuristics (4)
  ✓ should generate heuristic error feedback for file not found
  ✓ should generate heuristic error feedback for permission denied
  ✓ should generate heuristic success feedback for file read
  ✓ should generate progress feedback correctly
```

---

## 优势

1. **增强的模式识别**: 能够识别常见的工作流模式，提供更好的上下文理解
2. **智能错误处理**: 基于错误类型提供具体的修复建议
3. **自适应决策**: 根据历史表现调整策略
4. **用户行为感知**: 检测话题切换，确保理解用户当前意图
5. **任务优化**: 智能选择任务执行顺序，优先低风险操作

---

## 未来扩展

1. 增加更多工作流模式识别（如代码审查、重构等）
2. 实现基于机器学习的模式识别
3. 增加用户偏好学习
4. 实现更复杂的任务依赖分析
5. 增加性能预测和优化建议
