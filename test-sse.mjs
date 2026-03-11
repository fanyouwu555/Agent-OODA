async function testSSE() {
  console.log('Testing SSE connection...');
  
  try {
    const sessionResponse = await fetch('http://localhost:3000/api/session', {
      method: 'POST'
    });
    const { sessionId } = await sessionResponse.json();
    console.log('Session ID:', sessionId);
    
    console.log('Sending message...');
    const msgResponse = await fetch(`http://localhost:3000/api/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '你好' })
    });
    
    console.log('Response status:', msgResponse.status);
    console.log('Response headers:', Object.fromEntries(msgResponse.headers.entries()));
    
    const reader = msgResponse.body.getReader();
    const decoder = new TextDecoder();
    
    let receivedEvents = 0;
    const startTime = Date.now();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('Stream ended after', (Date.now() - startTime) / 1000, 'seconds');
        break;
      }
      
      const chunk = decoder.decode(value, { stream: true });
      receivedEvents++;
      console.log(`\n=== Event ${receivedEvents} ===`);
      console.log(chunk);
      
      if (receivedEvents > 30 || (Date.now() - startTime) > 180000) {
        console.log('Too many events or timeout, stopping...');
        break;
      }
    }
    
    console.log('Total events received:', receivedEvents);
  } catch (error) {
    console.error('Error:', error);
  }
}

testSSE();
