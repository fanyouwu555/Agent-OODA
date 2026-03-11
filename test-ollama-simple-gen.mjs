async function testOllamaSimple() {
  console.log('Testing Ollama simple generation...');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.log('Request timeout after 60s, aborting...');
    controller.abort();
  }, 60000);
  
  try {
    const startTime = Date.now();
    
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:4b',
        prompt: 'Hello',
        stream: false
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    console.log('Response status:', response.status);
    console.log('Time:', (Date.now() - startTime) / 1000, 'seconds');
    
    if (response.ok) {
      const data = await response.json();
      console.log('Response text:', data.response);
    } else {
      const text = await response.text();
      console.log('Error response:', text);
    }
  } catch (error) {
    clearTimeout(timeout);
    console.error('Error:', error.message);
  }
}

testOllamaSimple();
