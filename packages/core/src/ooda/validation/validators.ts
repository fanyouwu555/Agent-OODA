import { ResultValidator, ValidationContext, ValidationResult, ValidationRule } from './types';
import { z } from 'zod';

export class SchemaValidator implements ResultValidator {
  async validate(
    result: unknown,
    _context: ValidationContext,
    rule: ValidationRule
  ): Promise<ValidationResult> {
    if (!rule.schema) {
      return {
        isValid: false,
        score: 0,
        issues: ['Schema validator requires a schema'],
        suggestions: ['Provide a Zod schema for validation'],
      };
    }

    try {
      rule.schema.parse(result);
      return {
        isValid: true,
        score: 1.0,
        issues: [],
        suggestions: [],
      };
    } catch (e) {
      const error = e as z.ZodError;
      const issues = error.errors.map(err =>
        `${err.path.join('.')}: ${err.message}`
      );
      return {
        isValid: false,
        score: 0,
        issues,
        suggestions: ['请检查返回数据格式是否正确'],
      };
    }
  }
}

export class RuleValidator implements ResultValidator {
  async validate(
    result: unknown,
    _context: ValidationContext,
    rule: ValidationRule
  ): Promise<ValidationResult> {
    if (!rule.rule) {
      return {
        isValid: false,
        score: 0,
        issues: ['Rule validator requires a rule function'],
        suggestions: ['Provide a validation function'],
      };
    }

    try {
      const passed = rule.rule(result);
      return {
        isValid: passed,
        score: passed ? 1.0 : 0,
        issues: passed ? [] : ['规则验证失败'],
        suggestions: passed ? [] : ['请检查工具返回是否符合预期'],
      };
    } catch (e) {
      const error = e as Error;
      return {
        isValid: false,
        score: 0,
        issues: [`规则执行错误: ${error.message}`],
        suggestions: ['修复验证规则'],
      };
    }
  }
}

export class LLMValidator implements ResultValidator {
  private llmClient: unknown;
  private apiKey?: string;

  constructor(llmClient?: unknown, apiKey?: string) {
    this.llmClient = llmClient;
    this.apiKey = apiKey;
  }

  async validate(
    result: unknown,
    context: ValidationContext,
    rule: ValidationRule
  ): Promise<ValidationResult> {
    if (!rule.llmPrompt) {
      return {
        isValid: false,
        score: 0,
        issues: ['LLM validator requires a prompt template'],
        suggestions: ['Provide an LLM prompt for validation'],
      };
    }

    const prompt = this.buildPrompt(rule.llmPrompt, context, result);

    try {
      const response = await this.callLLM(prompt);
      return this.parseResponse(response);
    } catch (e) {
      const error = e as Error;
      return {
        isValid: false,
        score: 0,
        issues: [`LLM validation failed: ${error.message}`],
        suggestions: ['请稍后重试验证'],
      };
    }
  }

  private buildPrompt(template: string, context: ValidationContext, result: unknown): string {
    const resultStr = typeof result === 'string'
      ? result
      : JSON.stringify(result, null, 2);

    return template
      .replace('{userInput}', context.userInput)
      .replace('{result}', resultStr)
      .replace('{toolName}', context.toolName);
  }

  private async callLLM(prompt: string): Promise<string> {
    if (!this.llmClient) {
      throw new Error('LLM client not configured');
    }

    const client = this.llmClient as {
      complete?: (prompt: string) => Promise<string>;
      generate?: (prompt: string) => Promise<string>;
    };

    if (client.complete) {
      return client.complete(prompt);
    } else if (client.generate) {
      return client.generate(prompt);
    } else {
      throw new Error('LLM client does not support completion');
    }
  }

  private parseResponse(response: string): ValidationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isValid: parsed.isValid ?? false,
          score: parsed.score ?? (parsed.isValid ? 1.0 : 0),
          issues: parsed.issues ?? [],
          suggestions: parsed.suggestions ?? [],
          improvedContent: parsed.improvedContent,
        };
      }

      const isValid = response.toLowerCase().includes('valid') ||
                      response.toLowerCase().includes('true') ||
                      response.toLowerCase().includes('满足');
      return {
        isValid,
        score: isValid ? 1.0 : 0,
        issues: isValid ? [] : ['LLM 判断结果不满足需求'],
        suggestions: isValid ? [] : ['请改进结果内容'],
      };
    } catch {
      return {
        isValid: false,
        score: 0,
        issues: ['无法解析 LLM 响应'],
        suggestions: ['请稍后重试验证'],
      };
    }
  }
}
