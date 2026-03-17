// packages/server/src/utils/sensitive-data-filter.ts
// 日志敏感信息过滤工具

/**
 * 敏感关键词列表
 */
const SENSITIVE_KEYS = [
  'apiKey',
  'api_key',
  'apikey',
  'password',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'private_key',
  'private-key',
  'session_id',
  'sessionId',
  'credential',
  'auth',
];

/**
 * 敏感值模式
 */
const SENSITIVE_PATTERNS = [
  /^[A-Za-z0-9_-]{32,}$/, // 长随机字符串（可能是 token）
  /^sk-/, // OpenAI API Key 格式
  /^eyJ/, // JWT Token 格式
];

/**
 * 检查键名是否敏感
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitiveKey) =>
    lowerKey.includes(sensitiveKey.toLowerCase())
  );
}

/**
 * 检查值是否敏感
 */
function isSensitiveValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
  }
  return false;
}

/**
 * 递归过滤对象中的敏感信息
 */
export function sanitizeForLogging(obj: unknown): unknown {
  // 基本类型直接返回
  if (obj === null || obj === undefined) {
    return obj;
  }

  // 字符串直接返回
  if (typeof obj === 'string') {
    return obj;
  }

  // 数字、布尔值直接返回
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  // 数组处理
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLogging(item));
  }

  // 对象处理
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // 检查键名是否敏感
      if (isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
        continue;
      }

      // 递归处理值
      const sanitizedValue = sanitizeForLogging(value);

      // 检查值是否敏感
      if (isSensitiveValue(sanitizedValue)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizedValue;
      }
    }

    return result;
  }

  return obj;
}

/**
 * 快速过滤（只检查顶层键名）
 */
export function sanitizeQuick(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * 创建日志过滤辅助函数
 */
export function createLogSanitizer() {
  return {
    /**
     * 过滤日志参数
     */
    sanitize: sanitizeForLogging,

    /**
     * 快速过滤（性能更好）
     */
    sanitizeQuick,

    /**
     * 过滤工具参数
     */
    sanitizeToolArgs: (toolName: string, args: unknown) => {
      if (typeof args === 'object' && args !== null) {
        return sanitizeForLogging({ toolName, ...(args as Record<string, unknown>) });
      }
      return { toolName, args };
    },

    /**
     * 过滤错误对象
     */
    sanitizeError: (error: unknown) => {
      if (error instanceof Error) {
        return {
          name: error.name,
          message: error.message,
          // 不记录堆栈跟踪中的敏感信息
        };
      }
      return sanitizeForLogging(error);
    },
  };
}

export default {
  sanitizeForLogging,
  sanitizeQuick,
  createLogSanitizer,
};
