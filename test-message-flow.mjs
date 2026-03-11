async function testMessageFlow() {
  console.log('=== Testing Message Flow ===\n');
  
  // 1. Create session
  console.log('1. Creating session...');
  const sessionRes = await fetch('http://localhost:3000/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  const sessionData = await sessionRes.json();
  console.log('Session created:', sessionData.sessionId);
  
  // 2. Send message with timeout
  console.log('\n2. Sending message...');
  const startTime = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('Request timeout after 120s, aborting...');
    controller.abort();
  }, 120000);
  
  try {
    const messageRes = await fetch(`http://localhost:3000/api/session/${sessionData.sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '你好' }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log('Response status:', messageRes.status);
    console.log('Time to first response:', (Date.now() - startTime) / 1000, 'seconds');
    
    // 3. Read SSE stream
    console.log('\n3. Reading SSE stream...');
    const reader = messageRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('\nStream ended');
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          if (data) {
            eventCount++;
            try {
              const event = JSON.parse(data);
              const preview = event.content ? event.content.substring(0, 80) : '';
              console.log(`[${eventCount}] Event: ${event.type}`, preview ? `- ${preview}...` : '');
            } catch (e) {
              console.log(`[${eventCount}] Raw data:`, data.substring(0, 100));
            }
          }
        }
      }
    }
    
    console.log('\n=== Test Complete ===');
    console.log('Total time:', (Date.now() - startTime) / 1000, 'seconds');
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Error:', error.name, error.message);
  }
}

testMessageFlow().catch(console.error);
