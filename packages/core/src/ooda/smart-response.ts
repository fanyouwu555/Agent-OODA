// 智能响应策略 - 所有请求都调用LLM，但通过策略优化提升速度
// 核心优化：简化Prompt、并行执行、流式优先、连接预热、完整响应（自动续传）

import { quickIntentRecognition } from './fast-response.js';
import { getLLMConnectionPool } from '../llm/connection-pool.js';
import { ChatMessage } from '../llm/provider.js';
import { getToolRegistry } from '../tool/registry.js';
import { streamCompleteResponse } from '../llm/complete-response.js';
import { generateUltimateResponse, checkContentCompleteness } from '../llm/ultimate-response.js';

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
  optimization: 'simple-prompt' | 'parallel' | 'standard';
}

/**
 * 构建优化后的Prompt
 * 根据意图类型构建不同复杂度的Prompt
 */
function buildOptimizedPrompt(
  input: string,
  history: ChatMessage[],
  intentType: string,
  toolResult?: any
): { messages: ChatMessage[]; maxTokens: number } {
  // 简单问候 - 极简Prompt，快速响应
  if (intentType === 'greeting') {
    return {
      messages: [
        {
          role: 'system',
          content: '你是AI助手。用一句话友好回应问候。',
        },
        { role: 'user', content: input },
      ],
      maxTokens: 100, // 限制token数，加快生成
    };
  }

  // 确认/感谢 - 极简Prompt
  if (intentType === 'confirmation') {
    return {
      messages: [
        {
          role: 'system',
          content: '你是AI助手。礼貌回应用户的确认或感谢，一句话。',
        },
        { role: 'user', content: input },
      ],
      maxTokens: 80,
    };
  }

  // 告别 - 极简Prompt
  if (intentType === 'farewell') {
    return {
      messages: [
        {
          role: 'system',
          content: '你是AI助手。友好道别，一句话。',
        },
        { role: 'user', content: input },
      ],
      maxTokens: 80,
    };
  }

  // 实时数据查询 - 带工具结果的Prompt
  if (intentType.startsWith('realtime_') && toolResult) {
    return {
      messages: [
        {
          role: 'system',
          content: '你是AI助手。根据提供的实时数据，简洁回答用户问题。',
        },
        {
          role: 'user',
          content: `${input}\n\n实时数据：${typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)}`,
        },
      ],
      maxTokens: 300,
    };
  }

  // 文件操作 - 带工具结果的Prompt
  if ((intentType === 'file_read' || intentType === 'file_write') && toolResult) {
    return {
      messages: [
        {
          role: 'system',
          content: '你是AI助手。根据文件操作结果，简洁回答。',
        },
        {
          role: 'user',
          content: `${input}\n\n操作结果：${typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)}`,
        },
      ],
      maxTokens: 400,
    };
  }

  // 搜索 - 带搜索结果的Prompt
  if (intentType === 'search' && toolResult) {
    return {
      messages: [
        {
          role: 'system',
          content: '你是AI助手。根据搜索结果，简洁回答用户问题。',
        },
        {
          role: 'user',
          content: `${input}\n\n搜索结果：${typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)}`,
        },
      ],
      maxTokens: 500,
    };
  }

  // 代码相关 - 标准Prompt但限制历史，增加token数以避免截断
  if (intentType === 'code') {
    return {
      messages: [
        {
          role: 'system',
          content: '你是编程助手。提供完整、可运行的代码，确保代码格式正确。',
        },
        ...history.slice(-2), // 只保留最近2条历史
        { role: 'user', content: input },
      ],
      maxTokens: 2000, // 增加token数以支持完整代码生成
    };
  }

  // 默认标准Prompt - 增加token数以避免截断
  return {
    messages: [
      {
        role: 'system',
        content: '你是AI助手。请完整、准确地回答用户问题。',
      },
      ...history.slice(-3), // 保留最近3条历史
      { role: 'user', content: input },
    ],
    maxTokens: 1500, // 增加token数以支持完整回复
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

  console.log(`[SmartResponse] Starting for: "${input.substring(0, 30)}..."`);

  // 1. 快速意图识别（< 1ms）
  const quickIntent = quickIntentRecognition(input);
  const intentType = quickIntent.intentType;
  console.log(`[SmartResponse] Intent: ${intentType}, confidence: ${quickIntent.confidence}`);

  // 2. 立即发送思考中事件（感知优化）
  await onEvent('thinking', { content: quickIntent.immediateResponse });

  // 3. 判断是否需要工具调用
  const needsTool =
    intentType.startsWith('realtime_') ||
    intentType === 'file_read' ||
    intentType === 'file_write' ||
    intentType === 'search';

  let toolResult: any = null;
  let usedTools = false;

  // 4. 并行执行：工具调用 + LLM准备（如果需要工具）
  if (needsTool) {
    console.log(`[SmartResponse] Tool execution needed for intent: ${intentType}`);

    try {
      // 启动工具调用
      const toolPromise = executeToolByIntent(intentType, input, sessionId);

      // 等待工具结果
      toolResult = await toolPromise;
      usedTools = !!toolResult;

      console.log(`[SmartResponse] Tool result: ${toolResult ? 'success' : 'null/undefined'}, type: ${typeof toolResult}`);

      if (toolResult) {
        console.log(`[SmartResponse] Tool result content: ${typeof toolResult === 'string' ? toolResult.substring(0, 100) : JSON.stringify(toolResult).substring(0, 100)}`);
        await onEvent('tool_result', {
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
        });
      } else {
        console.warn(`[SmartResponse] Tool returned null/undefined for intent: ${intentType}`);
      }
    } catch (error) {
      console.error(`[SmartResponse] Tool execution error:`, error);
    }
  } else {
    console.log(`[SmartResponse] No tool needed for intent: ${intentType}`);
  }

  // 5. 构建优化后的Prompt
  const { messages, maxTokens } = buildOptimizedPrompt(input, history, intentType, toolResult);
  console.log(`[SmartResponse] Using ${messages.length} messages, maxTokens: ${maxTokens}`);

  // 6. 流式生成响应（带自动续传机制）
  const output = await streamCompleteLLMResponse(messages, maxTokens, onEvent, intentType);

  const executionTime = Date.now() - startTime;
  const optimization = needsTool ? 'parallel' : maxTokens < 200 ? 'simple-prompt' : 'standard';

  console.log(`[SmartResponse] Completed in ${executionTime}ms (optimization: ${optimization})`);

  return {
    output,
    usedTools,
    executionTime,
    optimization,
  };
}

/**
 * 流式LLM响应（终极方案）
 * 使用分块生成 + 强制完整性验证 + 多次重试
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
    console.log(`[StreamCompleteLLM] Starting ultimate response, intent: ${intentType}, contentType: ${contentType}`);

    // 代码类内容使用终极方案
    if (contentType === 'code') {
      console.log(`[StreamCompleteLLM] Using ultimate response for code generation`);

      await onEvent('thinking', { content: '正在生成代码，这可能需要一些时间...' });

      const result = await generateUltimateResponse(
        llm.getProvider(),
        messages,
        {
          maxTokensPerChunk: 1500,
          maxChunks: 5,
          contentType: 'code',
          strictCompleteness: true,
        },
        async (chunk, chunkIndex) => {
          // 只在第一个块时通知开始
          if (chunkIndex === 0) {
            await onEvent('thinking', { content: '正在生成代码...' });
          }
          await onEvent('content', { content: chunk });
        }
      );

      console.log(`[StreamCompleteLLM] Ultimate response completed: ${result.content.length} chars, ${result.chunks} chunks, isComplete: ${result.isComplete}, retries: ${result.retryCount}`);

      // 如果最终不完整，添加警告
      if (!result.isComplete) {
        await onEvent('thinking', { content: '代码生成可能不完整，请检查。' });
      }

      await onEvent('result', { content: result.content });
      return result.content;
    }

    // 非代码内容使用普通流式响应
    console.log(`[StreamCompleteLLM] Using standard streaming for text`);

    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
    let fullResponse = '';
    let chunkCount = 0;

    for await (const chunk of llm.stream(prompt, { maxTokens })) {
      fullResponse += chunk;
      chunkCount++;
      await onEvent('content', { content: chunk });
    }

    console.log(`[StreamCompleteLLM] Standard response completed: ${chunkCount} chunks, ${fullResponse.length} chars`);

    await onEvent('result', { content: fullResponse });
    return fullResponse;
  } catch (error) {
    console.error('[StreamCompleteLLM] Error:', error);
    const errorMessage = `处理请求时出错: ${error instanceof Error ? error.message : String(error)}`;
    await onEvent('result', { content: errorMessage });
    return errorMessage;
  } finally {
    pool.release(llm);
  }
}

/**
 * 流式LLM响应（旧版，保留用于兼容）
 */
async function streamLLMResponse(
  messages: ChatMessage[],
  maxTokens: number,
  onEvent: (type: string, data: any) => Promise<void>
): Promise<string> {
  return streamCompleteLLMResponse(messages, maxTokens, onEvent, 'general');
}

/**
 * 根据意图执行工具
 */
async function executeToolByIntent(
  intentType: string,
  input: string,
  sessionId: string
): Promise<any> {
  console.log(`[ExecuteTool] Starting for intent: ${intentType}, input: "${input.substring(0, 30)}..."`);

  const toolRegistry = getToolRegistry();

  const context = {
    workingDirectory: process.cwd(),
    sessionId,
    maxExecutionTime: 30000,
    resources: { memory: 1024 * 1024 * 100, cpu: 1 },
  };

  switch (intentType) {
    case 'realtime_gold': {
      const goldTool = toolRegistry.get('get_gold_price');
      return goldTool ? await goldTool.execute({}, context) : null;
    }

    case 'realtime_stock': {
      const stockMatch = input.match(/([A-Z]{1,5})/) || input.match(/(\d{6})/);
      if (stockMatch) {
        const stockTool = toolRegistry.get('get_stock_price');
        return stockTool ? await stockTool.execute({ symbol: stockMatch[1] }, context) : null;
      }
      break;
    }

    case 'realtime_crypto': {
      let cryptoSymbol = 'bitcoin';
      if (/比特币|btc/i.test(input)) cryptoSymbol = 'bitcoin';
      else if (/以太坊|eth/i.test(input)) cryptoSymbol = 'ethereum';
      const cryptoTool = toolRegistry.get('get_crypto_price');
      return cryptoTool ? await cryptoTool.execute({ symbol: cryptoSymbol }, context) : null;
    }

    case 'realtime_weather': {
      const cities = ['北京', '上海', '广州', '深圳', '杭州'];
      const city = cities.find((c) => input.includes(c)) || '北京';
      const weatherTool = toolRegistry.get('get_weather');
      return weatherTool ? await weatherTool.execute({ location: city }, context) : null;
    }

    case 'realtime_news': {
      const newsTool = toolRegistry.get('get_latest_news');
      return newsTool ? await newsTool.execute({ category: 'general' }, context) : null;
    }

    case 'file_read': {
      const readMatch = input.match(/读取\s*["']?([^"']+)["']?/i);
      if (readMatch) {
        const readTool = toolRegistry.get('read_file');
        return readTool ? await readTool.execute({ path: readMatch[1] }, context) : null;
      }
      break;
    }

    case 'file_write': {
      const writeMatch = input.match(/写入\s*["']?([^"']+)["']?\s*[:\n]([\s\S]+)/i);
      if (writeMatch) {
        const writeTool = toolRegistry.get('write_file');
        return writeTool
          ? await writeTool.execute({ path: writeMatch[1], content: writeMatch[2].trim() }, context)
          : null;
      }
      break;
    }

    case 'search': {
      const searchMatch = input.match(/搜索\s*["']?([^"']+)["']?/i);
      if (searchMatch) {
        const searchTool = toolRegistry.get('web_search');
        return searchTool ? await searchTool.execute({ query: searchMatch[1] }, context) : null;
      }
      break;
    }

    case 'realtime_time': {
      console.log(`[ExecuteTool] Getting time tool from registry`);
      const timeTool = toolRegistry.get('get_time');
      console.log(`[ExecuteTool] Time tool found: ${!!timeTool}`);
      if (timeTool) {
        console.log(`[ExecuteTool] Executing time tool`);
        const result = await timeTool.execute({}, context) as { time: string; date: string; weekday: string; timezone: string };
        console.log(`[ExecuteTool] Time tool result: ${JSON.stringify(result)}`);
        // 格式化时间输出
        const formatted = `当前时间：${result.time}，日期：${result.date} ${result.weekday}，时区：${result.timezone}`;
        console.log(`[ExecuteTool] Formatted result: ${formatted}`);
        return formatted;
      }
      console.warn(`[ExecuteTool] Time tool not found in registry`);
      break;
    }
  }

  return null;
}
