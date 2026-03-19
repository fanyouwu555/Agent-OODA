// packages/core/src/ooda/prompt-registry.ts
// Prompt模板注册表 - 可配置的Prompt管理系统

import { ChatMessage } from '../llm/provider.js';

export interface PromptTemplate {
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  maxTokens: number;
  description?: string;
}

export interface PromptContext {
  input: string;
  history?: ChatMessage[];
  toolResult?: any;
  formattedToolResult?: string;
  intentType?: string;
}

export class PromptBuilder {
  build(template: PromptTemplate, context: PromptContext): { messages: ChatMessage[]; maxTokens: number } {
    const { input, history = [], toolResult, formattedToolResult } = context;

    const messages: ChatMessage[] = [];

    // 添加系统提示
    messages.push({
      role: 'system',
      content: template.systemPrompt,
    });

    // 添加历史消息（如果模板需要）
    if (history.length > 0) {
      const recentHistory = history.slice(-3).filter(msg => {
        if (template.name.includes('greeting') || template.name.includes('confirmation') || template.name.includes('farewell')) {
          return msg.role === 'user';
        }
        return true;
      });

      for (const msg of recentHistory) {
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      }
    }

    // 构建用户消息
    let userContent = template.userPromptTemplate
      .replace('{input}', input)
      .replace('{toolResult}', toolResult ? (typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)) : '')
      .replace('{formattedToolResult}', formattedToolResult || '')
      .replace('{intentType}', context.intentType || '');

    messages.push({
      role: 'user',
      content: userContent,
    });

    return {
      messages,
      maxTokens: template.maxTokens,
    };
  }
}

export class PromptTemplateRegistry {
  private templates: Map<string, PromptTemplate> = new Map();
  private builder: PromptBuilder = new PromptBuilder();

  register(template: PromptTemplate): void {
    this.templates.set(template.name, template);
  }

  get(name: string): PromptTemplate | null {
    return this.templates.get(name) || null;
  }

  has(name: string): boolean {
    return this.templates.has(name);
  }

  buildPrompt(name: string, context: PromptContext): { messages: ChatMessage[]; maxTokens: number } | null {
    const template = this.get(name);
    if (!template) {
      return null;
    }
    return this.builder.build(template, context);
  }

  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  clear(): void {
    this.templates.clear();
  }
}

// 创建默认的Prompt模板注册表
export function createDefaultPromptRegistry(): PromptTemplateRegistry {
  const registry = new PromptTemplateRegistry();

  // 简单问候模板
  registry.register({
    name: 'greeting',
    systemPrompt: '你是AI助手。用一句话友好回应问候。',
    userPromptTemplate: '{input}',
    maxTokens: 100,
    description: '问候响应',
  });

  // 确认/感谢模板
  registry.register({
    name: 'confirmation',
    systemPrompt: '你是AI助手。礼貌回应用户的确认或感谢，一句话。',
    userPromptTemplate: '{input}',
    maxTokens: 80,
    description: '确认/感谢响应',
  });

  // 告别模板
  registry.register({
    name: 'farewell',
    systemPrompt: '你是AI助手。友好道别，一句话。',
    userPromptTemplate: '{input}',
    maxTokens: 80,
    description: '告别响应',
  });

  // 时间查询模板
  registry.register({
    name: 'realtime_time',
    systemPrompt: '你是AI助手。规则：1) 只输出日期或时间，不要其他内容；2) 按格式"YYYY年MM月DD日"或"HH:MM"输出；3) 不要解释，不要复述问题。',
    userPromptTemplate: '数据：{formattedToolResult}\n问题：{input}\n按规则输出日期或时间。',
    maxTokens: 30,
    description: '时间查询响应（direct模式）',
  });

  // 天气查询模板
  registry.register({
    name: 'realtime_weather',
    systemPrompt: '你是AI助手。直接描述天气状况，例如："北京今天晴天，气温15到25度"。不要复述工具结果，不要添加额外解释。',
    userPromptTemplate: '问题：{input}\n数据：{formattedToolResult}',
    maxTokens: 100,
    description: '天气查询响应',
  });

  // 黄金价格模板
  registry.register({
    name: 'realtime_gold',
    systemPrompt: '你是AI助手。直接报出黄金价格，例如："当前黄金价格是2020美元/盎司"。不要复述工具结果。',
    userPromptTemplate: '问题：{input}\n数据：{formattedToolResult}',
    maxTokens: 100,
    description: '黄金价格响应',
  });

  // 股票价格模板
  registry.register({
    name: 'realtime_stock',
    systemPrompt: '你是AI助手。直接报出股票价格，例如："苹果(AAPL)当前股价是180美元"。不要复述工具结果。',
    userPromptTemplate: '问题：{input}\n数据：{formattedToolResult}',
    maxTokens: 100,
    description: '股票价格响应',
  });

  // 加密货币模板
  registry.register({
    name: 'realtime_crypto',
    systemPrompt: '你是AI助手。直接报出加密货币价格，例如："比特币当前价格是50000美元"。不要复述工具结果。',
    userPromptTemplate: '问题：{input}\n数据：{formattedToolResult}',
    maxTokens: 100,
    description: '加密货币价格响应',
  });

  // 新闻模板
  registry.register({
    name: 'realtime_news',
    systemPrompt: '你是AI助手。根据新闻内容简洁回答用户问题。',
    userPromptTemplate: '问题：{input}\n新闻内容：{formattedToolResult}',
    maxTokens: 300,
    description: '新闻响应',
  });

  // 文件读取模板
  registry.register({
    name: 'file_read',
    systemPrompt: '你是AI助手。根据文件内容简洁回答用户问题。',
    userPromptTemplate: '问题：{input}\n文件内容：{formattedToolResult}',
    maxTokens: 400,
    description: '文件读取响应',
  });

  // 文件写入模板
  registry.register({
    name: 'file_write',
    systemPrompt: '你是AI助手。确认文件写入操作结果。',
    userPromptTemplate: '问题：{input}\n操作结果：{formattedToolResult}',
    maxTokens: 200,
    description: '文件写入响应',
  });

  // 搜索模板
  registry.register({
    name: 'search',
    systemPrompt: '你是AI助手。根据搜索结果简洁回答用户问题。',
    userPromptTemplate: '问题：{input}\n搜索结果：{formattedToolResult}',
    maxTokens: 500,
    description: '搜索响应',
  });

  // 代码生成模板
  registry.register({
    name: 'code',
    systemPrompt: '你是编程助手。提供完整、可运行的代码，确保代码格式正确。用代码块包裹代码，不要添加额外解释。',
    userPromptTemplate: '{input}',
    maxTokens: 2000,
    description: '代码生成',
  });

  // 通用工具结果模板
  registry.register({
    name: 'general_with_tool',
    systemPrompt: '你是AI助手。根据工具执行结果直接回答问题。规则：1) 直接输出答案，不要重复问题；2) 不要复述工具返回的数据；3) 用自然语言表述答案。例如：工具返回"时间：11:55"，回答"现在是上午11点55分"。',
    userPromptTemplate: '问题：{input}\n工具结果：{formattedToolResult}',
    maxTokens: 500,
    description: '通用工具结果响应',
  });

  // 默认通用模板
  registry.register({
    name: 'general',
    systemPrompt: '你是AI助手。请完整、准确地回答用户问题。只回答当前问题，不要重复或续写历史对话。',
    userPromptTemplate: '{input}',
    maxTokens: 1500,
    description: '默认通用响应',
  });

  return registry;
}

// 全局注册表实例
let globalRegistry: PromptTemplateRegistry | null = null;

export function getPromptRegistry(): PromptTemplateRegistry {
  if (!globalRegistry) {
    globalRegistry = createDefaultPromptRegistry();
  }
  return globalRegistry;
}

export function resetPromptRegistry(): void {
  globalRegistry = null;
}
