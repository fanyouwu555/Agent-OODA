// packages/core/src/ooda/streaming.ts
// OODA Loop 流式输出处理器

import { OODAEvent, OODACallback } from './loop';
import { getEventBus, BackendEvent } from '../event-bus';

/**
 * 流式输出事件类型
 */
export interface StreamingEvent {
  type: 'phase_start' | 'phase_progress' | 'phase_complete' | 'thinking' | 'content' | 'tool_call' | 'tool_result' | 'error' | 'complete';
  phase?: 'observe' | 'orient' | 'decide' | 'act';
  content?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * 流式输出处理器接口
 */
export interface StreamingHandler {
  onEvent: (event: StreamingEvent) => void | Promise<void>;
}

/**
 * 流式输出配置
 */
export interface StreamingConfig {
  enabled: boolean;
  showThinking: boolean;
  showProgress: boolean;
  chunkSize: number;
  delayBetweenChunks: number;
}

/**
 * 默认流式配置
 */
export const defaultStreamingConfig: StreamingConfig = {
  enabled: true,
  showThinking: true,
  showProgress: true,
  chunkSize: 100,
  delayBetweenChunks: 0,
};

/**
 * 流式输出管理器
 */
export class StreamingOutputManager {
  private config: StreamingConfig;
  private handler: StreamingHandler;
  private currentPhase: string | null = null;
  private buffer: string = '';
  private sessionId?: string;
  private eventBus = getEventBus();

  constructor(handler: StreamingHandler, config: Partial<StreamingConfig> = {}, sessionId?: string) {
    this.handler = handler;
    this.config = { ...defaultStreamingConfig, ...config };
    this.sessionId = sessionId;
  }

  /**
   * 将 OODA 事件转换为流式事件
   */
  async handleOODAEvent(event: OODAEvent): Promise<void> {
    if (!this.config.enabled) return;

    const timestamp = Date.now();

    switch (event.phase) {
      case 'observe':
        await this.emitPhaseStart('observe', '正在观察和理解您的请求...');
        break;

      case 'orient':
        await this.emitPhaseComplete('observe');
        await this.emitPhaseStart('orient', '正在分析上下文和意图...');
        if (event.data?.intent && this.config.showThinking) {
          await this.emitThinking(`识别到的意图: ${event.data.intent}`);
        }
        break;

      case 'decide':
        await this.emitPhaseComplete('orient');
        await this.emitPhaseStart('decide', '正在制定执行方案...');
        if (event.data?.reasoning && this.config.showThinking) {
          await this.emitThinking(`决策理由: ${event.data.reasoning}`);
        }
        if (event.data?.selectedOption && this.config.showThinking) {
          await this.emitThinking(`选择方案: ${event.data.selectedOption}`);
        }
        break;

      case 'act':
        await this.emitPhaseComplete('decide');
        await this.emitPhaseStart('act', '正在执行操作...');
        if (event.data?.toolCall) {
          await this.emitToolCall(event.data.toolCall.name, event.data.toolCall.args);
        }
        break;

      case 'tool_result':
        if (event.data?.toolCall) {
          await this.emitToolResult(
            event.data.toolCall.name,
            event.data.toolCall.result,
            event.data.toolCall.result === undefined
          );
        }
        break;

      case 'feedback':
        if (event.data?.feedback) {
          const { observations, issues, suggestions } = event.data.feedback;
          if (issues.length > 0) {
            await this.emitThinking(`⚠️  ${issues.join(', ')}`);
          }
          if (suggestions.length > 0 && this.config.showThinking) {
            await this.emitThinking(`💡 ${suggestions[0]}`);
          }
        }
        break;

      case 'adaptation':
        if (event.data?.adaptation && this.config.showThinking) {
          await this.emitThinking(`🔄 自适应调整: ${event.data.adaptation.action}`);
        }
        break;

      case 'complete':
        await this.emitPhaseComplete('act');
        await this.emitComplete();
        break;
    }
  }

  /**
   * 流式输出文本内容
   */
  async streamContent(content: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.config.enabled) return;

    // 分块输出
    const chunks = this.splitIntoChunks(content, this.config.chunkSize);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const progress = ((i + 1) / chunks.length) * 100;
      
      await this.handler.onEvent({
        type: 'content',
        content: chunk,
        progress: this.config.showProgress ? progress : undefined,
        metadata,
        timestamp: Date.now(),
      });

      // 通过 EventBus 发布消息部分事件
      if (this.sessionId) {
        this.eventBus.publish({
          id: `evt-${Date.now()}-${i}`,
          namespace: 'message',
          action: 'part',
          sessionId: this.sessionId,
          payload: {
            part: chunk,
            index: i,
            totalLength: content.length,
            isComplete: i === chunks.length - 1,
          },
          timestamp: Date.now(),
        });
      }

      // 添加延迟以模拟流式效果
      if (this.config.delayBetweenChunks > 0) {
        await this.sleep(this.config.delayBetweenChunks);
      }
    }
    
    // 消息完成事件
    if (this.sessionId) {
      this.eventBus.publish({
        id: `evt-${Date.now()}-complete`,
        namespace: 'message',
        action: 'completed',
        sessionId: this.sessionId,
        payload: {
          fullContent: content,
        },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 发射阶段开始事件
   */
  private async emitPhaseStart(phase: 'observe' | 'orient' | 'decide' | 'act', description: string): Promise<void> {
    this.currentPhase = phase;
    await this.handler.onEvent({
      type: 'phase_start',
      phase,
      content: description,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射阶段完成事件
   */
  private async emitPhaseComplete(phase: 'observe' | 'orient' | 'decide' | 'act'): Promise<void> {
    await this.handler.onEvent({
      type: 'phase_complete',
      phase,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射思考过程
   */
  private async emitThinking(content: string): Promise<void> {
    if (!this.config.showThinking) return;
    
    await this.handler.onEvent({
      type: 'thinking',
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射工具调用
   */
  private async emitToolCall(toolName: string, args: Record<string, unknown>): Promise<void> {
    await this.handler.onEvent({
      type: 'tool_call',
      content: `🔧 使用工具: ${toolName}`,
      metadata: { toolName, args },
      timestamp: Date.now(),
    });
  }

  /**
   * 发射工具执行结果
   */
  private async emitToolResult(toolName: string, result: unknown, isError: boolean): Promise<void> {
    await this.handler.onEvent({
      type: 'tool_result',
      content: isError ? `❌ 工具执行失败: ${toolName}` : `✅ 工具执行完成: ${toolName}`,
      metadata: { toolName, result, isError },
      timestamp: Date.now(),
    });
  }

  /**
   * 发射完成事件
   */
  private async emitComplete(): Promise<void> {
    await this.handler.onEvent({
      type: 'complete',
      timestamp: Date.now(),
    });
  }

  /**
   * 发射错误事件
   */
  async emitError(error: Error): Promise<void> {
    await this.handler.onEvent({
      type: 'error',
      content: error.message,
      timestamp: Date.now(),
    });
  }

  /**
   * 发射进度更新
   */
  async emitProgress(progress: number, message?: string): Promise<void> {
    if (!this.config.showProgress) return;
    
    await this.handler.onEvent({
      type: 'phase_progress',
      progress,
      content: message,
      timestamp: Date.now(),
    });
  }

  /**
   * 将文本分割成块
   */
  private splitIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<StreamingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): StreamingConfig {
    return { ...this.config };
  }
}

/**
 * 创建控制台流式处理器
 */
export function createConsoleStreamingHandler(): StreamingHandler {
  return {
    onEvent: async (event: StreamingEvent) => {
      const timestamp = new Date(event.timestamp).toLocaleTimeString();
      
      switch (event.type) {
        case 'phase_start':
          console.log(`\n[${timestamp}] 🔍 ${event.content}`);
          break;
        case 'phase_complete':
          console.log(`[${timestamp}] ✓ ${event.phase} 阶段完成`);
          break;
        case 'thinking':
          console.log(`[${timestamp}] 💭 ${event.content}`);
          break;
        case 'content':
          process.stdout.write(event.content || '');
          if (event.progress === 100) {
            process.stdout.write('\n');
          }
          break;
        case 'tool_call':
          console.log(`[${timestamp}] ${event.content}`);
          break;
        case 'tool_result':
          console.log(`[${timestamp}] ${event.content}`);
          break;
        case 'error':
          console.error(`[${timestamp}] ❌ 错误: ${event.content}`);
          break;
        case 'complete':
          console.log(`\n[${timestamp}] ✅ 处理完成\n`);
          break;
      }
    },
  };
}

/**
 * 创建字符串收集器（用于测试）
 */
export function createStringCollector(): { handler: StreamingHandler; getOutput: () => string } {
  let output = '';
  
  return {
    handler: {
      onEvent: async (event: StreamingEvent) => {
        if (event.content) {
          output += event.content;
        }
      },
    },
    getOutput: () => output,
  };
}

/**
 * 组合多个流式处理器
 */
export function combineStreamingHandlers(handlers: StreamingHandler[]): StreamingHandler {
  return {
    onEvent: async (event: StreamingEvent) => {
      await Promise.all(handlers.map(handler => handler.onEvent(event)));
    },
  };
}
