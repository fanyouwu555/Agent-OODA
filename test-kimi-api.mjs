async function testKimiAPI() {
  console.log('Testing Kimi API...');
  const startTime = Date.now();
  
  const apiKey = 'sk-Qtd5wAEtXggG8DTRAXSpmLf2tx6wslDBcaZulB61Ih63PYW6';
  
  try {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [
          { role: 'user', content: '你好，请简单回复' }
        ],
        temperature: 0.7,
        max_tokens: 50,
        stream: false
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Time:', (Date.now() - startTime) / 1000, 'ms');
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testKimiAPI();
