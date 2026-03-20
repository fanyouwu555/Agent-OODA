import { z } from 'zod';

export interface ValidationContext {
  userInput: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  timestamp: number;
}

export interface ValidationResult {
  isValid: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  improvedContent?: string;
  metadata?: Record<string, unknown>;
}

export type ValidatorType = 'llm' | 'schema' | 'rule';

export interface ValidationRule {
  id: string;
  name: string;
  toolPattern: RegExp | string[];
  validator: ValidatorType;
  schema?: z.ZodSchema;
  rule?: (result: unknown) => boolean;
  llmPrompt?: string;
  enabled: boolean;
  priority: number;
}

export interface ResultValidator {
  validate(
    result: unknown,
    context: ValidationContext,
    rule: ValidationRule
  ): Promise<ValidationResult>;
}

export interface ValidationRuleOptions {
  id: string;
  name: string;
  toolPattern: RegExp | string[];
  validator: 'llm' | 'schema' | 'rule';
  schema?: z.ZodSchema;
  rule?: (result: unknown) => boolean;
  llmPrompt?: string;
  enabled?: boolean;
  priority?: number;
}
