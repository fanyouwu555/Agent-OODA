// packages/core/src/memory/context-compressor.ts
import { Message } from '../types';

export interface CompressionConfig {
  maxTokens: number;
  preserveRecent: number;
  enableSummarization: boolean;
  summarizationThreshold: number;
}

export interface CompressedContext {
  summary: string;
  recentMessages: Message[];
  compressedCount: number;
  originalCount: number;
}

export class ContextCompressor {
  private config: CompressionConfig;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = {
      maxTokens: 4000,
      preserveRecent: 10,
      enableSummarization: true,
      summarizationThreshold: 20,
      ...config,
    };
  }

  /**
   * 压缩消息上下文
   * 当消息数量超过阈值时，将旧消息压缩为摘要
   */
  compress(messages: Message[]): CompressedContext {
    const originalCount = messages.length;

    // 如果消息数量不多，直接返回
    if (messages.length <= this.config.preserveRecent) {
      return {
        summary: '',
        recentMessages: messages,
        compressedCount: 0,
        originalCount,
      };
    }

    // 保留最近的消息
    const recentMessages = messages.slice(-this.config.preserveRecent);
    const oldMessages = messages.slice(0, -this.config.preserveRecent);

    // 压缩旧消息
    const summary = this.summarizeMessages(oldMessages);
    const compressedCount = oldMessages.length;

    return {
      summary,
      recentMessages,
      compressedCount,
      originalCount,
    };
  }

  /**
   * 将多条消息总结为摘要
   */
  private summarizeMessages(messages: Message[]): string {
    if (!this.config.enableSummarization || messages.length === 0) {
      return '';
    }

    // 按主题分组
    const topics = this.groupByTopic(messages);
    
    // 生成摘要
    const summaries: string[] = [];
    
    for (const [topic, msgs] of topics.entries()) {
      const topicSummary = this.summarizeTopic(topic, msgs);
      if (topicSummary) {
        summaries.push(topicSummary);
      }
    }

    if (summaries.length === 0) {
      return this.generateSimpleSummary(messages);
    }

    return summaries.join('\n');
  }

  /**
   * 按主题对消息进行分组
   */
  private groupByTopic(messages: Message[]): Map<string, Message[]> {
    const topics = new Map<string, Message[]>();
    let currentTopic = 'general';

    for (const msg of messages) {
      // 检测主题切换
      const newTopic = this.detectTopic(msg);
      if (newTopic) {
        currentTopic = newTopic;
      }

      if (!topics.has(currentTopic)) {
        topics.set(currentTopic, []);
      }
      topics.get(currentTopic)!.push(msg);
    }

    return topics;
  }

  /**
   * 检测消息主题
   */
  private detectTopic(message: Message): string | null {
    const content = message.content.toLowerCase();

    // 文件操作相关
    if (/文件|读取|写入|保存|file|read|write/i.test(content)) {
      return 'file_operation';
    }

    // 代码相关
    if (/代码|编程|函数|类|code|programming|function/i.test(content)) {
      return 'code';
    }

    // 搜索相关
    if (/搜索|查询|search|query/i.test(content)) {
      return 'search';
    }

    // Git 相关
    if (/git|提交|分支|commit|branch/i.test(content)) {
      return 'git';
    }

    // 分析相关
    if (/分析|统计|图表|analysis|statistics/i.test(content)) {
      return 'analysis';
    }

    return null;
  }

  /**
   * 总结特定主题的消息
   */
  private summarizeTopic(topic: string, messages: Message[]): string {
    const topicNames: Record<string, string> = {
      file_operation: '文件操作',
      code: '代码相关',
      search: '搜索查询',
      git: '版本控制',
      analysis: '数据分析',
      general: '一般对话',
    };

    const topicName = topicNames[topic] || topic;
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    // 提取关键操作
    const operations = this.extractOperations(messages);

    let summary = `[${topicName}] `;
    summary += `共 ${messages.length} 条消息`;
    
    if (operations.length > 0) {
      summary += `，涉及: ${operations.join(', ')}`;
    }

    return summary;
  }

  /**
   * 提取关键操作
   */
  private extractOperations(messages: Message[]): string[] {
    const operations = new Set<string>();

    for (const msg of messages) {
      const content = msg.content;

      // 文件操作
      if (/读取文件|read_file/i.test(content)) operations.add('文件读取');
      if (/写入文件|write_file/i.test(content)) operations.add('文件写入');
      if (/删除文件|delete_file/i.test(content)) operations.add('文件删除');

      // 代码操作
      if (/执行代码|run_code/i.test(content)) operations.add('代码执行');
      if (/分析代码|analyze_code/i.test(content)) operations.add('代码分析');

      // 搜索操作
      if (/搜索|search_web/i.test(content)) operations.add('网络搜索');

      // Git 操作
      if (/git_status/i.test(content)) operations.add('Git状态查看');
      if (/git_commit/i.test(content)) operations.add('Git提交');
      if (/git_clone/i.test(content)) operations.add('Git克隆');

      // 分析操作
      if (/数据分析|data_analysis/i.test(content)) operations.add('数据分析');
    }

    return Array.from(operations);
  }

  /**
   * 生成简单摘要
   */
  private generateSimpleSummary(messages: Message[]): string {
    const userCount = messages.filter(m => m.role === 'user').length;
    const assistantCount = messages.filter(m => m.role === 'assistant').length;

    return `历史对话摘要: ${userCount} 条用户消息, ${assistantCount} 条助手回复`;
  }

  /**
   * 估算消息的 token 数量
   */
  estimateTokens(messages: Message[]): number {
    // 简单估算：每个字符约 0.5 个 token
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars * 0.5);
  }

  /**
   * 检查是否需要压缩
   */
  needsCompression(messages: Message[]): boolean {
    if (messages.length <= this.config.preserveRecent) {
      return false;
    }

    const tokens = this.estimateTokens(messages);
    return tokens > this.config.maxTokens;
  }

  /**
   * 获取压缩统计信息
   */
  getCompressionStats(original: Message[], compressed: CompressedContext): {
    compressionRatio: number;
    tokenReduction: number;
    messagesCompressed: number;
  } {
    const originalTokens = this.estimateTokens(original);
    const compressedTokens = this.estimateTokens(compressed.recentMessages) + 
                            Math.ceil(compressed.summary.length * 0.5);

    return {
      compressionRatio: (originalTokens - compressedTokens) / originalTokens,
      tokenReduction: originalTokens - compressedTokens,
      messagesCompressed: compressed.compressedCount,
    };
  }
}

// 导出单例
let defaultCompressor: ContextCompressor | null = null;

export function getContextCompressor(config?: Partial<CompressionConfig>): ContextCompressor {
  if (!defaultCompressor) {
    defaultCompressor = new ContextCompressor(config);
  }
  return defaultCompressor;
}

export function resetContextCompressor(): void {
  defaultCompressor = null;
}
