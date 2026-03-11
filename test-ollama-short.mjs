async function testOllamaShort() {
  console.log('Testing Ollama with short prompt...');
  console.log('Time:', new Date().toISOString());
  
  const startTime = Date.now();
  
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:4b',
        prompt: 'Hi',
        stream: false,
        options: {
          num_predict: 10,
          temperature: 0.1
        }
      })
    });
    
    console.log('Response status:', response.status);
    
    const data = await response.json();
    const endTime = Date.now();
    
    console.log('Response time:', (endTime - startTime) / 1000, 'seconds');
    console.log('Response:', data.response);
  } catch (error) {
    console.error('Error:', error);
  }
}

testOllamaShort().catch(console.error);
