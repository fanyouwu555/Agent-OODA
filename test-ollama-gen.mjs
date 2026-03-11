async function testOllamaGeneration() {
  console.log('Testing Ollama generation...');
  console.log('Time:', new Date().toISOString());
  
  const startTime = Date.now();
  
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3:4b',
      prompt: 'Hello',
      stream: false
    })
  });
  
  const data = await response.json();
  const endTime = Date.now();
  
  console.log('Response time:', (endTime - startTime) / 1000, 'seconds');
  console.log('Response:', data.response);
}

testOllamaGeneration().catch(console.error);
