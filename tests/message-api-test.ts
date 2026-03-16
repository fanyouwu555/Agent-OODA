// 前后端消息发送和界面更新功能测试
// 运行: npx tsx tests/message-api-test.ts

const API_BASE = 'http://localhost:3000/api';

async function request<T>(
  path: string,
  options: RequestInit = {}
) {
  const startTime = Date.now();
  const url = `${API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
        duration,
        data,
      };
    }

    return {
      success: true,
      message: 'Success',
      duration,
      data: data as T,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

async function sendMessageWithSSE(
  sessionId: string,
  message: string,
  onEvent: (event: unknown) => void
) {
  const startTime = Date.now();
  const url = `${API_BASE}/session/${sessionId}/message`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
        duration: Date.now() - startTime,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        success: false,
        message: 'No response body',
        duration: Date.now() - startTime,
      };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          if (data) {
            try {
              const event = JSON.parse(data);
              eventCount++;
              onEvent(event);
            } catch (e) {
              console.warn('Failed to parse SSE event:', data);
            }
          }
        }
      }
    }

    return {
      success: true,
      message: `Completed with ${eventCount} events`,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

async function readFile(path) {
  const fs = await import('fs/promises');
  return fs.readFile(path, 'utf-8');
}

async function main() {
  console.log('\n=== 前后端消息发送和界面更新测试 ===\n');
  
  // 检查服务器是否运行
  const healthCheck = await request('/health');
  const serverRunning = healthCheck.success;
  
  if (serverRunning) {
    console.log('✓ 服务器运行中\n');
  } else {
    console.log('⚠ 服务器未运行，将跳过实际 API 测试\n');
  }

  // ==================== 后端 API 测试 ====================
  console.log('========== 后端消息发送 API 测试 ==========\n');

  let sessionId = '';
  
  // 1. 创建会话
  console.log('1. 创建会话 API');
  const createResult = await request('/session', { method: 'POST' });
  if (createResult.success && createResult.data) {
    sessionId = createResult.data.sessionId;
    console.log(`   ✓ 成功创建会话: ${sessionId}`);
    console.log(`   ✓ 耗时: ${createResult.duration}ms\n`);
  } else {
    console.log(`   ✗ 失败: ${createResult.message}\n`);
  }

  // 2. 发送消息
  if (serverRunning && sessionId) {
    console.log('2. 发送消息 API (SSE 流式)');
    const events = [];
    const result = await sendMessageWithSSE(
      sessionId,
      '你好，请介绍一下你自己',
      (event) => events.push(event)
    );
    
    if (result.success) {
      console.log(`   ✓ 成功发送消息`);
      console.log(`   ✓ 耗时: ${result.duration}ms`);
      console.log(`   ✓ 收到事件数: ${events.length}`);
      
      const eventTypes = new Set(events.map((e) => e.type));
      console.log(`   ✓ 事件类型: ${Array.from(eventTypes).join(', ')}\n`);
    } else {
      console.log(`   ✗ 失败: ${result.message}\n`);
    }
  }

  // 3. 获取历史
  if (serverRunning && sessionId) {
    console.log('3. 获取会话历史 API');
    const historyResult = await request(`/session/${sessionId}/history`);
    if (historyResult.success) {
      console.log(`   ✓ 成功获取历史`);
      console.log(`   ✓ 消息数量: ${historyResult.data?.length || 0}`);
      
      if (historyResult.data && historyResult.data.length > 0) {
        historyResult.data.forEach((msg, i) => {
          const preview = msg.content.substring(0, 30) + (msg.content.length > 30 ? '...' : '');
          console.log(`     ${i + 1}. [${msg.role}] ${preview}`);
        });
      }
      console.log('');
    }
  }

  // 4. 会话列表
  if (serverRunning) {
    console.log('4. 会话列表 API');
    const sessionsResult = await request('/sessions');
    if (sessionsResult.success) {
      console.log(`   ✓ 成功获取列表`);
      console.log(`   ✓ 会话数量: ${sessionsResult.data?.length || 0}\n`);
    }
  }

  // ==================== 前端代码分析测试 ====================
  console.log('========== 前端界面组件测试 ==========\n');

  // 5. API 客户端
  console.log('5. 前端 API 客户端');
  const apiContent = await readFile('./packages/app/src/services/api.ts').catch(() => '');
  const hasSendMessage = apiContent.includes('sendMessage');
  const hasSSE = apiContent.includes('stream.writeSSE') || apiContent.includes('getReader');
  console.log(`   ✓ sendMessage 方法: ${hasSendMessage ? '存在' : '缺失'}`);
  console.log(`   ✓ SSE 处理: ${hasSSE ? '存在' : '缺失'}\n`);

  // 6. SSE 事件处理
  console.log('6. 前端 SSE 事件处理');
  const appContent = await readFile('./packages/app/src/App.tsx').catch(() => '');
  const hasEventHandler = appContent.includes('handleSSEEvent');
  const hasThinkingHandler = appContent.includes("case 'thinking'");
  const hasContentHandler = appContent.includes("case 'content'");
  const hasResultHandler = appContent.includes("case 'result'");
  console.log(`   ✓ SSE 事件处理器: ${hasEventHandler ? '存在' : '缺失'}`);
  console.log(`   ✓ thinking 事件: ${hasThinkingHandler ? '存在' : '缺失'}`);
  console.log(`   ✓ content 事件: ${hasContentHandler ? '存在' : '缺失'}`);
  console.log(`   ✓ result 事件: ${hasResultHandler ? '存在' : '缺失'}\n`);

  // 7. 消息状态管理
  console.log('7. 前端消息状态管理');
  const hasMessagesState = appContent.includes('const [messages, setMessages]');
  const hasIsLoadingState = appContent.includes('const [isLoading, setIsLoading]');
  const hasStreamingState = appContent.includes('streamingContent');
  console.log(`   ✓ messages 状态: ${hasMessagesState ? '存在' : '缺失'}`);
  console.log(`   ✓ isLoading 状态: ${hasIsLoadingState ? '存在' : '缺失'}`);
  console.log(`   ✓ streamingContent 状态: ${hasStreamingState ? '存在' : '缺失'}\n`);

  // 8. 消息渲染
  console.log('8. 前端消息渲染');
  const hasMessageList = appContent.includes('<For each={messages()}');
  const hasMarkdown = appContent.includes('MarkdownRenderer');
  console.log(`   ✓ 消息列表渲染: ${hasMessageList ? '存在' : '缺失'}`);
  console.log(`   ✓ Markdown 渲染器: ${hasMarkdown ? '存在' : '缺失'}\n`);

  // 9. EventClient 实时更新
  console.log('9. EventClient 实时更新');
  const hasEventClient = appContent.includes('createEventClient');
  const hasSessionUpdate = appContent.includes("'session.updated'");
  const hasToolUpdate = appContent.includes("'tool.updated'");
  console.log(`   ✓ EventClient: ${hasEventClient ? '存在' : '缺失'}`);
  console.log(`   ✓ session.updated 事件: ${hasSessionUpdate ? '存在' : '缺失'}`);
  console.log(`   ✓ tool.updated 事件: ${hasToolUpdate ? '存在' : '缺失'}\n`);

  // ==================== 流程完整性测试 ====================
  console.log('========== 消息流程完整性测试 ==========\n');

  // 10. 后端流程
  console.log('10. 后端消息发送流程');
  const sessionContent = await readFile('./packages/server/src/routes/session.ts').catch(() => '');
  const hasMessageEndpoint = sessionContent.includes("post('/session/:id/message'");
  const hasStreamSSE = sessionContent.includes('streamSSE');
  const hasUserMsgStore = sessionContent.includes('store.messages.create');
  const hasOODALoop = sessionContent.includes('new OODALoop');
  const hasThinkingCB = sessionContent.includes('setThinkingCallback');
  const hasToolCall = sessionContent.includes("sendEvent('tool_call'");
  const hasToolResult = sessionContent.includes("sendEvent('tool_result'");
  const hasContentStream = sessionContent.includes("sendEvent('content'");
  const hasResult = sessionContent.includes("sendEvent('result'");
  
  console.log(`   ✓ 消息端点: ${hasMessageEndpoint ? '✓' : '✗'}`);
  console.log(`   ✓ SSE 流: ${hasStreamSSE ? '✓' : '✗'}`);
  console.log(`   ✓ 用户消息存储: ${hasUserMsgStore ? '✓' : '✗'}`);
  console.log(`   ✓ OODA 循环: ${hasOODALoop ? '✓' : '✗'}`);
  console.log(`   ✓ 思考回调: ${hasThinkingCB ? '✓' : '✗'}`);
  console.log(`   ✓ 工具调用事件: ${hasToolCall ? '✓' : '✗'}`);
  console.log(`   ✓ 工具结果事件: ${hasToolResult ? '✓' : '✗'}`);
  console.log(`   ✓ 内容流事件: ${hasContentStream ? '✓' : '✗'}`);
  console.log(`   ✓ 结果事件: ${hasResult ? '✓' : '✗'}\n`);

  // 11. 前端流程
  console.log('11. 前端消息发送流程');
  const hasSendMsg = appContent.includes('const sendMessage = async');
  const hasApiCall = appContent.includes('apiClient.sendMessage');
  const hasEventHB = appContent.includes('handleSSEEvent');
  const hasMsgUpdate = appContent.includes('setMessages');
  const hasLoadState = appContent.includes('setIsLoading');
  
  console.log(`   ✓ 发送消息函数: ${hasSendMsg ? '✓' : '✗'}`);
  console.log(`   ✓ API 调用: ${hasApiCall ? '✓' : '✗'}`);
  console.log(`   ✓ 事件处理器: ${hasEventHB ? '✓' : '✗'}`);
  console.log(`   ✓ 消息状态更新: ${hasMsgUpdate ? '✓' : '✗'}`);
  console.log(`   ✓ 加载状态更新: ${hasLoadState ? '✓' : '✗'}\n`);

  // ==================== 总结 ====================
  console.log('========== 测试总结 ==========\n');
  
  const backendFlow = hasMessageEndpoint && hasStreamSSE && hasUserMsgStore && 
                      hasOODALoop && hasThinkingCB && hasToolCall && 
                      hasToolResult && hasContentStream && hasResult;
  const frontendFlow = hasSendMsg && hasApiCall && hasEventHB && 
                       hasMsgUpdate && hasLoadState;
  const uiComponents = hasMessagesState && hasIsLoadingState && 
                       hasStreamingState && hasMessageList && hasMarkdown;
  const eventHandling = hasEventHandler && hasThinkingHandler && 
                        hasContentHandler && hasResultHandler;
  const realtimeUpdate = hasEventClient && hasSessionUpdate && hasToolUpdate;
  
  console.log(`后端流程完整性: ${backendFlow ? '✓ 通过' : '✗ 失败'}`);
  console.log(`前端流程完整性: ${frontendFlow ? '✓ 通过' : '✗ 失败'}`);
  console.log(`UI 组件完整性: ${uiComponents ? '✓ 通过' : '✗ 失败'}`);
  console.log(`事件处理完整性: ${eventHandling ? '✓ 通过' : '✗ 失败'}`);
  console.log(`实时更新完整性: ${realtimeUpdate ? '✓ 通过' : '✗ 失败'}`);
  
  if (serverRunning) {
    console.log(`\n服务器测试: 需要启动后端服务器进行实际测试`);
  }
  
  console.log('\n=== 测试完成 ===\n');
}

main().catch(console.error);
