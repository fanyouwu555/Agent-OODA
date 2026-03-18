// packages/core/src/ooda/progressive-response.ts
// 渐进式响应机制 - 先响应，后完善

import { quickIntentRecognition } from './fast-response';
import { getLLMConnectionPool } from '../llm/connection-pool';
import { ChatMessage } from '../llm/provider';
import { getToolRegistry } from '../tool/registry';

export interface ProgressiveResponseOptions {
  /** 用户输入 */
  input: string;
  /** 历史消息 */
  history: ChatMessage[];
  /** 会话ID */
  sessionId: string;
  /** 事件回调 */
  onEvent: (type: string, data: any) => Promise<void>;
}

export interface ProgressiveResponseResult {
  /** 最终输出 */
  output: string;
  /** 是否使用了工具 */
  usedTools: boolean;
  /** 执行时间 */
  executionTime: number;
}

/**
 * 渐进式响应 - 核心函数
 * 
 * 流程：
 * 1. 立即识别意图并发送初步响应 (< 100ms)
 * 2. 流式输出思考过程
 * 3. 并行执行工具调用（如果需要）
 * 4. 流式输出最终结果
 */
export async function progressiveResponse(
  options: ProgressiveResponseOptions
): Promise<ProgressiveResponseResult> {
  const startTime = Date.now();
  const { input, history, sessionId, onEvent } = options;
  
  // 1. 快速意图识别（< 10ms）
  const quickIntent = quickIntentRecognition(input);
  
  // 2. 立即发送初步响应
  await onEvent('thinking', { content: quickIntent.immediateResponse });
  
  // 3. 检查是否需要工具调用
  const needsTool = quickIntent.intentType === 'file_read' || 
                    quickIntent.intentType === 'file_write' ||
                    quickIntent.intentType === 'search';
  
  let toolResult: any = null;
  let usedTools = false;
  
  if (needsTool) {
    // 4. 并行执行工具调用
    await onEvent('thinking', { content: '正在执行相关操作...' });
    
    try {
      toolResult = await executeToolByIntent(quickIntent.intentType, input, sessionId);
      usedTools = true;
      
      if (toolResult) {
        await onEvent('tool_result', { 
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
        });
      }
    } catch (error) {
      await onEvent('thinking', { content: `操作失败: ${error}` });
    }
  }
  
  // 5. 流式生成最终响应
  await onEvent('thinking', { content: '正在生成回答...' });
  
  const output = await streamFinalResponse(input, history, toolResult, onEvent);
  
  const executionTime = Date.now() - startTime;
  
  return {
    output,
    usedTools,
    executionTime,
  };
}

/**
 * 根据意图执行工具
 */
async function executeToolByIntent(intentType: string, input: string, sessionId: string): Promise<any> {
  const toolRegistry = getToolRegistry();
  
  // 构建执行上下文
  const context = {
    workingDirectory: process.cwd(),
    sessionId,
    maxExecutionTime: 30000, // 30秒超时
    resources: {
      memory: 1024 * 1024 * 100, // 100MB
      cpu: 1,
    },
  };
  
  switch (intentType) {
    case 'file_read':
      const readMatch = input.match(/读取\s*["']?([^"']+)["']?/i) || 
                        input.match(/read\s*["']?([^"']+)["']?/i);
      if (readMatch) {
        const filePath = readMatch[1];
        const readFileTool = toolRegistry.get('read_file');
        if (readFileTool) {
          return await readFileTool.execute({ path: filePath }, context);
        }
      }
      break;
      
    case 'file_write':
      const writeMatch = input.match(/写入\s*["']?([^"']+)["']?\s*[:\n]([\s\S]+)/i) ||
                        input.match(/write\s*["']?([^"']+)["']?\s*[:\n]([\s\S]+)/i);
      if (writeMatch) {
        const filePath = writeMatch[1];
        const content = writeMatch[2].trim();
        const writeFileTool = toolRegistry.get('write_file');
        if (writeFileTool) {
          return await writeFileTool.execute({ path: filePath, content }, context);
        }
      }
      break;
      
    case 'search':
      // 搜索功能可以集成 web_search 工具
      const searchMatch = input.match(/搜索\s*["']?([^"']+)["']?/i) ||
                         input.match(/search\s*["']?([^"']+)["']?/i);
      if (searchMatch) {
        const query = searchMatch[1];
        const searchTool = toolRegistry.get('web_search');
        if (searchTool) {
          return await searchTool.execute({ query }, context);
        }
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
    // 构建简化提示
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: toolResult 
          ? '你是一个助手。请根据工具执行结果回答用户问题。'
          : '你是一个助手。请简洁直接地回答用户问题。',
      },
      ...history.slice(-2), // 只保留最近2条历史
      {
        role: 'user',
        content: toolResult 
          ? `${input}\n\n工具执行结果：${typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)}`
          : input,
      },
    ];
    
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    console.log('[ProgressiveResponse] Generating response with prompt length:', prompt.length);
    
    let fullResponse = '';
    let chunkCount = 0;
    
    // 流式输出
    try {
      for await (const chunk of llm.stream(prompt, { maxTokens: 1000 })) {
        fullResponse += chunk;
        chunkCount++;
        await onEvent('content', { content: chunk });
      }
      
      console.log('[ProgressiveResponse] Response generated, chunks:', chunkCount, 'length:', fullResponse.length);
    } catch (streamError) {
      console.error('[ProgressiveResponse] Stream error:', streamError);
      await onEvent('thinking', { content: `生成响应时出错: ${streamError}` });
    }
    
    // 如果响应为空，发送错误信息
    if (!fullResponse.trim()) {
      console.error('[ProgressiveResponse] Empty response from LLM');
      fullResponse = '抱歉，我暂时无法生成回答。请检查LLM服务是否正常运行。';
      await onEvent('thinking', { content: '生成响应失败，请检查服务状态' });
    }
    
    // 发送最终结果事件
    await onEvent('result', { content: fullResponse });
    
    return fullResponse;
  } catch (error) {
    console.error('[ProgressiveResponse] Fatal error in streamFinalResponse:', error);
    const errorMessage = `处理请求时出错: ${error instanceof Error ? error.message : String(error)}`;
    await onEvent('result', { content: errorMessage });
    return errorMessage;
  } finally {
    pool.release(llm);
  }
}
