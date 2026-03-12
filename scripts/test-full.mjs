import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

async function runTest() {
    console.log('========================================');
    console.log('OODA Agent 功能测试');
    console.log('========================================\n');
    
    console.log('启动服务器...');
    const server = spawn('npm', ['run', 'dev:server'], {
        cwd: process.cwd(),
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let serverPort = 0;
    let serverReady = false;
    
    server.stdout.on('data', (data) => {
        const output = data.toString();
        const portMatch = output.match(/Server running on port (\d+)/);
        if (portMatch) {
            serverPort = parseInt(portMatch[1]);
            console.log(`[服务器] 检测到端口: ${serverPort}`);
        }
        if (output.includes('Skills initialized')) {
            serverReady = true;
        }
    });
    
    server.stderr.on('data', (data) => {
        // 忽略
    });
    
    console.log('等待服务器启动...');
    
    let retries = 0;
    while (!serverReady && retries < 30) {
        await sleep(1000);
        retries++;
    }
    
    if (!serverReady || !serverPort) {
        console.log('服务器启动超时');
        server.kill();
        process.exit(1);
    }
    
    const baseUrl = `http://localhost:${serverPort}`;
    console.log(`服务器地址: ${baseUrl}`);
    
    try {
        console.log('\n检查服务器状态...');
        const healthRes = await fetch(`${baseUrl}/health`);
        console.log(`服务器状态: ${healthRes.status}`);
        
        console.log('\n1. 创建会话...');
        const sessionRes = await fetch(`${baseUrl}/api/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        const session = await sessionRes.json();
        console.log(`会话ID: ${session.sessionId}`);
        
        console.log('\n2. 发送消息: "什么是OODA循环？"');
        console.log('等待响应 (可能需要较长时间, 因为需要调用 LLM)...\n');
        
        const startTime = Date.now();
        
        const messageRes = await fetch(`${baseUrl}/api/session/${session.sessionId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '什么是OODA循环？' }),
        });
        
        console.log(`响应状态: ${messageRes.status}`);
        
        if (messageRes.status !== 200) {
            const errorText = await messageRes.text();
            console.log(`错误响应: ${errorText}`);
            throw new Error(`HTTP ${messageRes.status}`);
        }
        
        const reader = messageRes.body.getReader();
        const decoder = new TextDecoder();
        let fullResult = '';
        let eventCount = 0;
        
        console.log('接收 SSE 流:\n');
        console.log('-'.repeat(50));
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('\n[流结束]');
                break;
            }
            
            const chunk = decoder.decode(value, { stream: true });
            
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    eventCount++;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'thinking') {
                            console.log(`[思考] ${data.content}`);
                        } else if (data.type === 'intent') {
                            console.log(`[意图] ${data.content}`);
                        } else if (data.type === 'reasoning') {
                            console.log(`[推理] ${data.content?.slice(0, 100)}...`);
                        } else if (data.type === 'result') {
                            fullResult = data.content;
                            console.log(`\n[结果] ${data.content?.slice(0, 300)}...`);
                        } else if (data.type === 'error') {
                            console.log(`[错误] ${data.content}`);
                        } else if (data.type === 'end') {
                            console.log('[完成]');
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('-'.repeat(50));
        console.log(`\n收到事件数: ${eventCount}`);
        console.log(`总耗时: ${duration}秒`);
        console.log('\n========================================');
        console.log('测试结果');
        console.log('========================================');
        
        if (fullResult && fullResult.length > 20) {
            console.log('✅ 测试通过 - 生成了有效响应');
            console.log(`响应长度: ${fullResult.length} 字符`);
            console.log(`\n完整响应:\n${fullResult}`);
        } else {
            console.log('❌ 测试失败 - 响应无效或过短');
            console.log(`响应: "${fullResult}"`);
        }
        
    } catch (error) {
        console.error('测试失败:', error.message);
        console.error(error.stack);
    } finally {
        console.log('\n关闭服务器...');
        server.kill();
        process.exit(0);
    }
}

runTest().catch(console.error);
