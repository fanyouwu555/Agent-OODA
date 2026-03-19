// 轻量级响应系统 - 无需LLM的快速响应
// 用于处理简单查询，避免调用LLM带来的延迟

export interface LightweightResponse {
  /** 是否可以使用轻量级响应 */
  canHandle: boolean;
  /** 响应内容 */
  response: string;
  /** 响应类型 */
  type: 'greeting' | 'confirmation' | 'farewell' | 'gratitude' | 'unknown';
  /** 置信度 */
  confidence: number;
}

/** 响应模板定义 */
interface ResponseTemplate {
  /** 匹配模式 */
  patterns: RegExp[];
  /** 响应模板数组（随机选择） */
  responses: string[];
  /** 响应类型 */
  type: LightweightResponse['type'];
}

/** 预定义的响应模板 */
const RESPONSE_TEMPLATES: ResponseTemplate[] = [
  {
    type: 'greeting',
    patterns: [
      /^hi$/i,
      /^hello$/i,
      /^hey$/i,
      /^(你好|您好)$/,
      /^(早上好|下午好|晚上好)$/,
      /^(在吗|在么)$/,
    ],
    responses: [
      '您好！有什么我可以帮助您的吗？',
      '你好！很高兴为您服务。',
      '您好！请问有什么可以帮您的？',
      '你好！有什么我可以协助您的吗？',
    ],
  },
  {
    type: 'confirmation',
    patterns: [
      /^(ok|okay|好的|知道了|明白|了解)$/i,
      /^(谢谢|感谢|多谢|谢了)$/,
      /^(是的|没错|对|正确|是的没错)$/i,
      /^(好的好的|知道了知道了)$/,
    ],
    responses: [
      '不客气！如果还有其他问题，随时告诉我。',
      '好的，有其他需要帮助的请随时说。',
      '明白！有什么其他问题吗？',
      '收到！还需要我做什么吗？',
    ],
  },
  {
    type: 'farewell',
    patterns: [
      /^(bye|goodbye|再见|拜拜|拜)$/i,
      /^(再见|再会|回头见|下次见)$/,
      /^(谢谢.*再见|再见.*谢谢)$/,
    ],
    responses: [
      '再见！祝您有愉快的一天！',
      '拜拜！有需要随时找我。',
      '再见！期待下次为您服务。',
      '好的，再见！保重！',
    ],
  },
  {
    type: 'gratitude',
    patterns: [
      /^(谢谢|感谢|多谢|谢了|感激)$/,
      /^(非常感谢|太感谢了|多谢帮助)$/,
      /^(谢谢.*帮助|感谢.*帮助)$/,
    ],
    responses: [
      '不客气！很高兴能帮到您。',
      '不用谢！这是应该的。',
      '不客气！有其他问题随时问我。',
      '很高兴能帮到你！',
    ],
  },
];

/**
 * 检查是否可以使用轻量级响应
 * 这类查询不需要LLM，可以直接返回模板响应
 */
export function getLightweightResponse(input: string): LightweightResponse {
  const trimmedInput = input.trim();

  for (const template of RESPONSE_TEMPLATES) {
    for (const pattern of template.patterns) {
      if (pattern.test(trimmedInput)) {
        // 随机选择一个响应
        const response = template.responses[Math.floor(Math.random() * template.responses.length)];
        return {
          canHandle: true,
          response,
          type: template.type,
          confidence: 0.95,
        };
      }
    }
  }

  return {
    canHandle: false,
    response: '',
    type: 'unknown',
    confidence: 0,
  };
}

/**
 * 判断查询是否需要LLM处理
 * 简单查询返回false，复杂查询返回true
 */
export function needsLLMProcessing(input: string): boolean {
  const lightweight = getLightweightResponse(input);
  return !lightweight.canHandle;
}

/**
 * 获取轻量级响应统计信息
 */
export function getLightweightStats(): {
  totalTemplates: number;
  totalPatterns: number;
  supportedTypes: string[];
} {
  const totalPatterns = RESPONSE_TEMPLATES.reduce((sum, t) => sum + t.patterns.length, 0);
  return {
    totalTemplates: RESPONSE_TEMPLATES.length,
    totalPatterns,
    supportedTypes: RESPONSE_TEMPLATES.map(t => t.type),
  };
}
