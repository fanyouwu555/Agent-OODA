async function testVerification() {
  console.log('=== 验证修复效果 ===\n');

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
    body: JSON.stringify({ message: '你好，请简单介绍一下你自己' })
  });

  console.log('✓ 消息发送成功');
  console.log('  响应状态:', messageRes.status);
  console.log('  Content-Type:', messageRes.headers.get('content-type'));

  // 3. 读取 SSE 流
  console.log('\n3. 读取 SSE 事件流...');
  const reader = messageRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventCount = 0;
  let hasResult = false;
  let hasError = false;

  // 设置超时
  const timeout = setTimeout(() => {
    console.log('\n⚠ 读取超时（30秒）');
    reader.cancel();
  }, 30000);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('\n✓ 事件流结束');
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
                console.log(`\n✓ 收到结果事件 (#${eventCount}):`);
                console.log('  内容:', event.content?.substring(0, 100) + '...');
              } else if (event.type === 'error') {
                hasError = true;
                console.log(`\n✗ 收到错误事件 (#${eventCount}):`);
                console.log('  错误:', event.content);
              } else {
                console.log(`  事件 #${eventCount}: ${event.type}${event.content ? ' - ' + event.content.substring(0, 50) + '...' : ''}`);
              }
            } catch (e) {
              console.log('  解析错误:', data);
            }
          }
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const endTime = Date.now();
  
  console.log('\n=== 验证结果 ===');
  console.log(`总耗时: ${(endTime - startTime) / 1000}秒`);
  console.log(`收到事件数: ${eventCount}`);
  console.log(`收到结果: ${hasResult ? '✓ 是' : '✗ 否'}`);
  console.log(`发生错误: ${hasError ? '✗ 是' : '✓ 否'}`);
  
  if (hasResult && !hasError) {
    console.log('\n✓✓✓ 修复验证成功！前端可以正常收到回复。');
  } else {
    console.log('\n✗✗✗ 修复验证失败，仍有问题需要解决。');
  }
}

testVerification().catch(console.error);
