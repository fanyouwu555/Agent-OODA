const testApi = async () => {
    const baseUrl = 'http://localhost:3005';
    
    console.log('========================================');
    console.log('OODA Agent 功能测试');
    console.log('========================================\n');
    
    try {
        console.log('检查服务器状态...');
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
        const messageRes = await fetch(`${baseUrl}/api/session/${session.sessionId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '什么是OODA循环？' }),
        });
        
        console.log(`响应状态: ${messageRes.status}`);
        
        const reader = messageRes.body.getReader();
        const decoder = new TextDecoder();
        let fullResult = '';
        let eventCount = 0;
        
        console.log('\n3. 接收响应 (SSE流):\n');
        console.log('-'.repeat(50));
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('\n[流结束]');
                break;
            }
            
            const chunk = decoder.decode(value, { stream: true });
            process.stdout.write(chunk);
            
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    eventCount++;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'result') {
                            fullResult = data.content;
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }
        
        console.log('-'.repeat(50));
        console.log(`\n收到事件数: ${eventCount}`);
        console.log('\n========================================');
        console.log('测试结果');
        console.log('========================================');
        
        if (fullResult && fullResult.length > 20) {
            console.log('✅ 测试通过 - 生成了有效响应');
            console.log(`响应长度: ${fullResult.length} 字符`);
            console.log(`\n响应内容:\n${fullResult}`);
        } else {
            console.log('❌ 测试失败 - 响应无效或过短');
            console.log(`响应: "${fullResult}"`);
        }
        
    } catch (error) {
        console.error('测试失败:', error.message);
        console.log('\n请确保服务器正在运行: npm run dev:server');
    }
};

testApi();
