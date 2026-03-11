async function testOllamaWithTimeout() {
  console.log('Testing Ollama API with extended timeout...');
  console.log('Start time:', new Date().toISOString());
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('Aborting after 180 seconds...');
    controller.abort();
  }, 180000);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'qwen3:4b',
        prompt: 'Hi',
        stream: false,
        options: {num_predict: 5}
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log('Response status:', response.status);
    console.log('Response time:', (Date.now() - startTime) / 1000, 'seconds');
    
    if (response.ok) {
      const data = await response.json();
      console.log('Response:', data.response);
    } else {
      const text = await response.text();
      console.log('Error response:', text);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Error:', error.name, error.message);
  }
  
  console.log('End time:', new Date().toISOString());
}

testOllamaWithTimeout();
