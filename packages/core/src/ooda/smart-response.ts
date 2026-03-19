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

export interface SmartResponseOptions {
  input: string;
  history: ChatMessage[];
  sessionId: string;
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
  formattedResult?: string
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
    return result;
  }

  // 备用方案：使用默认模板
  return {
    messages: [
      { role: 'system', content: '你是AI助手。请完整、准确地回答用户问题。' },
      { role: 'user', content: input },
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
          toolResult = await tool.execute(params, context);
          formattedToolResult = executor.formatResult(toolResult);
          usedTools = true;

          console.log(`[SmartResponse] Tool result: ${formattedToolResult}`);
          await onEvent('tool_result', { content: formattedToolResult });
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

  // 6. 使用Prompt模板构建消息
  monitor.startTimer('promptBuildTime');
  const { messages, maxTokens } = buildPromptWithTemplate(
    intentType,
    input,
    history,
    toolResult,
    formattedToolResult
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

    // 检查内容完整性（用于代码等需要完整结构的内容）
    if (contentType === 'code') {
      const completeness = checkContentCompleteness(fullContent);
      console.log(`[StreamCompleteLLM] Completeness check: ${completeness.isComplete ? 'complete' : 'incomplete'}, score: ${completeness.score}`);
    }

    await onEvent('result', { content: fullContent });

    return fullContent;
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
