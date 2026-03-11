async function testDebug() {
  console.log('=== 详细调试测试 ===\n');

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

  // 2. 发送消息并追踪 SSE 事件
  console.log('\n2. 发送消息并追踪 SSE 事件...');
  console.log('   时间:', new Date().toLocaleTimeString());
  
  const startTime = Date.now();
  
  try {
    const messageRes = await fetch(`http://localhost:${PORT}/api/session/${sessionData.sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '你好' })
    });

    console.log('✓ 请求发送成功，状态:', messageRes.status);
    console.log('   Content-Type:', messageRes.headers.get('content-type'));
    console.log('   耗时:', Date.now() - startTime, 'ms');

    // 读取 SSE 流
    console.log('\n3. 开始读取 SSE 流...');
    const reader = messageRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    let lastEventTime = Date.now();

    // 设置读取超时
    const READ_TIMEOUT = 60000; // 60秒
    
    while (true) {
      // 检查是否超时
      if (Date.now() - startTime > READ_TIMEOUT) {
        console.log('\n⚠ 读取超时（60秒）');
        console.log('   收到事件数:', eventCount);
        console.log('   最后事件时间:', new Date(lastEventTime).toLocaleTimeString());
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      
      if (done) {
        console.log('\n✓ SSE 流正常结束');
        console.log('   总事件数:', eventCount);
        console.log('   总耗时:', Date.now() - startTime, 'ms');
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      // 处理完整的行
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          if (data) {
            try {
              const event = JSON.parse(data);
              eventCount++;
              lastEventTime = Date.now();
              
              const timeElapsed = Date.now() - startTime;
              
              if (event.type === 'result') {
                console.log(`\n✓ [${timeElapsed}ms] 收到最终结果:`);
                console.log('   内容:', event.content?.substring(0, 100) + (event.content?.length > 100 ? '...' : ''));
              } else if (event.type === 'error') {
                console.log(`\n✗ [${timeElapsed}ms] 收到错误:`);
                console.log('   错误:', event.content);
              } else if (event.type === 'thinking') {
                console.log(`   [${timeElapsed}ms] 思考中: ${event.content?.substring(0, 50)}...`);
              } else {
                console.log(`   [${timeElapsed}ms] 事件: ${event.type}${event.content ? ' - ' + event.content.substring(0, 30) : ''}`);
              }
            } catch (e) {
              console.log('   解析错误:', data);
            }
          }
        }
      }
    }

    console.log('\n=== 测试完成 ===');
    console.log('总耗时:', Date.now() - startTime, 'ms');
    console.log('收到事件数:', eventCount);
    
  } catch (error) {
    console.error('\n✗ 请求失败:', error.message);
    console.error('耗时:', Date.now() - startTime, 'ms');
  }
}

testDebug().catch(console.error);
