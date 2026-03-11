async function testFix() {
  console.log('=== Testing Fix ===\n');

  const PORT = 3002;

  // 1. Create session
  console.log('1. Creating session...');
  const sessionRes = await fetch(`http://localhost:${PORT}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  const sessionData = await sessionRes.json();
  console.log('Session created:', sessionData.sessionId);

  // 2. Send message
  console.log('\n2. Sending message...');
  const messageRes = await fetch(`http://localhost:${PORT}/api/session/${sessionData.sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '你好，请简单介绍一下你自己' })
  });

  console.log('Response status:', messageRes.status);
  console.log('Response headers:', Object.fromEntries(messageRes.headers.entries()));

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
          try {
            const event = JSON.parse(data);
            eventCount++;
            console.log(`Event ${eventCount}:`, event.type, event.content ? `- ${event.content.substring(0, 100)}...` : '');
          } catch (e) {
            console.log('Raw data:', data);
          }
        }
      }
    }
  }

  console.log(`\nTotal events received: ${eventCount}`);
  console.log('\n=== Test Complete ===');
}

testFix().catch(console.error);
