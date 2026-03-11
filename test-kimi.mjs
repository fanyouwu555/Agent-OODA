// 测试 Kimi API
async function testKimi() {
  console.log('=== 测试 Kimi API ===\n');

  const API_KEY = 'sk-Qtd5wAEtXggG8DTRAXSpmLf2tx6wslDBcaZulB61Ih63PYW6';
  const startTime = Date.now();

  try {
    console.log('1. 发送请求到 Kimi...');

    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [
          { role: 'user', content: '你好，请简单介绍一下你自己' }
        ],
        stream: false
      })
    });

    console.log('✓ 响应状态:', response.status);

    const data = await response.json();
    console.log('✓ 响应内容:', data.choices?.[0]?.message?.content?.substring(0, 100) + '...');
    console.log('✓ 耗时:', Date.now() - startTime, 'ms');

  } catch (error) {
    console.error('✗ 错误:', error.message);
    console.error('   耗时:', Date.now() - startTime, 'ms');
  }
}

testKimi();
