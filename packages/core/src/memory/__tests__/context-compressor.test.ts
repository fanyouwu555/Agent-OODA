import { describe, it, expect, beforeEach } from 'vitest';
import { ContextCompressor, CompressionConfig } from '../context-compressor';
import type { Message } from '../../types';

describe('ContextCompressor', () => {
  let compressor: ContextCompressor;

  beforeEach(() => {
    compressor = new ContextCompressor({
      maxTokens: 1000,
      preserveRecent: 5,
      enableSummarization: true,
      summarizationThreshold: 10,
    });
  });

  describe('compress', () => {
    it('should return all messages when count is below threshold', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello', timestamp: Date.now() },
        { role: 'assistant', content: 'Hi!', timestamp: Date.now() },
      ];

      const result = compressor.compress(messages);

      expect(result.recentMessages).toHaveLength(2);
      expect(result.compressedCount).toBe(0);
      expect(result.summary).toBe('');
    });

    it('should compress old messages when count exceeds threshold', () => {
      const messages: Message[] = Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: Date.now() - (15 - i) * 1000,
      }));

      const result = compressor.compress(messages);

      expect(result.recentMessages).toHaveLength(5);
      expect(result.compressedCount).toBe(10);
      expect(result.summary).not.toBe('');
    });

    it('should detect file operation topic', () => {
      const messages: Message[] = [
        { role: 'user', content: '读取文件：test.txt', timestamp: Date.now() },
        { role: 'assistant', content: '文件内容...', timestamp: Date.now() },
        { role: 'user', content: '写入文件：output.txt', timestamp: Date.now() },
        { role: 'assistant', content: '已写入', timestamp: Date.now() },
        { role: 'user', content: '删除文件：old.txt', timestamp: Date.now() },
        { role: 'assistant', content: '已删除', timestamp: Date.now() },
      ];

      const result = compressor.compress(messages);

      expect(result.summary).toContain('文件操作');
    });

    it('should detect code topic when compressed', () => {
      // 创建足够多的消息以触发压缩
      const messages: Message[] = Array.from({ length: 12 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0 ? '帮我写个函数' : '```js\nfunction test() {}\n```',
        timestamp: Date.now() - i * 1000,
      }));

      const result = compressor.compress(messages);

      // 消息数量超过阈值，会触发压缩并检测到代码主题
      expect(result.summary).toContain('代码');
    });

    it('should detect git topic when compressed', () => {
      // 创建足够多的消息以触发压缩
      const messages: Message[] = Array.from({ length: 12 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0 ? 'git status' : 'On branch main',
        timestamp: Date.now() - i * 1000,
      }));

      const result = compressor.compress(messages);

      // 消息数量超过阈值，会触发压缩并检测到 Git 主题
      expect(result.summary).toContain('版本控制');
    });

    it('should detect search topic when compressed', () => {
      // 创建足够多的消息以触发压缩
      const messages: Message[] = Array.from({ length: 12 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0 ? '搜索：AI技术' : '搜索结果...',
        timestamp: Date.now() - i * 1000,
      }));

      const result = compressor.compress(messages);

      // 消息数量超过阈值，会触发压缩并检测到搜索主题
      expect(result.summary).toContain('搜索');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello world', timestamp: Date.now() },
      ];

      const tokens = compressor.estimateTokens(messages);

      // 11 characters * 0.5 = 5.5, rounded up to 6
      expect(tokens).toBe(6);
    });

    it('should accumulate tokens for multiple messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello', timestamp: Date.now() },
        { role: 'assistant', content: 'World', timestamp: Date.now() },
      ];

      const tokens = compressor.estimateTokens(messages);

      // (5 + 5) * 0.5 = 5
      expect(tokens).toBe(5);
    });
  });

  describe('needsCompression', () => {
    it('should return false for few messages', () => {
      const messages: Message[] = Array.from({ length: 3 }, (_, i) => ({
        role: 'user',
        content: `Message ${i}`,
        timestamp: Date.now(),
      }));

      expect(compressor.needsCompression(messages)).toBe(false);
    });

    it('should return true for many messages', () => {
      const messages: Message[] = Array.from({ length: 50 }, (_, i) => ({
        role: 'user',
        content: `This is a longer message content that will exceed the token limit when there are many messages like this one. Message number ${i}`,
        timestamp: Date.now(),
      }));

      expect(compressor.needsCompression(messages)).toBe(true);
    });
  });

  describe('getCompressionStats', () => {
    it('should calculate compression stats correctly', () => {
      const messages: Message[] = Array.from({ length: 20 }, (_, i) => ({
        role: 'user',
        content: `Message ${i} with some content`,
        timestamp: Date.now(),
      }));

      const compressed = compressor.compress(messages);
      const stats = compressor.getCompressionStats(messages, compressed);

      expect(stats.compressionRatio).toBeGreaterThan(0);
      expect(stats.tokenReduction).toBeGreaterThan(0);
      expect(stats.messagesCompressed).toBe(15);
    });
  });

  describe('configuration', () => {
    it('should use default config when not provided', () => {
      const defaultCompressor = new ContextCompressor();
      
      const messages: Message[] = Array.from({ length: 15 }, (_, i) => ({
        role: 'user',
        content: `Message ${i}`,
        timestamp: Date.now(),
      }));

      const result = defaultCompressor.compress(messages);

      expect(result.recentMessages).toHaveLength(10); // default preserveRecent
    });

    it('should use custom config', () => {
      const customCompressor = new ContextCompressor({
        preserveRecent: 3,
        maxTokens: 500,
      });

      const messages: Message[] = Array.from({ length: 10 }, (_, i) => ({
        role: 'user',
        content: `Message ${i}`,
        timestamp: Date.now(),
      }));

      const result = customCompressor.compress(messages);

      expect(result.recentMessages).toHaveLength(3);
    });
  });
});
