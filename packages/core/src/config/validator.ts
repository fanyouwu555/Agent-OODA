// packages/core/src/config/validator.ts
// 环境变量校验工具

export interface EnvValidationRule {
  name: string;
  required: boolean;
  default?: string;
  validate?: (value: string) => boolean;
  description?: string;
}

export const ENV_SCHEMA: EnvValidationRule[] = [
  // 必需的环境变量
  {
    name: 'DB_PATH',
    required: true,
    default: './data/agent.db',
    description: 'SQLite 数据库文件路径',
  },
  // 可选的环境变量
  {
    name: 'DEFAULT_PROVIDER',
    required: false,
    default: 'ollama',
    validate: (v) => ['ollama', 'kimi', 'openai', 'openai-compatible'].includes(v),
    description: '默认 LLM 提供商',
  },
  {
    name: 'DEFAULT_MODEL',
    required: false,
    default: 'qwen3:8b',
    description: '默认模型名称',
  },
  {
    name: 'PORT',
    required: false,
    default: '3000',
    validate: (v) => !isNaN(parseInt(v)) && parseInt(v) > 0 && parseInt(v) < 65536,
    description: '服务器端口',
  },
  {
    name: 'LOG_LEVEL',
    required: false,
    default: 'info',
    validate: (v) => ['debug', 'info', 'warn', 'error'].includes(v),
    description: '日志级别',
  },
  {
    name: 'ENABLE_EMBEDDING',
    required: false,
    default: 'true',
    validate: (v) => ['true', 'false'].includes(v.toLowerCase()),
    description: '是否启用向量嵌入',
  },
  {
    name: 'CONFIRMATION_TIMEOUT_MS',
    required: false,
    default: '60000',
    validate: (v) => !isNaN(parseInt(v)) && parseInt(v) > 0,
    description: '权限确认超时时间(毫秒)',
  },
  {
    name: 'AGENT_TIMEOUT_MS',
    required: false,
    default: '300000',
    validate: (v) => !isNaN(parseInt(v)) && parseInt(v) > 0,
    description: 'Agent 执行超时时间(毫秒)',
  },
];

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ name: string; message: string }>;
  warnings: Array<{ name: string; message: string }>;
}

export function validateEnvironment(): ValidationResult {
  const errors: Array<{ name: string; message: string }> = [];
  const warnings: Array<{ name: string; message: string }> = [];

  for (const rule of ENV_SCHEMA) {
    const value = process.env[rule.name];

    // 检查必需的环境变量
    if (rule.required && !value) {
      if (rule.default) {
        warnings.push({
          name: rule.name,
          message: `未设置 ${rule.name}，将使用默认值: ${rule.default}`,
        });
      } else {
        errors.push({
          name: rule.name,
          message: `必需的环境变量 ${rule.name} 未设置`,
        });
      }
      continue;
    }

    // 验证值
    if (value && rule.validate && !rule.validate(value)) {
      errors.push({
        name: rule.name,
        message: `环境变量 ${rule.name} 的值 "${value}" 无效${
          rule.description ? ` (${rule.description})` : ''
        }`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function logValidationResult(result: ValidationResult): void {
  if (result.warnings.length > 0) {
    console.warn('[Config] 环境变量警告:');
    result.warnings.forEach((w) => console.warn(`  - ${w.name}: ${w.message}`));
  }

  if (result.errors.length > 0) {
    console.error('[Config] 环境变量错误:');
    result.errors.forEach((e) => console.error(`  - ${e.name}: ${e.message}`));
  }

  if (result.valid) {
    console.log('[Config] 环境变量校验通过');
  }
}

export default { ENV_SCHEMA, validateEnvironment, logValidationResult };
