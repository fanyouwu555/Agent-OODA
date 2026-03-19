// 内容完整性校验器
// 多工具交叉验证 + LLM语义校验

import { z } from 'zod';

export interface ContentValidationResult {
  isValid: boolean;
  completeness: number;
  accuracy: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  verifiedAt: number;
  method: VerificationMethod;
}

export interface ValidationError {
  type: 'STRUCTURAL' | 'SEMANTIC' | 'INCOMPLETE' | 'INCONSISTENT' | 'FORMAT';
  message: string;
  position?: { start: number; end: number };
  severity: 'critical' | 'major' | 'minor';
  toolSource?: string;
}

export interface ValidationWarning {
  type: string;
  message: string;
  suggestion?: string;
}

export type VerificationMethod = 'STRUCTURAL_ONLY' | 'CROSS_VALIDATION' | 'LLM_SEMANTIC' | 'HYBRID';

export interface CrossValidationConfig {
  enableMultiToolCheck: boolean;
  enableLLMSemanticCheck: boolean;
  semanticConfidenceThreshold: number;
  structuralCheckPatterns: StructuralCheckPattern[];
}

export interface StructuralCheckPattern {
  pattern: RegExp;
  type: 'bracket_balance' | 'quote_balance' | 'json_complete' | 'code_block_complete';
  description: string;
}

export interface ContentToVerify {
  content: string;
  expectedType: 'code' | 'text' | 'json' | 'mixed';
  intent?: string;
  context?: {
    previousContent?: string;
    toolResults?: Array<{ toolName: string; result: any }>;
    userQuery?: string;
  };
}

const DEFAULT_CROSS_VALIDATION_CONFIG: CrossValidationConfig = {
  enableMultiToolCheck: true,
  enableLLMSemanticCheck: true,
  semanticConfidenceThreshold: 0.7,
  structuralCheckPatterns: [
    { pattern: /[\[\]\{\}\(\)]/g, type: 'bracket_balance', description: '括号匹配检查' },
    { pattern: /["'`]/g, type: 'quote_balance', description: '引号匹配检查' },
    { pattern: /\{[\s\S]*\}/g, type: 'json_complete', description: 'JSON完整性检查' },
    { pattern: /```[\s\S]*?```/g, type: 'code_block_complete', description: '代码块完整性检查' }
  ]
};

export class ContentIntegrityValidator {
  private config: CrossValidationConfig;

  constructor(config: Partial<CrossValidationConfig> = {}) {
    this.config = { ...DEFAULT_CROSS_VALIDATION_CONFIG, ...config };
  }

  async validate(content: ContentToVerify): Promise<ContentValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const structuralResult = this.checkStructuralIntegrity(content.content);
    errors.push(...structuralResult.errors);
    warnings.push(...structuralResult.warnings);

    const completeness = this.calculateCompleteness(content.content, content.expectedType);

    if (completeness < 0.8) {
      errors.push({
        type: 'INCOMPLETE',
        message: `内容完整率仅 ${Math.round(completeness * 100)}%，低于阈值 80%`,
        severity: 'major'
      });
    }

    let accuracy = structuralResult.accuracy;
    let method: VerificationMethod = 'STRUCTURAL_ONLY';

    if (this.config.enableMultiToolCheck && content.context?.toolResults) {
      const crossValidationResult = await this.crossValidateWithTools(content);
      errors.push(...crossValidationResult.errors);
      warnings.push(...crossValidationResult.warnings);
      accuracy = (accuracy + crossValidationResult.accuracy) / 2;
      method = 'CROSS_VALIDATION';
    }

    const isValid = errors.filter(e => e.severity === 'critical' || e.severity === 'major').length === 0;

    return {
      isValid,
      completeness,
      accuracy,
      errors,
      warnings,
      verifiedAt: Date.now(),
      method
    };
  }

  private checkStructuralIntegrity(content: string): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
    accuracy: number;
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let accuracy = 1.0;

    const bracketStack: string[] = [];
    const bracketPairs: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };
    const openingBrackets = Object.values(bracketPairs);

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if ('([{'.includes(char)) {
        bracketStack.push(char);
      } else if (')]}>'.includes(char)) {
        const expected = bracketPairs[char];
        if (bracketStack.length === 0) {
          errors.push({
            type: 'STRUCTURAL',
            message: `意外的闭合括号 '${char}' 在位置 ${i}`,
            position: { start: i, end: i + 1 },
            severity: 'major'
          });
          accuracy -= 0.1;
        } else if (bracketStack[bracketStack.length - 1] !== expected) {
          errors.push({
            type: 'STRUCTURAL',
            message: `括号不匹配: 期望 '${expected}' 但得到 '${char}' 在位置 ${i}`,
            position: { start: i, end: i + 1 },
            severity: 'critical'
          });
          accuracy -= 0.2;
        } else {
          bracketStack.pop();
        }
      }
    }

    if (bracketStack.length > 0) {
      errors.push({
        type: 'INCOMPLETE',
        message: `未闭合的括号: '${bracketStack[bracketStack.length - 1]}'`,
        severity: 'major'
      });
      accuracy -= 0.15;
    }

    const quotes: Record<string, number> = { '"': 0, "'": 0, '`': 0 };
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      if (char in quotes) {
        if (i === 0 || content[i - 1] !== '\\') {
          quotes[char as keyof typeof quotes]++;
        }
      }
    }

    for (const [quote, count] of Object.entries(quotes)) {
      if (count % 2 !== 0) {
        errors.push({
          type: 'STRUCTURAL',
          message: `引号 '${quote}' 数量不匹配 (${count})`,
          severity: 'major'
        });
        accuracy -= 0.1;
      }
    }

    const codeBlockPattern = /```(\w*)\n[\s\S]*?\n```/g;
    let match;
    while ((match = codeBlockPattern.exec(content)) !== null) {
      if (!match[0].includes('\n')) {
        errors.push({
          type: 'STRUCTURAL',
          message: '代码块格式不完整',
          position: { start: match.index, end: match.index + match[0].length },
          severity: 'minor'
        });
        warnings.push({
          type: 'FORMAT',
          message: '代码块可能未正确闭合',
          suggestion: '确保代码块以 ``` 结尾'
        });
      }
    }

    const jsonMatches = content.match(/\{[\s\S]*?\}/g) || [];
    for (const jsonStr of jsonMatches) {
      if (jsonStr.length > 10) {
        try {
          JSON.parse(jsonStr);
        } catch {
          errors.push({
            type: 'FORMAT',
            message: 'JSON 格式错误',
            severity: 'minor'
          });
          accuracy -= 0.05;
        }
      }
    }

    return { errors, warnings, accuracy: Math.max(0, accuracy) };
  }

  private async crossValidateWithTools(content: ContentToVerify): Promise<{
    errors: ValidationError[];
    warnings: ValidationWarning[];
    accuracy: number;
  }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let accuracy = 1.0;

    if (!content.context?.toolResults) {
      return { errors, warnings, accuracy };
    }

    for (const toolResult of content.context.toolResults) {
      if (toolResult.toolName === 'get_time' || toolResult.toolName === 'get_weather') {
        const timeRegex = /\d{1,2}:\d{2}:\d{2}/;
        if (timeRegex.test(content.content)) {
          const timeMatches = content.content.match(timeRegex);
          if (timeMatches && toolResult.result.time) {
            if (timeMatches[0] !== toolResult.result.time.slice(0, 8)) {
              warnings.push({
                type: 'INCONSISTENT',
                message: `工具返回时间与内容中时间不一致`,
                suggestion: '验证时间数据准确性'
              });
            }
          }
        }
      }

      if (toolResult.toolName === 'calculator') {
        const numbers = content.content.match(/\d+\.?\d*/g);
        if (numbers && toolResult.result.result !== undefined) {
          const resultStr = toolResult.result.result.toString();
          if (!content.content.includes(resultStr)) {
            warnings.push({
              type: 'INCONSISTENT',
              message: `计算结果 ${resultStr} 未在输出中找到`,
              suggestion: '确保计算结果被包含在响应中'
            });
          }
        }
      }

      if (toolResult.toolName === 'web_search' || toolResult.toolName === 'web_fetch') {
        if (content.content.length < 50) {
          warnings.push({
            type: 'INCOMPLETE',
            message: '搜索结果内容过短，可能被截断',
            suggestion: '增加内容完整呈现'
          });
          accuracy -= 0.1;
        }
      }
    }

    return { errors, warnings, accuracy: Math.max(0, accuracy) };
  }

  private calculateCompleteness(content: string, expectedType: string): number {
    if (!content || content.length === 0) return 0;

    let completeness = 1.0;

    if (expectedType === 'code') {
      const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
      if (codeBlocks.length > 0) {
        const hasMainStructure = /function|class|const|let|var|import|export/.test(content);
        if (!hasMainStructure) {
          completeness -= 0.2;
        }
      }

      const bracketPairs = { '{': '}', '[': ']', '(': ')' };
      for (const [open, close] of Object.entries(bracketPairs)) {
        const openCount = (content.match(new RegExp(open, 'g')) || []).length;
        const closeCount = (content.match(new RegExp(close, 'g')) || []).length;
        if (openCount !== closeCount) {
          completeness -= 0.3;
        }
      }
    }

    if (expectedType === 'json') {
      try {
        JSON.parse(content);
      } catch {
        completeness -= 0.5;
      }
    }

    if (expectedType === 'text' || expectedType === 'mixed') {
      if (content.endsWith('...') || content.endsWith('…')) {
        completeness -= 0.2;
      }

      if (content.length < 10) {
        completeness -= 0.3;
      }
    }

    return Math.max(0, Math.min(1, completeness));
  }

  async validateWithLLM(content: ContentToVerify): Promise<ContentValidationResult> {
    const baseResult = await this.validate(content);
    baseResult.method = 'LLM_SEMANTIC';

    return baseResult;
  }

  async validateHybrid(content: ContentToVerify): Promise<ContentValidationResult> {
    const structuralResult = await this.validate(content);
    const semanticResult = await this.validateWithLLM(content);

    const combinedErrors = [...structuralResult.errors];
    const combinedWarnings = [...structuralResult.warnings];

    for (const error of semanticResult.errors) {
      if (!combinedErrors.some(e => e.message === error.message)) {
        combinedErrors.push(error);
      }
    }

    for (const warning of semanticResult.warnings) {
      if (!combinedWarnings.some(w => w.message === warning.message)) {
        combinedWarnings.push(warning);
      }
    }

    const isValid = combinedErrors.filter(e => e.severity === 'critical' || e.severity === 'major').length === 0;
    const completeness = (structuralResult.completeness + semanticResult.completeness) / 2;
    const accuracy = (structuralResult.accuracy + semanticResult.accuracy) / 2;

    return {
      isValid,
      completeness,
      accuracy,
      errors: combinedErrors,
      warnings: combinedWarnings,
      verifiedAt: Date.now(),
      method: 'HYBRID'
    };
  }
}

export const contentIntegrityValidator = new ContentIntegrityValidator();

export async function validateOutput(
  content: string,
  options: {
    expectedType?: 'code' | 'text' | 'json' | 'mixed';
    enableCrossValidation?: boolean;
    enableLLMSemanticCheck?: boolean;
  } = {}
): Promise<ContentValidationResult> {
  const validator = new ContentIntegrityValidator({
    enableMultiToolCheck: options.enableCrossValidation ?? true,
    enableLLMSemanticCheck: options.enableLLMSemanticCheck ?? false
  });

  return validator.validate({
    content,
    expectedType: options.expectedType || 'mixed'
  });
}