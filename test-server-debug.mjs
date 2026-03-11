import { spawn } from 'child_process';

const server = spawn('npx', ['tsx', 'packages/server/src/index.ts'], {
  cwd: 'D:/AOpenCode/CustomAgent/AgentProject',
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true
});

server.stdout.on('data', (data) => {
  console.log(`[Server] ${data}`);
});

server.stderr.on('data', (data) => {
  console.error(`[Server Error] ${data}`);
});

setTimeout(async () => {
  console.log('Testing API...');
  
  try {
    const response = await fetch('http://localhost:3000/api/session', {
      method: 'POST'
    });
    const { sessionId } = await response.json();
    console.log('Session ID:', sessionId);
    
    const msgResponse = await fetch(`http://localhost:3000/api/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '你好' })
    });
    
    const reader = msgResponse.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      console.log('Response:', chunk);
    }
  } catch (error) {
    console.error('Test error:', error);
  }
  
  server.kill();
}, 5000);
