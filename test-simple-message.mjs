async function testSimpleMessage() {
  console.log('=== Testing Simple Message ===\n');

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

  // 2. Send a simple message with timeout
  console.log('\n2. Sending message (with 30s timeout)...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const messageRes = await fetch(`http://localhost:${PORT}/api/session/${sessionData.sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log('Response status:', messageRes.status);

    // Read first chunk of response
    const reader = messageRes.body.getReader();
    const decoder = new TextDecoder();

    console.log('Reading response...');
    const { value } = await reader.read();
    const chunk = decoder.decode(value);
    console.log('First chunk:', chunk);

    reader.releaseLock();
    console.log('\nTest completed successfully!');
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.log('Request timed out after 30 seconds');
    } else {
      console.error('Error:', error);
    }
  }
}

testSimpleMessage().catch(console.error);
