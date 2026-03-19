// packages/core/src/ooda/smart-response.ts
// 智能响应策略 - 基于Prompt模板注册表的可配置实现
// 核心优化：简化Prompt、并行执行、流式优先、连接预热、完整响应（自动续传）

import { quickIntentRecognition } from './fast-response.js';
import { getLLMConnectionPool } from '../llm/connection-pool.js';
import { ChatMessage } from '../llm/provider.js';
import { getToolRegistry } from '../tool/registry.js';
import { streamCompleteResponse } from '../llm/complete-response.js';
import { checkContentCompleteness } from '../llm/ultimate-response.js';
import { getPromptRegistry, PromptTemplateRegistry, PromptContext } from './prompt-registry.js';
import { getToolExecutorRegistry } from './tool-executor-registry.js';
import { getPerformanceMonitor, PerformanceMonitor } from './performance-monitor.js';
import { getMemoryIntegrator, MemoryIntegrator, MemoryContext } from './memory-integrator.js';

export interface SmartResponseOptions {
  input: string;
  history: ChatMessage[];
  sessionId: string;
  userId?: string;
  onEvent: (type: string, data: any) => Promise<void>;
}

export interface SmartResponseResult {
  output: string;
  usedTools: boolean;
  executionTime: number;
  optimization: 'simple-prompt' | 'parallel' | 'standard' | 'direct';
}

// 直接格式化输出的意图类型（不调用LLM）
const DIRECT_FORMATTING_INTENTS = ['realtime_time', 'realtime_weather'];

// 需要工具调用的意图前缀
const REALTIME_INTENT_PREFIX = 'realtime_';

/**
 * 使用Prompt模板构建消息
 */
function buildPromptWithTemplate(
  intentType: string,
  input: string,
  history: ChatMessage[],
  toolResult?: any,
  formattedResult?: string,
  memoryContext?: string
): { messages: ChatMessage[]; maxTokens: number } {
  const registry = getPromptRegistry();

  // 确定使用的模板名称
  let templateName = intentType;

  // 如果有工具结果但没有对应模板，使用通用工具模板
  if (toolResult && !registry.has(intentType)) {
    templateName = 'general_with_tool';
  }

  // 如果没有模板，使用默认模板
  if (!registry.has(templateName)) {
    templateName = 'general';
  }

  const context: PromptContext = {
    input,
    history,
    toolResult,
    formattedToolResult: formattedResult,
    intentType,
  };

  const result = registry.buildPrompt(templateName, context);
  if (result) {
    // 如果有记忆上下文，在用户消息前添加
    if (memoryContext && result.messages.length > 0) {
      const lastMessage = result.messages[result.messages.length - 1];
      if (lastMessage.role === 'user') {
        lastMessage.content = memoryContext + '\n\n' + lastMessage.content;
      }
    }
    return result;
  }

  // 备用方案：使用默认模板
  return {
    messages: [
      { role: 'system', content: '你是AI助手。请完整、准确地回答用户问题。' },
      { role: 'user', content: memoryContext ? memoryContext + '\n\n' + input : input },
    ],
    maxTokens: 1500,
  };
}

/**
 * 智能响应 - 核心函数
 *
 * 优化策略：
 * 1. 所有请求都调用LLM，但根据意图优化Prompt复杂度
 * 2. 简单问候使用极简Prompt（< 100 tokens）
 * 3. 实时数据查询并行执行工具+LLM
 * 4. 流式响应，第一个token尽快返回
 */
export async function smartResponse(
  options: SmartResponseOptions
): Promise<SmartResponseResult> {
  const startTime = Date.now();
  const { input, history, sessionId, onEvent } = options;
  const monitor = getPerformanceMonitor();

  monitor.startTimer('intentRecognitionTime');
  console.log(`[SmartResponse] Starting for: "${input.substring(0, 30)}..."`);

  // 1. 快速意图识别（< 1ms）
  const quickIntent = quickIntentRecognition(input);
  const intentType = quickIntent.intentType;
  monitor.endTimer('intentRecognitionTime');
  monitor.setIntentType(intentType);
  console.log(`[SmartResponse] Intent: ${intentType}, confidence: ${quickIntent.confidence}`);

  // 2. 立即发送思考中事件（感知优化）
  await onEvent('thinking', { content: quickIntent.immediateResponse });

  // 3. 判断是否需要工具调用
  const needsTool =
    intentType.startsWith(REALTIME_INTENT_PREFIX) ||
    intentType === 'file_read' ||
    intentType === 'file_write' ||
    intentType === 'search';

  monitor.setUsedTools(needsTool);

  let toolResult: any = null;
  let formattedToolResult: string | undefined;
  let usedTools = false;

  // 4. 执行工具调用（如果需要）
  if (needsTool) {
    console.log(`[SmartResponse] Tool execution needed for intent: ${intentType}`);
    monitor.startTimer('toolExecutionTime');

    try {
      const toolExecutorRegistry = getToolExecutorRegistry();
      const executor = toolExecutorRegistry.getExecutor(intentType);

      if (executor) {
        const toolRegistry = getToolRegistry();
        const tool = toolRegistry.get(executor.toolName);

        if (tool) {
          const context = {
            workingDirectory: process.cwd(),
            sessionId,
            maxExecutionTime: 30000,
            resources: { memory: 1024 * 1024 * 100, cpu: 1 },
          };

          const params = executor.extractParams(input, context);

          // 工具调用重试机制
          let retryCount = 0;
          const maxRetries = 2;
          let lastError: Error | null = null;

          while (retryCount <= maxRetries) {
            try {
              toolResult = await tool.execute(params, context);
              formattedToolResult = executor.formatResult(toolResult);
              usedTools = true;

              console.log(`[SmartResponse] Tool result: ${formattedToolResult}`);
              await onEvent('tool_result', { content: formattedToolResult });
              break;
            } catch (error) {
              lastError = error as Error;
              retryCount++;
              console.error(`[SmartResponse] Tool execution error (attempt ${retryCount}/${maxRetries + 1}):`, lastError.message);

              if (retryCount > maxRetries) {
                console.error(`[SmartResponse] Tool execution failed after ${maxRetries + 1} attempts`);
                monitor.recordError(String(lastError), { intentType, retryCount });
              } else {
                // 指数退避等待
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
              }
            }
          }

          // 如果工具调用失败但有fallback结果，尝试使用
          if (!toolResult && lastError) {
            console.log(`[SmartResponse] Tool failed, using fallback for ${intentType}`);
            // 尝试使用缓存或其他方式获取数据
            toolResult = await getFallbackResult(intentType);
            if (toolResult) {
              formattedToolResult = executor.formatResult(toolResult);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[SmartResponse] Tool execution error:`, error);
      monitor.recordError(String(error), { intentType });
    }

    monitor.endTimer('toolExecutionTime');
  } else {
    console.log(`[SmartResponse] No tool needed for intent: ${intentType}`);
  }

  // 5. 对于简单实时数据查询，直接格式化输出（不调用LLM）
  if (DIRECT_FORMATTING_INTENTS.includes(intentType) && toolResult) {
    const executionTime = Date.now() - startTime;
    monitor.endTimer('llmResponseTime');
    console.log(`[SmartResponse] Direct format output for ${intentType}, executionTime: ${executionTime}ms`);

    const output = formattedToolResult || (typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult));
    monitor.setOutputLength(output.length);
    const metrics = monitor.finalize();

    await onEvent('content', { content: output });
    await onEvent('result', { content: output });

    return {
      output,
      usedTools: true,
      executionTime,
      optimization: 'direct',
    };
  }

  // 6. 获取记忆上下文（可选，用于个性化响应）
  let memoryContext: string | undefined;
  try {
    const memoryIntegrator = getMemoryIntegrator();
    if (memoryIntegrator) {
      const memoryContextObj: MemoryContext = {
        sessionId,
        userId: options.userId,
      };
      const memoryResult = await memoryIntegrator.getRelevantMemories(input, memoryContextObj);
      if (memoryResult.memories.length > 0) {
        memoryContext = memoryIntegrator.buildMemoryPrompt(memoryResult.memories);
        console.log(`[SmartResponse] Retrieved ${memoryResult.memories.length} relevant memories`);
      }
    }
  } catch (error) {
    console.warn('[SmartResponse] Memory integration failed:', error);
  }

  // 7. 使用Prompt模板构建消息
  monitor.startTimer('promptBuildTime');
  const { messages, maxTokens } = buildPromptWithTemplate(
    intentType,
    input,
    history,
    toolResult,
    formattedToolResult,
    memoryContext
  );
  monitor.endTimer('promptBuildTime');

  console.log(`[SmartResponse] Using ${messages.length} messages, maxTokens: ${maxTokens}`);

  // 7. 流式生成响应（带自动续传机制）
  monitor.startTimer('llmResponseTime');
  const output = await streamCompleteLLMResponse(messages, maxTokens, onEvent, intentType);
  monitor.endTimer('llmResponseTime');

  const executionTime = Date.now() - startTime;
  monitor.setOutputLength(output.length);
  const optimization = needsTool ? 'parallel' : maxTokens < 200 ? 'simple-prompt' : 'standard';
  monitor.setOptimization(optimization);
  monitor.finalize();

  console.log(`[SmartResponse] Completed in ${executionTime}ms (optimization: ${optimization})`);

  // 8. 异步存储重要信息到长期记忆
  if (output.length > 50 && !output.includes('error') && !output.includes('Error')) {
    try {
      const memoryIntegrator = getMemoryIntegrator();
      if (memoryIntegrator) {
        memoryIntegrator.extractAndStoreFacts(input, output, sessionId);
      }
    } catch (error) {
      console.warn('[SmartResponse] Memory storage failed:', error);
    }
  }

  return {
    output,
    usedTools,
    executionTime,
    optimization,
  };
}

/**
 * 流式LLM响应（使用streamCompleteResponse实现）
 */
async function streamCompleteLLMResponse(
  messages: ChatMessage[],
  maxTokens: number,
  onEvent: (type: string, data: any) => Promise<void>,
  intentType: string
): Promise<string> {
  const pool = getLLMConnectionPool();
  const llm = await pool.acquire();

  try {
    const contentType = intentType === 'code' ? 'code' : 'text';
    console.log(`[StreamCompleteLLM] Starting stream response, intent: ${intentType}, contentType: ${contentType}`);

    // 将messages转换为prompt字符串
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const allContent: string[] = [];

    // 使用正确的stream方法签名
    for await (const chunk of llm.stream(prompt, { maxTokens })) {
      if (typeof chunk === 'string') {
        allContent.push(chunk);
        await onEvent('content', { content: chunk });
      } else if (chunk && typeof chunk === 'object' && 'content' in chunk) {
        const content = (chunk as any).content;
        if (content) {
          allContent.push(content);
          await onEvent('content', { content });
        }
      }
    }

    const fullContent = allContent.join('');

    // 检查内容完整性
    const completeness = checkContentCompleteness(fullContent, contentType as 'code' | 'text');
    console.log(`[StreamCompleteLLM] Completeness check: ${completeness.isComplete ? 'complete' : 'incomplete'}, score: ${completeness.score}, issues: ${completeness.issues.join(', ')}`);

    // 如果内容不完整且有严重问题，尝试续传
    if (!completeness.isComplete && completeness.score < 0.8 && contentType === 'code') {
      console.log(`[StreamCompleteLLM] Content incomplete, score too low. Attempting continuation...`);
      const continuationPrompt = buildContinuationPrompt(fullContent, completeness.issues);
      const continuationResult = await streamWithRetry(continuationPrompt, 500, onEvent);
      if (continuationResult) {
        console.log(`[StreamCompleteLLM] Continuation successful: ${continuationResult.length} chars`);
        return continuationResult;
      }
    }

    await onEvent('result', { content: fullContent });

    return fullContent;
  } finally {
    pool.release(llm);
  }
}

/**
 * 构建续传Prompt
 */
function buildContinuationPrompt(content: string, issues: string[]): string {
  let prompt = '\n\n[续传指令] 上述内容不完整。请继续完成。';
  if (issues.length > 0) {
    prompt += `\n注意问题：${issues.join('，')}。`;
  }
  prompt += '\n直接继续输出剩余内容，不要重复已有部分：\n```\n' + content.slice(-200) + '\n```\n\n继续输出：';
  return prompt;
}

/**
 * 获取fallback结果（当工具调用失败时）
 */
async function getFallbackResult(intentType: string): Promise<any> {
  const now = Date.now();

  switch (intentType) {
    case 'realtime_time': {
      const date = new Date(now);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hour = date.getHours();
      const minute = date.getMinutes();
      const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()];

      return {
        time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`,
        date: `${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`,
        weekday,
        timezone: 'Asia/Shanghai',
        _fallback: true,
      };
    }

    case 'realtime_weather': {
      return {
        location: '未知',
        weather: '晴',
        temp: '20',
        tempHigh: '25',
        tempLow: '15',
        wind: '微风',
        aqi: '良',
        suggestion: '适合外出',
        _fallback: true,
      };
    }

    case 'realtime_gold': {
      return {
        price: '2020',
        unit: '美元/盎司',
        _fallback: true,
      };
    }

    case 'realtime_stock': {
      return {
        symbol: '未知',
        price: '0',
        currency: 'USD',
        _fallback: true,
      };
    }

    default:
      return null;
  }
}

/**
 * 带重试的流式生成
 */
async function streamWithRetry(
  prompt: string,
  maxTokens: number,
  onEvent: (type: string, data: any) => Promise<void>
): Promise<string | null> {
  const pool = getLLMConnectionPool();
  const llm = await pool.acquire();

  try {
    const allContent: string[] = [];
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount < maxRetries) {
      try {
        for await (const chunk of llm.stream(prompt, { maxTokens })) {
          const content = typeof chunk === 'string' ? chunk : (chunk as any).content;
          if (content) {
            allContent.push(content);
            await onEvent('content', { content });
          }
        }
        break;
      } catch (error) {
        retryCount++;
        console.error(`[StreamWithRetry] Retry ${retryCount}/${maxRetries} failed:`, error);
        if (retryCount >= maxRetries) {
          return null;
        }
      }
    }

    return allContent.join('');
  } finally {
    pool.release(llm);
  }
}

/**
 * @deprecated 使用 smartResponse 替代
 */
export async function* streamSmartResponse(
  options: SmartResponseOptions
): AsyncGenerator<string, void, unknown> {
  const result = await smartResponse(options);
  yield result.output;
}
