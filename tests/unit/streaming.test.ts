// tests/unit/streaming.test.ts
// 流式输出功能单元测试

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StreamingOutputManager,
  StreamingHandler,
  StreamingEvent,
  createConsoleStreamingHandler,
  createStringCollector,
  combineStreamingHandlers,
  defaultStreamingConfig,
} from '../../packages/core/src/ooda/streaming';
import { OODAEvent } from '../../packages/core/src/ooda/loop';

describe('Streaming Output Tests', () => {
  let events: StreamingEvent[] = [];
  let mockHandler: StreamingHandler;

  beforeEach(() => {
    events = [];
    mockHandler = {
      onEvent: async (event: StreamingEvent) => {
        events.push(event);
      },
    };
  });

  describe('StreamingOutputManager', () => {
    it('should initialize with default config', () => {
      const manager = new StreamingOutputManager(mockHandler);
      const config = manager.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.showThinking).toBe(true);
      expect(config.showProgress).toBe(true);
      expect(config.chunkSize).toBe(10);
      expect(config.delayBetweenChunks).toBe(50);
    });

    it('should accept custom config', () => {
      const manager = new StreamingOutputManager(mockHandler, {
        enabled: false,
        chunkSize: 20,
      });
      const config = manager.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.chunkSize).toBe(20);
      expect(config.showThinking).toBe(true); // 默认值
    });

    it('should handle OODA observe event', async () => {
      const manager = new StreamingOutputManager(mockHandler);
      const event: OODAEvent = { phase: 'observe' };

      await manager.handleOODAEvent(event);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('phase_start');
      expect(events[0].phase).toBe('observe');
      expect(events[0].content).toContain('观察');
    });

    it('should handle OODA orient event with intent', async () => {
      const manager = new StreamingOutputManager(mockHandler);
      const event: OODAEvent = {
        phase: 'orient',
        data: { intent: 'file_read' },
      };

      await manager.handleOODAEvent(event);

      const phaseCompleteEvents = events.filter(e => e.type === 'phase_complete');
      const phaseStartEvents = events.filter(e => e.type === 'phase_start');
      const thinkingEvents = events.filter(e => e.type === 'thinking');

      expect(phaseCompleteEvents).toHaveLength(1);
      expect(phaseStartEvents).toHaveLength(1);
      expect(thinkingEvents).toHaveLength(1);
      expect(thinkingEvents[0].content).toContain('file_read');
    });

    it('should handle OODA decide event', async () => {
      const manager = new StreamingOutputManager(mockHandler);
      const event: OODAEvent = {
        phase: 'decide',
        data: {
          reasoning: '需要读取文件',
          selectedOption: '使用 read_file',
        },
      };

      await manager.handleOODAEvent(event);

      const thinkingEvents = events.filter(e => e.type === 'thinking');
      expect(thinkingEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle OODA act event with tool call', async () => {
      const manager = new StreamingOutputManager(mockHandler);
      const event: OODAEvent = {
        phase: 'act',
        data: {
          toolCall: {
            id: '1',
            name: 'read_file',
            args: { path: 'test.txt' },
          },
        },
      };

      await manager.handleOODAEvent(event);

      const toolCallEvents = events.filter(e => e.type === 'tool_call');
      expect(toolCallEvents).toHaveLength(1);
      expect(toolCallEvents[0].metadata?.toolName).toBe('read_file');
    });

    it('should handle OODA complete event', async () => {
      const manager = new StreamingOutputManager(mockHandler);
      const event: OODAEvent = { phase: 'complete' };

      await manager.handleOODAEvent(event);

      const completeEvents = events.filter(e => e.type === 'complete');
      expect(completeEvents).toHaveLength(1);
    });

    it('should not emit events when disabled', async () => {
      const manager = new StreamingOutputManager(mockHandler, { enabled: false });
      const event: OODAEvent = { phase: 'observe' };

      await manager.handleOODAEvent(event);

      expect(events).toHaveLength(0);
    });

    it('should stream content in chunks', async () => {
      const manager = new StreamingOutputManager(mockHandler, {
        chunkSize: 5,
        delayBetweenChunks: 0, // 无延迟以加快测试
      });

      const content = 'Hello World';
      await manager.streamContent(content);

      const contentEvents = events.filter(e => e.type === 'content');
      expect(contentEvents.length).toBeGreaterThan(1);

      const fullContent = contentEvents.map(e => e.content).join('');
      expect(fullContent).toBe(content);
    });

    it('should emit progress for content streaming', async () => {
      const manager = new StreamingOutputManager(mockHandler, {
        chunkSize: 3,
        delayBetweenChunks: 0,
        showProgress: true,
      });

      await manager.streamContent('Hello');

      const contentEvents = events.filter(e => e.type === 'content');
      expect(contentEvents[contentEvents.length - 1].progress).toBe(100);
    });

    it('should not show thinking when disabled', async () => {
      const manager = new StreamingOutputManager(mockHandler, {
        showThinking: false,
      });
      const event: OODAEvent = {
        phase: 'orient',
        data: { intent: 'test' },
      };

      await manager.handleOODAEvent(event);

      const thinkingEvents = events.filter(e => e.type === 'thinking');
      expect(thinkingEvents).toHaveLength(0);
    });

    it('should emit error events', async () => {
      const manager = new StreamingOutputManager(mockHandler);
      const error = new Error('测试错误');

      await manager.emitError(error);

      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].content).toBe('测试错误');
    });

    it('should emit progress events', async () => {
      const manager = new StreamingOutputManager(mockHandler, {
        showProgress: true,
      });

      await manager.emitProgress(50, '处理中');

      const progressEvents = events.filter(e => e.type === 'phase_progress');
      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0].progress).toBe(50);
      expect(progressEvents[0].content).toBe('处理中');
    });

    it('should update config dynamically', () => {
      const manager = new StreamingOutputManager(mockHandler);

      manager.updateConfig({ chunkSize: 20 });
      const config = manager.getConfig();

      expect(config.chunkSize).toBe(20);
      expect(config.enabled).toBe(true); // 其他配置保持不变
    });
  });

  describe('createConsoleStreamingHandler', () => {
    it('should create a handler that handles all event types', async () => {
      const handler = createConsoleStreamingHandler();

      // 测试所有事件类型不会抛出错误
      const eventTypes: StreamingEvent['type'][] = [
        'phase_start',
        'phase_complete',
        'thinking',
        'content',
        'tool_call',
        'tool_result',
        'error',
        'complete',
      ];

      for (const type of eventTypes) {
        await expect(
          handler.onEvent({
            type,
            content: 'test',
            timestamp: Date.now(),
          })
        ).resolves.not.toThrow();
      }
    });
  });

  describe('createStringCollector', () => {
    it('should collect all content', async () => {
      const { handler, getOutput } = createStringCollector();

      await handler.onEvent({ type: 'content', content: 'Hello', timestamp: Date.now() });
      await handler.onEvent({ type: 'content', content: ' ', timestamp: Date.now() });
      await handler.onEvent({ type: 'content', content: 'World', timestamp: Date.now() });

      expect(getOutput()).toBe('Hello World');
    });

    it('should collect content from all events with content', async () => {
      const { handler, getOutput } = createStringCollector();

      // createStringCollector 会收集所有事件的 content
      await handler.onEvent({ type: 'phase_start', content: 'phase_', timestamp: Date.now() });
      await handler.onEvent({ type: 'content', content: 'content', timestamp: Date.now() });

      expect(getOutput()).toBe('phase_content');
    });
  });

  describe('combineStreamingHandlers', () => {
    it('should call all handlers', async () => {
      const handler1Events: StreamingEvent[] = [];
      const handler2Events: StreamingEvent[] = [];

      const handler1: StreamingHandler = {
        onEvent: async (event) => {
          handler1Events.push(event);
        },
      };

      const handler2: StreamingHandler = {
        onEvent: async (event) => {
          handler2Events.push(event);
        },
      };

      const combined = combineStreamingHandlers([handler1, handler2]);
      const event: StreamingEvent = {
        type: 'content',
        content: 'test',
        timestamp: Date.now(),
      };

      await combined.onEvent(event);

      expect(handler1Events).toHaveLength(1);
      expect(handler2Events).toHaveLength(1);
      expect(handler1Events[0].content).toBe('test');
      expect(handler2Events[0].content).toBe('test');
    });

    it('should handle empty handler array', async () => {
      const combined = combineStreamingHandlers([]);
      const event: StreamingEvent = {
        type: 'content',
        content: 'test',
        timestamp: Date.now(),
      };

      await expect(combined.onEvent(event)).resolves.not.toThrow();
    });
  });

  describe('defaultStreamingConfig', () => {
    it('should have correct default values', () => {
      expect(defaultStreamingConfig.enabled).toBe(true);
      expect(defaultStreamingConfig.showThinking).toBe(true);
      expect(defaultStreamingConfig.showProgress).toBe(true);
      expect(defaultStreamingConfig.chunkSize).toBe(10);
      expect(defaultStreamingConfig.delayBetweenChunks).toBe(50);
    });
  });
});
