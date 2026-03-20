import {
  ResultValidator,
  ValidationContext,
  ValidationResult,
  ValidationRule,
  ValidationRuleOptions,
} from './types';
import { LLMValidator, SchemaValidator, RuleValidator } from './validators';

export class ValidationManager {
  private validators: Map<string, ResultValidator> = new Map();
  private rules: ValidationRule[] = [];
  private defaultRules: ValidationRule[] = [];

  constructor(customRules?: ValidationRuleOptions[]) {
    this.registerBuiltinValidators();
    this.defaultRules = this.getDefaultRules();
    this.rules = [...this.defaultRules];

    if (customRules) {
      this.addRules(customRules);
    }
  }

  private registerBuiltinValidators(): void {
    this.validators.set('llm', new LLMValidator());
    this.validators.set('schema', new SchemaValidator());
    this.validators.set('rule', new RuleValidator());
  }

  private getDefaultRules(): ValidationRule[] {
    return [
      {
        id: 'web-search-llm',
        name: 'Web Search LLM Validation',
        toolPattern: ['web_search', 'web_search_and_fetch', 'search_web', 'search'],
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
        toolPattern: ['read_file', 'ReadFile', 'file_read'],
        validator: 'schema',
        schema: undefined,
        enabled: true,
        priority: 5,
      },
      {
        id: 'write-file-rule',
        name: 'Write File Rule Validation',
        toolPattern: ['write_file', 'WriteFile', 'file_write', 'create_file'],
        validator: 'rule',
        rule: (result: unknown) => {
          const r = result as { success?: boolean; error?: string };
          return r.success !== false && !r.error;
        },
        enabled: true,
        priority: 5,
      },
      {
        id: 'grep-rule',
        name: 'Grep Rule Validation',
        toolPattern: ['grep', 'Grep', 'search_content'],
        validator: 'rule',
        rule: (result: unknown) => {
          const r = result as { matches?: unknown[]; lines?: string[] };
          return Array.isArray(r.matches) || Array.isArray(r.lines);
        },
        enabled: true,
        priority: 5,
      },
    ];
  }

  async validate(
    toolName: string,
    result: unknown,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const matchedRule = this.matchRule(toolName);

    if (!matchedRule) {
      return {
        isValid: true,
        score: 1.0,
        issues: [],
        suggestions: [],
      };
    }

    const validator = this.validators.get(matchedRule.validator);
    if (!validator) {
      return {
        isValid: false,
        score: 0,
        issues: [`Unknown validator type: ${matchedRule.validator}`],
        suggestions: ['请配置正确的验证器类型'],
      };
    }

    try {
      return await validator.validate(result, context, matchedRule);
    } catch (e) {
      const error = e as Error;
      return {
        isValid: false,
        score: 0,
        issues: [`Validation error: ${error.message}`],
        suggestions: ['请稍后重试验证'],
      };
    }
  }

  private matchRule(toolName: string): ValidationRule | null {
    const sortedRules = [...this.rules]
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.matchesPattern(toolName, rule.toolPattern)) {
        return rule;
      }
    }

    return null;
  }

  private matchesPattern(toolName: string, pattern: RegExp | string[]): boolean {
    if (Array.isArray(pattern)) {
      return pattern.some(p =>
        p.toLowerCase() === toolName.toLowerCase()
      );
    } else if (pattern instanceof RegExp) {
      return pattern.test(toolName);
    }
    return pattern === toolName;
  }

  addRule(rule: ValidationRuleOptions): void {
    const fullRule: ValidationRule = {
      id: rule.id,
      name: rule.name,
      toolPattern: rule.toolPattern,
      validator: rule.validator,
      schema: rule.schema,
      rule: rule.rule,
      llmPrompt: rule.llmPrompt,
      enabled: rule.enabled ?? true,
      priority: rule.priority ?? 5,
    };

    const existingIndex = this.rules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = fullRule;
    } else {
      this.rules.push(fullRule);
    }
  }

  addRules(rules: ValidationRuleOptions[]): void {
    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  removeRule(id: string): boolean {
    const index = this.rules.findIndex(r => r.id === id);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  enableRule(id: string): boolean {
    const rule = this.rules.find(r => r.id === id);
    if (rule) {
      rule.enabled = true;
      return true;
    }
    return false;
  }

  disableRule(id: string): boolean {
    const rule = this.rules.find(r => r.id === id);
    if (rule) {
      rule.enabled = false;
      return true;
    }
    return false;
  }

  getRules(): ValidationRule[] {
    return [...this.rules];
  }

  resetToDefaultRules(): void {
    this.rules = [...this.defaultRules];
  }

  setLLMClient(llmClient: unknown, apiKey?: string): void {
    this.validators.set('llm', new LLMValidator(llmClient, apiKey));
  }
}

export default ValidationManager;
