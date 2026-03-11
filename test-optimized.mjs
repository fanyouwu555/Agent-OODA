async function testOptimized() {
  console.log('=== 测试优化后的流程 ===\n');

  const PORT = 3000;

  // 1. 创建会话
  console.log('1. 创建会话...');
  const sessionRes = await fetch(`http://localhost:${PORT}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  const sessionData = await sessionRes.json();
  console.log('✓ 会话创建成功:', sessionData.sessionId);

  // 2. 发送消息
  console.log('\n2. 发送消息...');
  const startTime = Date.now();

  const messageRes = await fetch(`http://localhost:${PORT}/api/session/${sessionData.sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '你好，请介绍一下自己' })
  });

  console.log('✓ 请求发送成功，状态:', messageRes.status);

  // 3. 读取 SSE 流
  console.log('\n3. 读取 SSE 事件流...');
  const reader = messageRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventCount = 0;
  let hasResult = false;
  let resultContent = '';

  // 设置超时
  const READ_TIMEOUT = 60000;

  try {
    while (true) {
      if (Date.now() - startTime > READ_TIMEOUT) {
        console.log('\n⚠ 读取超时');
        break;
      }

      const { done, value } = await reader.read();

      if (done) {
        console.log('\n✓ SSE 流结束');
        break;
      }

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

              if (event.type === 'result') {
                hasResult = true;
                resultContent = event.content;
                console.log(`\n✓ 收到最终结果 (#${eventCount}):`);
                console.log('   内容:', event.content?.substring(0, 150) + '...');
              } else if (event.type === 'error') {
                console.log(`\n✗ 收到错误 (#${eventCount}):`, event.content);
              } else if (event.type === 'thinking') {
                console.log(`   [${eventCount}] 思考中...`);
              } else {
                console.log(`   [${eventCount}] 事件: ${event.type}`);
              }
            } catch (e) {
              console.log('   解析错误:', data);
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const endTime = Date.now();

  console.log('\n=== 测试结果 ===');
  console.log(`总耗时: ${(endTime - startTime) / 1000}秒`);
  console.log(`收到事件数: ${eventCount}`);
  console.log(`收到结果: ${hasResult ? '✓ 是' : '✗ 否'}`);

  if (hasResult) {
    console.log('\n✓✓✓ 优化后的流程测试成功！');
    console.log('回复内容:', resultContent?.substring(0, 200) + '...');
  } else {
    console.log('\n✗✗✗ 测试失败，没有收到结果');
  }
}

testOptimized().catch(console.error);
