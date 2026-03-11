async function testOllamaWithTimeout() {
  console.log('Testing Ollama API with 60s timeout...');
  const startTime = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('Aborting after 60s...');
    controller.abort();
  }, 60000);
  
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
    console.log('Time to response:', (Date.now() - startTime) / 1000, 'seconds');
    
    const data = await response.json();
    console.log('Response:', data.response);
    console.log('Total time:', (Date.now() - startTime) / 1000, 'seconds');
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Error:', error.name, error.message);
    console.log('Time elapsed:', (Date.now() - startTime) / 1000, 'seconds');
  }
}

testOllamaWithTimeout();
