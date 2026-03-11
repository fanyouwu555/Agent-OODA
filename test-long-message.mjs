async function testSimpleMessageLong() {
  console.log('Testing simple message flow with long timeout...');
  
  // 1. Create session
  const sessionRes = await fetch('http://localhost:3000/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  const sessionData = await sessionRes.json();
  console.log('Session created:', sessionData.sessionId);
  
  // 2. Send message and wait for first response
  console.log('Sending message...');
  const startTime = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('Timeout after 180s');
    controller.abort();
  }, 180000);
  
  try {
    const messageRes = await fetch(`http://localhost:3000/api/session/${sessionData.sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hi' }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log('Response status:', messageRes.status);
    console.log('Time:', (Date.now() - startTime) / 1000, 'seconds');
    
    // Read all events
    const reader = messageRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('Stream ended');
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
            console.log(`Event ${eventCount}:`, data.substring(0, 150));
          }
        }
      }
    }
    
    console.log('Test completed');
    console.log('Total events:', eventCount);
    console.log('Total time:', (Date.now() - startTime) / 1000, 'seconds');
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Error:', error.message);
  }
}

testSimpleMessageLong();
