// 终极响应生成器 - 彻底解决代码截断问题
// 策略：分块生成 + 强制完整性验证 + 多次重试

import { LLMProvider, ChatMessage } from './provider.js';

export interface UltimateResponseOptions {
  maxTokensPerChunk?: number;
  maxChunks?: number;
  contentType?: 'code' | 'text';
  strictCompleteness?: boolean;
}

export interface UltimateResponseResult {
  content: string;
  chunks: number;
  isComplete: boolean;
  retryCount: number;
}

/**
 * 代码结构分析器
 * 分析代码的完整性和结构
 */
class CodeStructureAnalyzer {
  /**
   * 分析代码完整性
   * 返回 0-1 的完整度分数
   */
  static analyzeCompleteness(code: string): { score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 1.0;

    // 1. 检查代码块闭合
    const codeBlocks = (code.match(/```/g) || []).length;
    if (codeBlocks % 2 !== 0) {
      issues.push('代码块未闭合');
      score -= 0.3;
    }

    // 2. 检查括号匹配
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      issues.push(`括号不匹配: ${openParens} vs ${closeParens}`);
      score -= 0.2;
    }

    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      issues.push(`花括号不匹配: ${openBraces} vs ${closeBraces}`);
      score -= 0.2;
    }

    // 3. 检查是否有未完成的定义
    const lines = code.split('\n');
    const lastNonEmptyLine = lines.filter(l => l.trim()).pop() || '';

    // 检查是否以冒号结尾（Python函数/类定义）
    if (/:\s*$/.test(lastNonEmptyLine) && !lastNonEmptyLine.includes('//') && !lastNonEmptyLine.includes('#')) {
      issues.push('定义语句未完整');
      score -= 0.25;
    }

    // 4. 检查是否有明显的截断
    const incompletePatterns = [
      { pattern: /\n(def |class |if |for |while |try:|except|with )\s*$/, desc: '以关键字结尾' },
      { pattern: /[=+\-*/%]\s*$/, desc: '以运算符结尾' },
      { pattern: /\(\s*$/, desc: '以开括号结尾' },
      { pattern: /,\s*$/, desc: '以逗号结尾' },
    ];

    for (const { pattern, desc } of incompletePatterns) {
      if (pattern.test(lastNonEmptyLine)) {
        issues.push(desc);
        score -= 0.15;
        break;
      }
    }

    // 5. 检查代码长度（太短可能不完整）
    if (code.length < 200) {
      issues.push('代码太短');
      score -= 0.1;
    }

    return { score: Math.max(0, score), issues };
  }

  /**
   * 提取代码中的未完成部分
   */
  static extractIncompletePart(code: string): string {
    const lines = code.split('\n');
    const lastLines = lines.slice(-10).join('\n');
    return lastLines;
  }

  /**
   * 生成续传提示
   */
  static generateContinuationPrompt(code: string): string {
    const { score, issues } = this.analyzeCompleteness(code);
    const lastPart = this.extractIncompletePart(code);

    let prompt = '请继续完成以下代码。';

    if (issues.length > 0) {
      prompt += `注意：${issues.join('，')}。`;
    }

    prompt += '\n\n请从以下断点继续输出（不要重复已有代码）：\n```\n';
    prompt += lastPart;
    prompt += '\n```\n\n直接输出剩余代码：';

    return prompt;
  }
}

/**
 * 终极响应生成器
 *
 * 工作流程：
 * 1. 生成第一个代码块
 * 2. 分析完整性
 * 3. 如果不完整，生成续传提示并继续
 * 4. 重复直到完整或达到最大块数
 * 5. 最终验证，如果不完整则重试
 */
export async function generateUltimateResponse(
  provider: LLMProvider,
  messages: ChatMessage[],
  options: UltimateResponseOptions = {},
  onChunk?: (chunk: string, chunkIndex: number) => Promise<void>
): Promise<UltimateResponseResult> {
  const {
    maxTokensPerChunk = 1500,
    maxChunks = 5,
    contentType = 'text',
    strictCompleteness = true,
  } = options;

  console.log(`[UltimateResponse] Starting with maxChunks=${maxChunks}, contentType=${contentType}`);

  let fullContent = '';
  let chunks = 0;
  let retryCount = 0;
  const maxRetries = 2;

  // 构建基础prompt
  const basePrompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');

  while (chunks < maxChunks) {
    console.log(`[UltimateResponse] Generating chunk ${chunks + 1}/${maxChunks}`);

    let currentPrompt: string;
    if (chunks === 0) {
      currentPrompt = basePrompt;
    } else {
      // 生成续传prompt
      currentPrompt = CodeStructureAnalyzer.generateContinuationPrompt(fullContent);
    }

    let chunkContent = '';
    let tokenCount = 0;

    try {
      // 流式生成
      for await (const chunk of provider.stream(currentPrompt, {
        maxTokens: maxTokensPerChunk,
      })) {
        chunkContent += chunk;
        tokenCount++;

        if (onChunk) {
          await onChunk(chunk, chunks);
        }
      }

      console.log(`[UltimateResponse] Chunk ${chunks + 1} generated: ${chunkContent.length} chars, ${tokenCount} tokens`);

      // 如果是续传，去除可能的重复内容
      if (chunks > 0) {
        const lastPart = CodeStructureAnalyzer.extractIncompletePart(fullContent);
        // 简单去重：如果新内容以旧内容的结尾开始，去除重复部分
        if (chunkContent.startsWith(lastPart.trim())) {
          chunkContent = chunkContent.slice(lastPart.trim().length).trim();
          console.log(`[UltimateResponse] Removed duplicate content`);
        }
      }

      fullContent += chunkContent;
      chunks++;

      // 检查完整性（仅对代码）
      if (contentType === 'code') {
        const { score, issues } = CodeStructureAnalyzer.analyzeCompleteness(fullContent);
        console.log(`[UltimateResponse] Completeness score: ${score.toFixed(2)}, issues: ${issues.join(', ')}`);

        if (score >= 0.95) {
          console.log(`[UltimateResponse] Content is complete (score >= 0.95)`);
          break;
        }

        if (chunks >= maxChunks && strictCompleteness) {
          // 达到最大块数但仍不完整，尝试重试
          if (retryCount < maxRetries) {
            console.log(`[UltimateResponse] Max chunks reached but incomplete, retrying (${retryCount + 1}/${maxRetries})`);
            retryCount++;
            chunks = 0;
            fullContent = '';
            continue;
          }
        }
      } else {
        // 文本类型，检查是否有结束标点
        const trimmed = fullContent.trim();
        if (/[。\.!\?]\s*$/.test(trimmed.slice(-50))) {
          console.log(`[UltimateResponse] Text content appears complete`);
          break;
        }
      }

    } catch (error) {
      console.error(`[UltimateResponse] Error generating chunk ${chunks + 1}:`, error);
      if (fullContent) {
        break;
      }
      throw error;
    }
  }

  // 最终验证
  let isComplete = true;
  if (contentType === 'code') {
    const { score } = CodeStructureAnalyzer.analyzeCompleteness(fullContent);
    isComplete = score >= 0.9;
  }

  console.log(`[UltimateResponse] Final result: ${fullContent.length} chars, ${chunks} chunks, isComplete=${isComplete}, retries=${retryCount}`);

  return {
    content: fullContent,
    chunks,
    isComplete,
    retryCount,
  };
}

/**
 * 快速检查内容是否完整（用于外部调用）
 */
export function checkContentCompleteness(content: string, contentType: 'code' | 'text' = 'text'): { isComplete: boolean; score: number; issues: string[] } {
  if (contentType === 'code') {
    const { score, issues } = CodeStructureAnalyzer.analyzeCompleteness(content);
    return { isComplete: score >= 0.95, score, issues };
  }

  const trimmed = content.trim();
  const isComplete = /[。\.!\?]\s*$/.test(trimmed.slice(-50));
  return { isComplete, score: isComplete ? 1.0 : 0.5, issues: isComplete ? [] : ['缺少结束标点'] };
}
