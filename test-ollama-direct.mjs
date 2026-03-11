// 直接测试 Ollama API
async function testOllamaDirect() {
  console.log('=== 直接测试 Ollama API ===\n');

  const startTime = Date.now();
  
  try {
    console.log('1. 发送请求到 Ollama...');
    
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:4b',
        prompt: '你好，请简单介绍一下你自己',
        stream: false
      })
    });

    console.log('✓ 响应状态:', response.status);
    
    const data = await response.json();
    console.log('✓ 响应内容:', data.response?.substring(0, 100) + '...');
    console.log('✓ 耗时:', Date.now() - startTime, 'ms');
    
  } catch (error) {
    console.error('✗ 错误:', error.message);
    console.error('   耗时:', Date.now() - startTime, 'ms');
  }
}

testOllamaDirect();
