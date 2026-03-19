// 优化响应策略 - 策略优化而非跳过LLM
// 核心思想：并行化、缓存、流式响应

import { quickIntentRecognition } from './fast-response.js';
import { getLLMConnectionPool } from '../llm/connection-pool.js';
import { ChatMessage } from '../llm/provider.js';
import { getToolRegistry } from '../tool/registry.js';

export interface OptimizedResponseOptions {
  input: string;
  history: ChatMessage[];
  sessionId: string;
  onEvent: (type: string, data: any) => Promise<void>;
}

export interface OptimizedResponseResult {
  output: string;
  usedTools: boolean;
  executionTime: number;
  strategy: 'direct' | 'parallel' | 'full-ooda';
}

// 简单响应缓存
const responseCache = new Map<string, {
  output: string;
  timestamp: number;
  inputHash: string;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5分钟

function getInputHash(input: string): string {
  // 简单的输入归一化哈希
  const normalized = input.toLowerCase().trim().replace(/\s+/g, ' ');
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

function getCacheKey(input: string, intentType: string): string {
  return `${intentType}:${getInputHash(input)}`;
}

/**
 * 策略决策器 - 根据输入复杂度选择策略
 */
function selectStrategy(input: string, intentType: string): 'direct' | 'parallel' | 'full-ooda' {
  // 简单问候、确认、告别 - 直接响应
  if (['greeting', 'confirmation', 'farewell'].includes(intentType)) {
    return 'direct';
  }

  // 实时数据查询 - 并行处理（工具调用 + LLM生成）
  if (intentType.startsWith('realtime_')) {
    return 'parallel';
  }

  // 文件操作、搜索 - 并行处理
  if (['file_read', 'file_write', 'search'].includes(intentType)) {
    return 'parallel';
  }

  // 其他复杂任务 - 完整OODA
  return 'full-ooda';
}

/**
 * 优化响应 - 核心函数
 *
 * 策略：
 * 1. direct: 直接返回预设响应（< 10ms）
 * 2. parallel: 并行执行工具调用和LLM生成（< 2s）
 * 3. full-ooda: 完整OODA流程（复杂任务）
 */
export async function optimizedResponse(
  options: OptimizedResponseOptions
): Promise<OptimizedResponseResult> {
  const startTime = Date.now();
  const { input, history, sessionId, onEvent } = options;

  console.log(`[OptimizedResponse] Starting for: "${input.substring(0, 30)}..."`);

  // 1. 快速意图识别
  const quickIntent = quickIntentRecognition(input);
  console.log(`[OptimizedResponse] Intent: ${quickIntent.intentType}, confidence: ${quickIntent.confidence}`);

  // 2. 选择策略
  const strategy = selectStrategy(input, quickIntent.intentType);
  console.log(`[OptimizedResponse] Strategy: ${strategy}`);

  // 3. 检查缓存（仅对简单查询）
  if (strategy === 'direct') {
    const cacheKey = getCacheKey(input, quickIntent.intentType);
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[OptimizedResponse] Cache hit!`);
      await onEvent('thinking', { content: quickIntent.immediateResponse });
      await onEvent('content', { content: cached.output });
      await onEvent('result', { content: cached.output });

      return {
        output: cached.output,
        usedTools: false,
        executionTime: Date.now() - startTime,
        strategy: 'direct',
      };
    }
  }

  // 4. 根据策略执行
  switch (strategy) {
    case 'direct':
      return await executeDirectStrategy(input, quickIntent, onEvent, startTime);

    case 'parallel':
      return await executeParallelStrategy(input, history, quickIntent, sessionId, onEvent, startTime);

    case 'full-ooda':
      return await executeFullOODAStrategy(input, history, quickIntent, sessionId, onEvent, startTime);

    default:
      return await executeParallelStrategy(input, history, quickIntent, sessionId, onEvent, startTime);
  }
}

/**
 * 直接响应策略 - 用于简单问候等
 * 特点：不调用LLM，直接返回预设响应
 */
async function executeDirectStrategy(
  input: string,
  quickIntent: ReturnType<typeof quickIntentRecognition>,
  onEvent: (type: string, data: any) => Promise<void>,
  startTime: number
): Promise<OptimizedResponseResult> {
  console.log(`[DirectStrategy] Executing...`);

  // 发送即时响应
  await onEvent('thinking', { content: quickIntent.immediateResponse });

  // 对于问候语，使用轻量级模板生成个性化响应
  let finalResponse = quickIntent.immediateResponse;

  // 如果是问候，添加一些变化
  if (quickIntent.intentType === 'greeting') {
    const hour = new Date().getHours();
    let timeGreeting = '';
    if (hour < 12) timeGreeting = '早上好！';
    else if (hour < 18) timeGreeting = '下午好！';
    else timeGreeting = '晚上好！';

    finalResponse = `${timeGreeting}有什么我可以帮助您的吗？`;
  }

  await onEvent('content', { content: finalResponse });
  await onEvent('result', { content: finalResponse });

  // 缓存响应
  const cacheKey = getCacheKey(input, quickIntent.intentType);
  responseCache.set(cacheKey, {
    output: finalResponse,
    timestamp: Date.now(),
    inputHash: getInputHash(input),
  });

  const executionTime = Date.now() - startTime;
  console.log(`[DirectStrategy] Completed in ${executionTime}ms`);

  return {
    output: finalResponse,
    usedTools: false,
    executionTime,
    strategy: 'direct',
  };
}

/**
 * 并行策略 - 用于实时数据查询等
 * 特点：工具调用和LLM生成并行执行
 */
async function executeParallelStrategy(
  input: string,
  history: ChatMessage[],
  quickIntent: ReturnType<typeof quickIntentRecognition>,
  sessionId: string,
  onEvent: (type: string, data: any) => Promise<void>,
  startTime: number
): Promise<OptimizedResponseResult> {
  console.log(`[ParallelStrategy] Executing...`);

  // 立即发送思考中事件
  await onEvent('thinking', { content: quickIntent.immediateResponse });

  // 并行执行：工具调用 + LLM准备
  const toolPromise = executeToolByIntent(quickIntent.intentType, input, sessionId);

  // 先发送一个占位响应
  await onEvent('content', { content: '' });

  // 等待工具结果
  const toolResult = await toolPromise;
  const usedTools = !!toolResult;

  if (toolResult) {
    await onEvent('tool_result', {
      content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
    });
  }

  // 流式生成最终响应
  const output = await streamFinalResponse(input, history, toolResult, onEvent);

  const executionTime = Date.now() - startTime;
  console.log(`[ParallelStrategy] Completed in ${executionTime}ms`);

  return {
    output,
    usedTools,
    executionTime,
    strategy: 'parallel',
  };
}

/**
 * 完整OODA策略 - 用于复杂任务
 * 特点：完整的Observe-Orient-Decide-Act流程
 */
async function executeFullOODAStrategy(
  input: string,
  history: ChatMessage[],
  quickIntent: ReturnType<typeof quickIntentRecognition>,
  sessionId: string,
  onEvent: (type: string, data: any) => Promise<void>,
  startTime: number
): Promise<OptimizedResponseResult> {
  console.log(`[FullOODAStrategy] Executing...`);

  // 立即发送思考中事件
  await onEvent('thinking', { content: quickIntent.immediateResponse });

  // 检查是否需要工具
  const needsTool = quickIntent.intentType === 'file_read' ||
                    quickIntent.intentType === 'file_write' ||
                    quickIntent.intentType === 'search' ||
                    quickIntent.intentType.startsWith('realtime_');

  let toolResult: any = null;
  let usedTools = false;

  if (needsTool) {
    await onEvent('thinking', { content: '正在执行相关操作...' });
    try {
      toolResult = await executeToolByIntent(quickIntent.intentType, input, sessionId);
      usedTools = !!toolResult;
      if (toolResult) {
        await onEvent('tool_result', {
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
        });
      }
    } catch (error) {
      await onEvent('thinking', { content: `操作失败: ${error}` });
    }
  }

  // 流式生成最终响应
  await onEvent('thinking', { content: '正在生成回答...' });
  const output = await streamFinalResponse(input, history, toolResult, onEvent);

  const executionTime = Date.now() - startTime;
  console.log(`[FullOODAStrategy] Completed in ${executionTime}ms`);

  return {
    output,
    usedTools,
    executionTime,
    strategy: 'full-ooda',
  };
}

/**
 * 根据意图执行工具
 */
async function executeToolByIntent(intentType: string, input: string, sessionId: string): Promise<any> {
  const toolRegistry = getToolRegistry();

  const context = {
    workingDirectory: process.cwd(),
    sessionId,
    maxExecutionTime: 30000,
    resources: { memory: 1024 * 1024 * 100, cpu: 1 },
  };

  switch (intentType) {
    case 'realtime_gold':
      const goldTool = toolRegistry.get('get_gold_price');
      return goldTool ? await goldTool.execute({}, context) : null;

    case 'realtime_stock':
      const stockMatch = input.match(/([A-Z]{1,5})/) || input.match(/(\d{6})/);
      if (stockMatch) {
        const stockTool = toolRegistry.get('get_stock_price');
        return stockTool ? await stockTool.execute({ symbol: stockMatch[1] }, context) : null;
      }
      break;

    case 'realtime_crypto':
      let cryptoSymbol = 'bitcoin';
      if (/比特币|btc/i.test(input)) cryptoSymbol = 'bitcoin';
      else if (/以太坊|eth/i.test(input)) cryptoSymbol = 'ethereum';
      const cryptoTool = toolRegistry.get('get_crypto_price');
      return cryptoTool ? await cryptoTool.execute({ symbol: cryptoSymbol }, context) : null;

    case 'realtime_weather':
      const cities = ['北京', '上海', '广州', '深圳', '杭州'];
      const city = cities.find(c => input.includes(c)) || '北京';
      const weatherTool = toolRegistry.get('get_weather');
      return weatherTool ? await weatherTool.execute({ location: city }, context) : null;

    case 'realtime_news':
      const newsTool = toolRegistry.get('get_latest_news');
      return newsTool ? await newsTool.execute({ category: 'general' }, context) : null;

    case 'file_read':
      const readMatch = input.match(/读取\s*["']?([^"']+)["']?/i);
      if (readMatch) {
        const readTool = toolRegistry.get('read_file');
        return readTool ? await readTool.execute({ path: readMatch[1] }, context) : null;
      }
      break;

    case 'search':
      const searchMatch = input.match(/搜索\s*["']?([^"']+)["']?/i);
      if (searchMatch) {
        const searchTool = toolRegistry.get('web_search');
        return searchTool ? await searchTool.execute({ query: searchMatch[1] }, context) : null;
      }
      break;
  }

  return null;
}

/**
 * 流式生成最终响应
 */
async function streamFinalResponse(
  input: string,
  history: ChatMessage[],
  toolResult: any,
  onEvent: (type: string, data: any) => Promise<void>
): Promise<string> {
  const pool = getLLMConnectionPool();
  const llm = await pool.acquire();

  try {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: toolResult
          ? '你是一个助手。请根据工具执行结果回答用户问题。'
          : '你是一个助手。请简洁直接地回答用户问题。',
      },
      ...history.slice(-2),
      {
        role: 'user',
        content: toolResult
          ? `${input}\n\n工具执行结果：${typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)}`
          : input,
      },
    ];

    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    console.log(`[StreamFinalResponse] Generating with prompt length: ${prompt.length}`);

    let fullResponse = '';
    let chunkCount = 0;

    for await (const chunk of llm.stream(prompt, { maxTokens: 1000 })) {
      fullResponse += chunk;
      chunkCount++;
      await onEvent('content', { content: chunk });
    }

    console.log(`[StreamFinalResponse] Generated ${chunkCount} chunks, ${fullResponse.length} chars`);

    if (!fullResponse.trim()) {
      fullResponse = '抱歉，我暂时无法生成回答。';
      await onEvent('thinking', { content: '生成响应失败' });
    }

    await onEvent('result', { content: fullResponse });
    return fullResponse;
  } catch (error) {
    console.error('[StreamFinalResponse] Error:', error);
    const errorMessage = `处理请求时出错: ${error instanceof Error ? error.message : String(error)}`;
    await onEvent('result', { content: errorMessage });
    return errorMessage;
  } finally {
    pool.release(llm);
  }
}
