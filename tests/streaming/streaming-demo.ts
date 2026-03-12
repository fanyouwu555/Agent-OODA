// tests/streaming/streaming-demo.ts
// OODA Loop 流式输出演示

import { OODALoop } from '../../packages/core/src/ooda/loop';
import {
  StreamingOutputManager,
  StreamingHandler,
  StreamingEvent,
  createConsoleStreamingHandler,
  createStringCollector,
  combineStreamingHandlers,
  StreamingConfig,
} from '../../packages/core/src/ooda/streaming';
import { initializeMemorySystem } from '../../packages/core/src/memory';

// 模拟内存存储库
const mockMemoryRepository = {
  store: async () => 'memory-id',
  search: async () => [],
  get: async () => null,
  update: async () => {},
  delete: async () => {},
  list: async () => [],
  clear: async () => {},
};

// 创建自定义流式处理器 - WebSocket 风格
function createWebSocketStreamingHandler(): StreamingHandler {
  return {
    onEvent: async (event: StreamingEvent) => {
      // 模拟 WebSocket 发送
      const message = {
        type: event.type,
        phase: event.phase,
        content: event.content,
        progress: event.progress,
        timestamp: event.timestamp,
      };
      
      // 在实际应用中，这里会发送到 WebSocket
      console.log('[WebSocket] 发送消息:', JSON.stringify(message, null, 2));
    },
  };
}

// 创建自定义流式处理器 - UI 更新风格
function createUIStreamingHandler(): StreamingHandler {
  const uiState = {
    currentPhase: '',
    thinking: '',
    content: '',
    progress: 0,
    tools: [] as string[],
  };

  return {
    onEvent: async (event: StreamingEvent) => {
      switch (event.type) {
        case 'phase_start':
          uiState.currentPhase = event.phase || '';
          console.log(`[UI] 更新阶段: ${uiState.currentPhase}`);
          break;
        case 'phase_complete':
          console.log(`[UI] 阶段完成: ${event.phase}`);
          break;
        case 'thinking':
          uiState.thinking = event.content || '';
          console.log(`[UI] 更新思考: ${uiState.thinking.substring(0, 50)}...`);
          break;
        case 'content':
          uiState.content += event.content || '';
          uiState.progress = event.progress || 0;
          process.stdout.write(`[UI] 内容进度: ${uiState.progress.toFixed(0)}%\r`);
          break;
        case 'tool_call':
          uiState.tools.push(event.metadata?.toolName as string);
          console.log(`\n[UI] 工具调用: ${event.metadata?.toolName}`);
          break;
        case 'complete':
          console.log('\n[UI] 处理完成!');
          console.log('[UI] 最终状态:', {
            phase: uiState.currentPhase,
            contentLength: uiState.content.length,
            toolsUsed: uiState.tools,
          });
          break;
      }
    },
  };
}

// 演示 1: 基本控制台流式输出
async function demoBasicConsoleStreaming() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  演示 1: 基本控制台流式输出                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  initializeMemorySystem(mockMemoryRepository as any, false);

  const handler = createConsoleStreamingHandler();
  const loop = new OODALoop('demo-session-1', handler, {
    enabled: true,
    showThinking: true,
    showProgress: true,
    chunkSize: 5,
    delayBetweenChunks: 100,
  });

  // 模拟 OODA 事件流
  const events = [
    { phase: 'observe' as const },
    { phase: 'orient' as const, data: { intent: 'file_read' } },
    { phase: 'decide' as const, data: { reasoning: '用户想要读取文件', selectedOption: '使用 read_file 工具' } },
    { phase: 'act' as const, data: { toolCall: { id: '1', name: 'read_file', args: { path: 'test.txt' } } } },
    { phase: 'tool_result' as const, data: { toolCall: { id: '1', name: 'read_file', args: {}, result: '文件内容' } } },
    { phase: 'feedback' as const, data: { feedback: { observations: ['读取成功'], issues: [], suggestions: [] } } },
    { phase: 'complete' as const },
  ];

  for (const event of events) {
    await loop.getStreamingManager()?.handleOODAEvent(event);
    await sleep(500);
  }

  // 流式输出内容
  console.log('\n--- 流式输出内容 ---');
  await loop.getStreamingManager()?.streamContent(
    '这是一个演示流式输出的示例文本。内容会被分块输出，模拟真实的打字机效果。',
    { source: 'demo' }
  );
}

// 演示 2: 多处理器组合
async function demoCombinedHandlers() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  演示 2: 多处理器组合                                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const consoleHandler = createConsoleStreamingHandler();
  const uiHandler = createUIStreamingHandler();
  const { handler: collectorHandler, getOutput } = createStringCollector();

  const combinedHandler = combineStreamingHandlers([consoleHandler, uiHandler, collectorHandler]);

  const manager = new StreamingOutputManager(combinedHandler, {
    enabled: true,
    showThinking: true,
    showProgress: false,
    chunkSize: 8,
    delayBetweenChunks: 50,
  });

  // 模拟处理流程
  await manager.handleOODAEvent({ phase: 'observe' });
  await sleep(300);

  await manager.handleOODAEvent({ phase: 'orient', data: { intent: 'code_analysis' } });
  await sleep(300);

  await manager.handleOODAEvent({ phase: 'decide', data: { reasoning: '需要分析代码结构' } });
  await sleep(300);

  await manager.handleOODAEvent({ phase: 'act', data: { toolCall: { id: '1', name: 'read_file', args: {} } } });
  await sleep(300);

  // 流式输出分析结果
  console.log('\n--- 流式输出分析结果 ---');
  await manager.streamContent(
    '代码分析完成。发现以下问题：1. 缺少错误处理 2. 函数过长 3. 变量命名不规范。建议进行重构。'
  );

  await manager.handleOODAEvent({ phase: 'complete' });

  console.log('\n--- 收集到的完整输出 ---');
  console.log(getOutput());
}

// 演示 3: 配置切换
async function demoConfigSwitching() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  演示 3: 配置切换                                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const handler = createConsoleStreamingHandler();
  const manager = new StreamingOutputManager(handler, {
    enabled: true,
    showThinking: true,
    showProgress: true,
    chunkSize: 10,
    delayBetweenChunks: 100,
  });

  console.log('--- 配置 A: 显示思考过程 ---');
  await manager.streamContent('这是第一段内容，会显示思考过程。');

  // 切换到不显示思考过程
  manager.updateConfig({ showThinking: false });
  console.log('\n--- 配置 B: 不显示思考过程 ---');
  await manager.streamContent('这是第二段内容，不显示思考过程。');

  // 切换到更快的输出
  manager.updateConfig({ delayBetweenChunks: 30, chunkSize: 5 });
  console.log('\n--- 配置 C: 更快的输出速度 ---');
  await manager.streamContent('这是第三段内容，输出速度更快。');

  // 禁用流式输出
  manager.updateConfig({ enabled: false });
  console.log('\n--- 配置 D: 禁用流式输出 ---');
  await manager.streamContent('这段内容不会被流式输出。');
  console.log('（内容被跳过）');
}

// 演示 4: 错误处理
async function demoErrorHandling() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  演示 4: 错误处理                                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const handler = createConsoleStreamingHandler();
  const manager = new StreamingOutputManager(handler);

  await manager.handleOODAEvent({ phase: 'observe' });
  await manager.handleOODAEvent({ phase: 'orient', data: { intent: 'file_write' } });
  await manager.handleOODAEvent({ phase: 'decide' });
  await manager.handleOODAEvent({ phase: 'act', data: { toolCall: { id: '1', name: 'write_file', args: {} } } });

  // 模拟错误
  await manager.emitError(new Error('文件写入失败：权限不足'));

  await manager.handleOODAEvent({
    phase: 'feedback',
    data: {
      feedback: {
        observations: [],
        issues: ['文件写入失败'],
        suggestions: ['检查文件权限', '尝试写入其他位置'],
      },
    },
  });
}

// 演示 5: 进度跟踪
async function demoProgressTracking() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  演示 5: 进度跟踪                                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const handler = createConsoleStreamingHandler();
  const manager = new StreamingOutputManager(handler, {
    enabled: true,
    showProgress: true,
  });

  console.log('模拟长时间任务进度...\n');

  const totalSteps = 10;
  for (let i = 0; i <= totalSteps; i++) {
    const progress = (i / totalSteps) * 100;
    await manager.emitProgress(progress, `处理步骤 ${i}/${totalSteps}`);
    await sleep(200);
  }

  console.log('\n任务完成!');
}

// 辅助函数
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 运行所有演示
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         OODA Loop 流式输出演示                              ║');
  console.log('║         展示实时进度和状态更新                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await demoBasicConsoleStreaming();
    await sleep(1000);

    await demoCombinedHandlers();
    await sleep(1000);

    await demoConfigSwitching();
    await sleep(1000);

    await demoErrorHandling();
    await sleep(1000);

    await demoProgressTracking();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                   所有演示完成!                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('演示出错:', error);
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as runStreamingDemo };
