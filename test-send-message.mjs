async function testSendMessage() {
  try {
    const sessionResponse = await fetch('http://localhost:3000/api/session', {
      method: 'POST'
    });
    const { sessionId } = await sessionResponse.json();
    console.log('Session ID:', sessionId);
    
    const response = await fetch(`http://localhost:3000/api/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '你好' })
    });
    
    console.log('Response status:', response.status);
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      console.log('Chunk:', chunk);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testSendMessage();
