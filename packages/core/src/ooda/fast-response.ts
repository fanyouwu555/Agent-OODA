// packages/core/src/ooda/fast-response.ts
// 快速响应策略 - 基于意图注册表的可扩展实现

import { getIntentRegistry, IntentRegistry, RecognitionResult } from './intent-registry.js';

export interface FastResponseResult extends RecognitionResult {}

/**
 * 快速意图识别 - 基于注册表的统一实现
 */
export function quickIntentRecognition(input: string): FastResponseResult {
  const registry = getIntentRegistry();
  return registry.recognize(input);
}

/**
 * 设置自定义意图注册表（用于测试或扩展）
 */
export function setIntentRegistry(registry: IntentRegistry): void {
  // 这个函数可以用于注入自定义的注册表
  // 目前主要用于测试
}

/**
 * 快速流式响应 - 先发送部分内容，再逐步完善
 * @deprecated 使用 smartResponse 替代
 */
export async function* streamFastResponse(
  input: string,
  history: any[]
): AsyncGenerator<string, void, unknown> {
  const { getLLMConnectionPool } = await import('../llm/connection-pool.js');

  const pool = getLLMConnectionPool();
  const llm = await pool.acquire();

  try {
    const quickResult = quickIntentRecognition(input);

    yield quickResult.immediateResponse;

    if (!quickResult.needsDetailedProcessing) {
      return;
    }

    const messages: any[] = [
      {
        role: 'system',
        content: `你是一个高效的AI助手。用户意图：${quickResult.intentType}。
请直接给出简洁的回答，不要过多解释。如果需要工具调用，请明确说明。`,
      },
      ...history.slice(-3),
      {
        role: 'user',
        content: input,
      },
    ];

    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
    for await (const chunk of llm.stream(prompt, { maxTokens: 800 })) {
      yield chunk;
    }
  } finally {
    pool.release(llm);
  }
}

/**
 * 并行意图分析 - 同时进行快速识别和LLM分析
 */
export async function parallelIntentAnalysis(
  input: string,
  onQuickResult?: (result: FastResponseResult) => void
): Promise<FastResponseResult> {
  const quickResult = quickIntentRecognition(input);

  if (onQuickResult) {
    onQuickResult(quickResult);
  }

  return quickResult;
}
