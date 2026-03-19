// 完整响应生成器 - 确保内容不被截断
// 策略：基于内容完整性检测的自动续传

import { LLMProvider, ChatMessage, StreamOptions } from './provider.js';

export interface CompleteResponseOptions {
  /** 最大允许的重试/续传次数 */
  maxContinuations?: number;
  /** 每次请求的最大token数 */
  maxTokensPerRequest?: number;
  /** 是否启用智能续传 */
  enableContinuation?: boolean;
  /** 内容类型（用于优化检测逻辑） */
  contentType?: 'code' | 'text' | 'markdown';
}

export interface CompleteResponseResult {
  /** 完整内容 */
  content: string;
  /** 是否被截断过 */
  wasTruncated: boolean;
  /** 续传次数 */
  continuationCount: number;
  /** 总token数（估算） */
  totalTokens: number;
}

export interface CompleteResponseChunk {
  /** 内容块 */
  chunk: string;
  /** 是否是新续传的开始 */
  isNewContinuation: boolean;
  /** 当前续传索引 */
  continuationIndex: number;
  /** 是否完成 */
  isComplete: boolean;
}

/**
 * 检测代码内容是否完整
 */
function isCodeComplete(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 100) return false; // 代码太短，可能不完整

  const lastChars = trimmed.slice(-200);

  // 检查代码块是否闭合
  const codeBlockMatches = trimmed.match(/```/g);
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    console.log(`[isCodeComplete] Code blocks not closed: ${codeBlockMatches.length} backticks`);
    return false;
  }

  // 检查是否有明显的截断迹象
  const incompletePatterns = [
    /\n\s*(def |class |if |for |while |try:|except|finally|with |import |from )\s*$/, // 以关键字结尾
    /[:;,]\s*$/, // 以标点结尾
    /[=+\-*/%]\s*$/, // 以运算符结尾
    /\(\s*$/, // 以开括号结尾
    /\[\s*$/, // 以开方括号结尾
    /\{\s*$/, // 以开花括号结尾
    /\\\s*$/, // 以反斜杠结尾
    /\n\s{2,}\w+$/, // 以缩进行结尾
  ];

  for (const pattern of incompletePatterns) {
    if (pattern.test(lastChars)) {
      console.log(`[isCodeComplete] Incomplete pattern detected: ${pattern}`);
      return false;
    }
  }

  // 检查是否有函数或类定义但没有内容
  const functionDefMatches = trimmed.match(/def \w+\([^)]*\):/g);
  const classDefMatches = trimmed.match(/class \w+[^(]*:/g);

  if (functionDefMatches || classDefMatches) {
    // 检查最后一个定义是否有内容
    const lastDef = trimmed.lastIndexOf('def ');
    if (lastDef > 0) {
      const afterDef = trimmed.slice(lastDef);
      const lines = afterDef.split('\n');
      if (lines.length < 2 || !lines[1].trim().startsWith(' ') && !lines[1].trim().startsWith('\t')) {
        console.log(`[isCodeComplete] Last function has no body`);
        return false;
      }
    }
  }

  // 检查是否以合适的结束方式
  const goodEndings = [
    /```\s*$/, // 以代码块结束
    /\n\s*if __name__ == ['"]__main__['"]:/, // 以 main 块开始
    /gameLoop\(\)\s*$/, // 以游戏循环调用结束
    /main\(\)\s*$/, // 以 main 调用结束
    /\n\s*\w+\([^)]*\)\s*$/, // 以函数调用结束
  ];

  for (const ending of goodEndings) {
    if (ending.test(lastChars)) {
      console.log(`[isCodeComplete] Good ending detected`);
      return true;
    }
  }

  // 默认认为不完整（对于代码）
  console.log(`[isCodeComplete] Default: incomplete`);
  return false;
}

/**
 * 检测文本内容是否完整
 */
function isTextComplete(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;

  const lastChars = trimmed.slice(-100);

  // 检查是否有合适的结束标点
  if (/[。\.!\?]\s*$/.test(lastChars)) {
    return true;
  }

  // 检查是否以标点符号结尾但未完成
  if (/[,;:]\s*$/.test(lastChars)) {
    return false;
  }

  // 默认认为完整
  return true;
}

/**
 * 流式完整响应生成器
 * 在流式输出的同时检测截断并自动续传
 */
export async function* streamCompleteResponse(
  provider: LLMProvider,
  messages: ChatMessage[],
  options?: StreamOptions & CompleteResponseOptions
): AsyncGenerator<CompleteResponseChunk, CompleteResponseResult> {
  const maxContinuations = options?.maxContinuations ?? 3;
  const maxTokensPerRequest = options?.maxTokensPerRequest ?? 2000;
  const enableContinuation = options?.enableContinuation ?? true;
  const contentType = options?.contentType ?? 'text';

  console.log(`[StreamCompleteResponse] Starting with maxContinuations=${maxContinuations}, contentType=${contentType}`);

  let fullContent = '';
  let continuationCount = 0;
  let totalTokens = 0;
  let wasTruncated = false;

  while (continuationCount <= maxContinuations) {
    // 构建当前消息
    let currentMessages = [...messages];
    if (continuationCount > 0) {
      currentMessages = [
        ...messages,
        { role: 'assistant', content: fullContent },
        { role: 'user', content: '请继续完成上面的回答，从断点处接着输出，不要重复已输出的内容。直接输出剩余部分。' },
      ];
      wasTruncated = true;
      console.log(`[StreamCompleteResponse] Continuation ${continuationCount} started, previous length: ${fullContent.length}`);
    }

    const prompt = currentMessages.map(m => `${m.role}: ${m.content}`).join('\n');
    console.log(`[StreamCompleteResponse] Request ${continuationCount + 1}/${maxContinuations + 1}, prompt length: ${prompt.length}`);

    let currentContent = '';
    let chunkCount = 0;
    let isFirstChunk = true;

    try {
      // 流式获取内容
      for await (const chunk of provider.stream(prompt, {
        ...options,
        maxTokens: maxTokensPerRequest,
      })) {
        currentContent += chunk;
        chunkCount++;
        totalTokens++;

        // 如果是续传的第一个chunk，标记为新续传开始
        if (isFirstChunk && continuationCount > 0) {
          yield {
            chunk,
            isNewContinuation: true,
            continuationIndex: continuationCount,
            isComplete: false,
          };
          isFirstChunk = false;
        } else {
          yield {
            chunk,
            isNewContinuation: false,
            continuationIndex: continuationCount,
            isComplete: false,
          };
        }
      }

      fullContent += currentContent;

      console.log(`[StreamCompleteResponse] Request ${continuationCount + 1} completed, chunks: ${chunkCount}, content length: ${currentContent.length}`);

      // 如果不启用续传，直接返回
      if (!enableContinuation) {
        console.log(`[StreamCompleteResponse] Continuation disabled`);
        yield {
          chunk: '',
          isNewContinuation: false,
          continuationIndex: continuationCount,
          isComplete: true,
        };
        break;
      }

      // 检查内容是否完整
      let isComplete = false;
      if (contentType === 'code') {
        isComplete = isCodeComplete(fullContent);
      } else {
        isComplete = isTextComplete(fullContent);
      }

      console.log(`[StreamCompleteResponse] Content completeness check: isComplete=${isComplete}, contentType=${contentType}`);

      if (isComplete || continuationCount >= maxContinuations) {
        if (isComplete) {
          console.log(`[StreamCompleteResponse] Content is complete`);
        } else {
          console.log(`[StreamCompleteResponse] Max continuations reached`);
        }
        yield {
          chunk: '',
          isNewContinuation: false,
          continuationIndex: continuationCount,
          isComplete: true,
        };
        break;
      }

      console.log(`[StreamCompleteResponse] Content incomplete, continuing (${continuationCount + 1}/${maxContinuations})...`);
      continuationCount++;

    } catch (error) {
      console.error(`[StreamCompleteResponse] Error:`, error);
      if (fullContent) {
        yield {
          chunk: '',
          isNewContinuation: false,
          continuationIndex: continuationCount,
          isComplete: true,
        };
        break;
      }
      throw error;
    }
  }

  console.log(`[StreamCompleteResponse] Final result: ${fullContent.length} chars, ${continuationCount} continuations, wasTruncated=${wasTruncated}`);

  return {
    content: fullContent,
    wasTruncated,
    continuationCount,
    totalTokens,
  };
}

/**
 * 检测内容是否完整（通用接口）
 */
export function isContentComplete(content: string, contentType: 'code' | 'text' | 'markdown' = 'text'): boolean {
  if (contentType === 'code') {
    return isCodeComplete(content);
  }
  return isTextComplete(content);
}
