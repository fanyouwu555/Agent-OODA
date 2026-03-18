// packages/core/src/ooda/error-classifier.ts
// 错误分类器 - 根据错误信息自动分类错误类型

/**
 * 错误分类
 */
export enum ErrorCategory {
  NETWORK_TIMEOUT = 'network_timeout',       // 网络超时
  NETWORK_CONNECTION_ERROR = 'network_connection_error', // 网络连接错误
  ACCESS_DENIED_403 = 'access_denied_403', // 访问被拒绝 (403)
  ACCESS_DENIED_IP = 'access_denied_ip',   // IP 被封
  CONTENT_NOT_FOUND_404 = 'content_not_found_404', // 内容不存在
  CONTENT_EMPTY = 'content_empty',         // 内容为空
  RATE_LIMIT = 'rate_limit',               // 请求频率限制
  SERVER_ERROR_5XX = 'server_error_5xx',  // 服务器错误
  PARSE_ERROR = 'parse_error',              // 解析错误
  AUTH_ERROR = 'auth_error',                // 认证错误
  QUOTA_EXCEEDED = 'quota_exceeded',       // 配额超限
  UNKNOWN = 'unknown',                      // 未知错误
}

/**
 * 分类后的错误信息
 */
export interface ClassifiedError {
  category: ErrorCategory;
  originalMessage: string;
  confidence: number;        // 分类置信度 0-1
  recoverable: boolean;     // 是否可恢复
  retryRecommended: boolean; // 是否建议重试
  details?: string;         // 额外详情
}

/**
 * 错误模式匹配规则
 */
interface ErrorPattern {
  pattern: RegExp;
  category: ErrorCategory;
  confidence: number;
  recoverable: boolean;
  retryRecommended: boolean;
}

/**
 * 默认错误模式匹配规则
 */
const DEFAULT_ERROR_PATTERNS: ErrorPattern[] = [
  // 网络超时
  {
    pattern: /timeout|timed?\s*out|ETIMEDOUT/i,
    category: ErrorCategory.NETWORK_TIMEOUT,
    confidence: 0.95,
    recoverable: true,
    retryRecommended: true,
  },
  // 网络连接错误
  {
    pattern: /ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|connection\s+(refused|reset|failed)|网络\s*异常|连接\s*失败/i,
    category: ErrorCategory.NETWORK_CONNECTION_ERROR,
    confidence: 0.9,
    recoverable: true,
    retryRecommended: true,
  },
  // 403 访问拒绝
  {
    pattern: /403|forbidden|access\s*denied|禁止\s*访问|无权\s*访问/i,
    category: ErrorCategory.ACCESS_DENIED_403,
    confidence: 0.95,
    recoverable: false,
    retryRecommended: false,
  },
  // IP 被封
  {
    pattern: /blocked|banned|ip\s*(block|ban)|封禁|封IP|限制\s*访问/i,
    category: ErrorCategory.ACCESS_DENIED_IP,
    confidence: 0.9,
    recoverable: false,
    retryRecommended: false,
  },
  // 404 内容不存在
  {
    pattern: /404|not\s*found|不存在|未找到|页面\s*不存在/i,
    category: ErrorCategory.CONTENT_NOT_FOUND_404,
    confidence: 0.95,
    recoverable: false,
    retryRecommended: false,
  },
  // 内容为空
  {
    pattern: /empty|无内容|内容为空|no\s*(content|data|result)|返回\s*空/i,
    category: ErrorCategory.CONTENT_EMPTY,
    confidence: 0.8,
    recoverable: true,
    retryRecommended: true,
  },
  // 频率限制
  {
    pattern: /rate\s*limit|429|too\s*many\s*requests|请求\s*频繁|限制\s*请求|frequency\s*limit/i,
    category: ErrorCategory.RATE_LIMIT,
    confidence: 0.95,
    recoverable: true,
    retryRecommended: true,
  },
  // 5XX 服务器错误
  {
    pattern: /50[0-9]|502|503|504|server\s*error|服务器\s*错误|服务\s*不可用/i,
    category: ErrorCategory.SERVER_ERROR_5XX,
    confidence: 0.9,
    recoverable: true,
    retryRecommended: true,
  },
  // 解析错误
  {
    pattern: /parse|解析\s*失败|invalid\s*(json|xml|html)|格式\s*错误/i,
    category: ErrorCategory.PARSE_ERROR,
    confidence: 0.85,
    recoverable: false,
    retryRecommended: false,
  },
  // 认证错误
  {
    pattern: /401|unauthorized|auth.*fail|认证\s*失败|登录\s*失败|api\s*key.*invalid/i,
    category: ErrorCategory.AUTH_ERROR,
    confidence: 0.9,
    recoverable: false,
    retryRecommended: false,
  },
  // 配额超限
  {
    pattern: /quota|配额|超出\s*限制|exceed|limit\s*exceeded|每日\s*次数/i,
    category: ErrorCategory.QUOTA_EXCEEDED,
    confidence: 0.85,
    recoverable: false,
    retryRecommended: false,
  },
];

/**
 * 错误分类器
 */
export class ErrorClassifier {
  private patterns: ErrorPattern[];
  private customPatterns: ErrorPattern[] = [];

  constructor(customPatterns: ErrorPattern[] = []) {
    this.patterns = [...DEFAULT_ERROR_PATTERNS, ...customPatterns];
  }

  /**
   * 添加自定义错误模式
   */
  addPattern(pattern: ErrorPattern): void {
    this.customPatterns.push(pattern);
    this.patterns = [...DEFAULT_ERROR_PATTERNS, ...this.customPatterns];
  }

  /**
   * 分类错误
   */
  classify(error: unknown): ClassifiedError {
    const message = this.extractErrorMessage(error);

    // 尝试匹配模式
    for (const rule of this.patterns) {
      if (rule.pattern.test(message)) {
        return {
          category: rule.category,
          originalMessage: message,
          confidence: rule.confidence,
          recoverable: rule.recoverable,
          retryRecommended: rule.retryRecommended,
          details: this.extractDetails(message),
        };
      }
    }

    // 默认未知错误
    return {
      category: ErrorCategory.UNKNOWN,
      originalMessage: message,
      confidence: 0.5,
      recoverable: false,
      retryRecommended: false,
    };
  }

  /**
   * 批量分类
   */
  classifyMultiple(errors: unknown[]): ClassifiedError[] {
    return errors.map(e => this.classify(e));
  }

  /**
   * 判断是否可恢复
   */
  isRecoverable(error: unknown): boolean {
    return this.classify(error).recoverable;
  }

  /**
   * 判断是否建议重试
   */
  shouldRetry(error: unknown): boolean {
    const classified = this.classify(error);
    return classified.retryRecommended;
  }

  /**
   * 获取错误类别
   */
  getCategory(error: unknown): ErrorCategory {
    return this.classify(error).category;
  }

  /**
   * 从错误对象中提取消息字符串
   */
  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;
      
      // 尝试各种可能的字段
      const message = e.message as string;
      if (message) return message;
      
      const error_msg = e.error as string;
      if (error_msg) return error_msg;
      
      const msg = e.msg as string;
      if (msg) return msg;
      
      const result = e.result;
      if (typeof result === 'string') return result;
      
      // 整个对象转字符串
      return JSON.stringify(e);
    }

    return String(error);
  }

  /**
   * 提取额外详情
   */
  private extractDetails(message: string): string | undefined {
    // 提取 HTTP 状态码
    const statusMatch = message.match(/(\d{3})\s*(error|错误)?/);
    if (statusMatch) {
      return `HTTP ${statusMatch[1]}`;
    }

    // 提取超时时间
    const timeoutMatch = message.match(/(\d+)\s*(ms|秒|s)/i);
    if (timeoutMatch) {
      return `Timeout: ${timeoutMatch[1]}${timeoutMatch[2]}`;
    }

    return undefined;
  }
}

// 单例
let errorClassifier: ErrorClassifier | null = null;

export function getErrorClassifier(): ErrorClassifier {
  if (!errorClassifier) {
    errorClassifier = new ErrorClassifier();
  }
  return errorClassifier;
}
