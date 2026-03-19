# Phase 2: 结果验证扩展

> 所属项目：OODA Agent 系统重构
> 阶段序号：2/5
> 设计文档：docs/plans/2026-03-20-ooda-system-refactoring-design.md

---

## 1. 任务概述

### 1.1 目标
将硬编码的搜索结果验证扩展为可配置的验证规则系统，支持多种验证器类型（LLM/Schema/Rule）。

### 1.2 当前问题
- 验证逻辑硬编码在 `loop.ts` 的 `validateActionResult` 方法中
- 仅支持搜索工具验证
- 无法扩展新的验证规则

### 1.3 验收标准
- [ ] 定义 `ValidationRule` 接口
- [ ] 实现 `LLMValidator`, `SchemaValidator`, `RuleValidator`
- [ ] 创建 `ValidationManager` 管理验证规则
- [ ] 重构 `validateActionResult` 使用验证管理器
- [ ] 添加默认验证规则配置

---

## 2. 文件清单

### 2.1 新增文件

| 文件路径 | 描述 | 优先级 |
|----------|------|--------|
| `packages/core/src/ooda/validation/types.ts` | 验证相关类型定义 | 🔴 高 |
| `packages/core/src/ooda/validation/validators.ts` | 内置验证器实现 | 🔴 高 |
| `packages/core/src/ooda/validation/manager.ts` | 验证管理器 | 🔴 高 |
| `packages/core/src/ooda/validation/rules.ts` | 默认验证规则 | 🟡 中 |
| `packages/core/src/ooda/validation/__tests__/validators.test.ts` | 验证器测试 | 🔴 高 |
| `packages/core/src/ooda/validation/__tests__/manager.test.ts` | 管理器测试 | 🟡 中 |

### 2.2 修改文件

| 文件路径 | 修改内容 | 优先级 |
|----------|----------|--------|
| `packages/core/src/ooda/loop.ts` | 重构 validateActionResult | 🔴 高 |
| `packages/core/src/ooda/types.ts` | 添加验证相关类型 | 🟡 中 |

---

## 3. 详细实施步骤

### 3.1 Step 1: 定义验证类型

**文件**: `packages/core/src/ooda/validation/types.ts`

```typescript
// 验证上下文
interface ValidationContext {
  userInput: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  timestamp: number;
}

// 验证结果
interface ValidationResult {
  isValid: boolean;
  score: number;           // 0-1
  issues: string[];
  suggestions: string[];
  improvedContent?: string;
  metadata?: Record<string, unknown>;
}

// 验证规则
interface ValidationRule {
  id: string;
  name: string;
  toolPattern: RegExp | string[];  // 匹配的工具名称
  validator: 'llm' | 'schema' | 'rule';
  schema?: z.ZodSchema;             // 用于 schema 类型
  rule?: (result: unknown) => boolean;  // 用于 rule 类型
  llmPrompt?: string;               // 用于 llm 类型
  enabled: boolean;
  priority: number;                  // 优先级，数字越大优先级越高
}

// 验证器接口
interface ResultValidator {
  validate(
    result: unknown,
    context: ValidationContext,
    rule: ValidationRule
  ): Promise<ValidationResult>;
}
```

### 3.2 Step 2: 实现内置验证器

**文件**: `packages/core/src/ooda/validation/validators.ts`

```typescript
// LLM 验证器
class LLMValidator implements ResultValidator {
  private llmClient: LLMClient;

  async validate(
    result: unknown,
    context: ValidationContext,
    rule: ValidationRule
  ): Promise<ValidationResult> {
    // 使用 LLM 判断结果质量
    const prompt = this.buildPrompt(rule.llmPrompt!, context, result);
    const response = await this.llmClient.complete(prompt);
    return this.parseResponse(response);
  }
}

// Schema 验证器
class SchemaValidator implements ResultValidator {
  async validate(
    result: unknown,
    context: ValidationContext,
    rule: ValidationRule
  ): Promise<ValidationResult> {
    try {
      rule.schema!.parse(result);
      return { isValid: true, score: 1.0, issues: [], suggestions: [] };
    } catch (e) {
      return {
        isValid: false,
        score: 0,
        issues: [e.message],
        suggestions: ['请检查返回数据格式']
      };
    }
  }
}

// Rule 验证器
class RuleValidator implements ResultValidator {
  async validate(
    result: unknown,
    context: ValidationContext,
    rule: ValidationRule
  ): Promise<ValidationResult> {
    const passed = rule.rule!(result);
    return {
      isValid: passed,
      score: passed ? 1.0 : 0,
      issues: passed ? [] : ['规则验证失败'],
      suggestions: passed ? [] : ['请检查工具返回']
    };
  }
}
```

### 3.3 Step 3: 实现验证管理器

**文件**: `packages/core/src/ooda/validation/manager.ts`

```typescript
class ValidationManager {
  private validators: Map<string, ResultValidator> = new Map();
  private rules: ValidationRule[] = [];

  constructor() {
    // 注册内置验证器
    this.validators.set('llm', new LLMValidator());
    this.validators.set('schema', new SchemaValidator());
    this.validators.set('rule', new RuleValidator());

    // 加载默认规则
    this.rules = getDefaultValidationRules();
  }

  async validate(
    toolName: string,
    result: unknown,
    context: ValidationContext
  ): Promise<ValidationResult> {
    // 1. 匹配规则
    const matchedRule = this.matchRule(toolName);
    if (!matchedRule) {
      return { isValid: true, score: 1.0, issues: [], suggestions: [] };
    }

    // 2. 获取验证器
    const validator = this.validators.get(matchedRule.validator);
    if (!validator) {
      throw new Error(`Unknown validator: ${matchedRule.validator}`);
    }

    // 3. 执行验证
    return validator.validate(result, context, matchedRule);
  }

  private matchRule(toolName: string): ValidationRule | null {
    // 按优先级排序后匹配
    const sortedRules = [...this.rules]
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    return sortedRules.find(rule => {
      if (Array.isArray(rule.toolPattern)) {
        return rule.toolPattern.includes(toolName);
      } else if (rule.toolPattern instanceof RegExp) {
        return rule.toolPattern.test(toolName);
      }
      return rule.toolPattern === toolName;
    }) || null;
  }

  // 规则管理
  addRule(rule: ValidationRule): void;
  removeRule(id: string): void;
  enableRule(id: string): void;
  disableRule(id: string): void;
  getRules(): ValidationRule[];
}
```

### 3.4 Step 4: 定义默认验证规则

**文件**: `packages/core/src/ooda/validation/rules.ts`

```typescript
import { z } from 'zod';

export const DEFAULT_VALIDATION_RULES: ValidationRule[] = [
  {
    id: 'web-search-llm',
    name: 'Web Search LLM Validation',
    toolPattern: ['web_search', 'web_search_and_fetch', 'search_web'],
    validator: 'llm',
    llmPrompt: `请判断以下搜索结果是否满足用户需求。

用户问题：{userInput}
搜索结果：{result}

请从以下维度评估：
1. 相关性 - 结果是否与问题相关
2. 准确性 - 信息是否正确可靠
3. 完整性 - 是否包含足够的信息

请返回 JSON 格式：
{
  "isValid": boolean,
  "score": 0-1,
  "issues": string[],
  "suggestions": string[]
}`,
    enabled: true,
    priority: 10,
  },
  {
    id: 'read-file-schema',
    name: 'Read File Schema Validation',
    toolPattern: /^read_file$/,
    validator: 'schema',
    schema: z.object({
      content: z.string().optional(),
      exists: z.boolean().optional(),
      error: z.string().optional(),
    }),
    enabled: true,
    priority: 5,
  },
  {
    id: 'write-file-rule',
    name: 'Write File Rule Validation',
    toolPattern: /^write_file$/,
    validator: 'rule',
    rule: (result: unknown) => {
      const r = result as { success?: boolean };
      return r.success === true;
    },
    enabled: true,
    priority: 5,
  },
];

export function getDefaultValidationRules(): ValidationRule[] {
  return JSON.parse(JSON.stringify(DEFAULT_VALIDATION_RULES));
}
```

### 3.5 Step 5: 重构 validateActionResult

**文件**: `packages/core/src/ooda/loop.ts`

```typescript
// 之前
private async validateActionResult(
  result: ActionResult,
  decision: Decision,
  originalInput: string
): Promise<ActionResult> {
  const toolName = decision.nextAction.tool;

  // 硬编码的搜索验证
  if (this.isSearchTool(toolName)) {
    const isValid = this.checkSearchResultQuality(result.result);
    // ...
  }
  return result;
}

// 之后
private validationManager: ValidationManager;

private async validateActionResult(
  result: ActionResult,
  decision: Decision,
  originalInput: string
): Promise<ActionResult> {
  const toolName = decision.nextAction.tool;

  const validationResult = await this.validationManager.validate(
    toolName,
    result.result,
    {
      userInput: originalInput,
      toolName,
      toolArgs: decision.nextAction.args || {},
      timestamp: Date.now(),
    }
  );

  if (!validationResult.isValid) {
    // 生成改进建议
    return this.improveResult(result, validationResult, decision);
  }

  return result;
}
```

---

## 4. 测试计划

### 4.1 单元测试

```typescript
// validators.test.ts
describe('LLMValidator', () => { ... });
describe('SchemaValidator', () => { ... });
describe('RuleValidator', () => { ... });

// manager.test.ts
describe('ValidationManager', () => {
  it('should match rule by tool name');
  it('should match rule by regex');
  it('should return default for unknown tool');
  it('should handle disabled rules');
});
```

### 4.2 集成测试

```bash
# 验证 validateActionResult 重构后的行为
npm test -- --testPathPattern="ooda.test.ts"
```

---

## 5. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| LLM 验证不稳定 | 中 | 中 | 添加缓存和重试 |
| 验证规则冲突 | 低 | 中 | 优先级机制 |
| 性能下降 | 低 | 中 | 异步验证 |

---

## 6. 时间估算

| 步骤 | 预估时间 |
|------|----------|
| Step 1: 类型定义 | 1h |
| Step 2: 验证器实现 | 2h |
| Step 3: 管理器实现 | 2h |
| Step 4: 默认规则 | 1h |
| Step 5: 重构 validateActionResult | 2h |
| 测试与修复 | 2h |
| **总计** | **10h** |

---

## 7. 依赖项

- Zod（Schema 验证）
- 现有 LLMClient
- Phase 1 的 LRUCache（可选用于验证结果缓存）

---

## 8. 下游阶段

Phase 2 完成后的验证系统将支持：
- Phase 5: 适应策略的效果验证

---

*阶段负责人：待定*
*创建日期：2026-03-20*
