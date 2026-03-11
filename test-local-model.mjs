// test-local-model.mjs

const OLLAMA_BASE_URL = 'http://localhost:11434';
const MODEL_NAME = 'qwen3:8b';

async function testOllamaConnection() {
  try {
    console.log('========================================');
    console.log('测试1: Ollama连接');
    console.log('========================================\n');
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('✅ Ollama服务状态: 正常');
    console.log(`✅ 可用模型数量: ${data.models.length}`);
    
    if (data.models.length > 0) {
      console.log('✅ 已安装模型:');
      data.models.forEach(model => {
        const size = (model.size / 1024 / 1024 / 1024).toFixed(2);
        console.log(`   - ${model.name} (${size} GB)`);
      });
    } else {
      console.log('⚠️  没有已安装的模型');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Ollama连接失败:', error.message);
    console.log('\n请确保:');
    console.log('1. Ollama已经安装');
    console.log('2. Ollama服务正在运行 (运行: ollama serve)');
    console.log('3. 端口11434没有被占用');
    return false;
  }
}

async function testModelGeneration() {
  try {
    console.log('\n========================================');
    console.log('测试2: 模型生成');
    console.log('========================================\n');
    
    console.log(`正在测试模型: ${MODEL_NAME}`);
    console.log('提示词: 你好，请用一句话介绍你自己。\n');
    
    const startTime = Date.now();
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: '你好，请用一句话介绍你自己。',
        stream: false
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const endTime = Date.now();
    
    console.log('✅ 模型响应成功');
    console.log(`✅ 响应时间: ${endTime - startTime}ms`);
    console.log(`✅ 响应内容: ${data.response}`);
    
    if (data.eval_count) {
      console.log(`✅ 生成token数: ${data.eval_count}`);
      console.log(`✅ 速度: ${(data.eval_count / ((endTime - startTime) / 1000)).toFixed(2)} tokens/s`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ 模型生成失败:', error.message);
    
    if (error.message.includes('model not found')) {
      console.log('\n请先下载模型:');
      console.log(`  ollama pull ${MODEL_NAME}`);
    }
    
    return false;
  }
}

async function testStreamingGeneration() {
  try {
    console.log('\n========================================');
    console.log('测试3: 流式生成');
    console.log('========================================\n');
    
    console.log(`正在测试流式生成: ${MODEL_NAME}`);
    console.log('提示词: 请用三句话介绍Python编程语言。\n');
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: '请用三句话介绍Python编程语言。',
        stream: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log('✅ 流式响应:');
    process.stdout.write('   ');
    
    const reader = response.body;
    let fullResponse = '';
    
    for await (const chunk of reader) {
      const text = chunk.toString();
      const lines = text.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            process.stdout.write(data.response);
            fullResponse += data.response;
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
    
    console.log('\n\n✅ 流式生成成功');
    
    return true;
  } catch (error) {
    console.error('❌ 流式生成失败:', error.message);
    return false;
  }
}

async function testChatCompletion() {
  try {
    console.log('\n========================================');
    console.log('测试4: 聊天补全 (OpenAI兼容接口)');
    console.log('========================================\n');
    
    console.log(`正在测试OpenAI兼容接口: ${MODEL_NAME}`);
    console.log('消息: 你好，请介绍一下你自己。\n');
    
    const response = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          {
            role: 'user',
            content: '你好，请介绍一下你自己。'
          }
        ],
        temperature: 0.7,
        max_tokens: 100
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('✅ OpenAI兼容接口响应成功');
    console.log(`✅ 响应内容: ${data.choices[0].message.content}`);
    console.log(`✅ 使用token数: ${data.usage.total_tokens}`);
    
    return true;
  } catch (error) {
    console.error('❌ OpenAI兼容接口失败:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('========================================');
  console.log('OODA Agent 本地模型测试');
  console.log('========================================\n');
  
  const results = [];
  
  // 测试1: 连接测试
  results.push(await testOllamaConnection());
  
  // 如果连接成功，继续其他测试
  if (results[0]) {
    results.push(await testModelGeneration());
    results.push(await testStreamingGeneration());
    results.push(await testChatCompletion());
  }
  
  // 生成测试报告
  console.log('\n========================================');
  console.log('测试报告');
  console.log('========================================\n');
  
  const passedTests = results.filter(r => r).length;
  const totalTests = results.length;
  
  console.log(`总测试数: ${totalTests}`);
  console.log(`通过测试: ${passedTests}`);
  console.log(`失败测试: ${totalTests - passedTests}`);
  console.log(`通过率: ${((passedTests / totalTests) * 100).toFixed(2)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n✅ 所有测试通过！本地模型已成功接入。');
    console.log('\n下一步:');
    console.log('1. 启动服务器: npx tsx packages/server/src/index.ts');
    console.log('2. 测试API: curl http://localhost:3000/health');
    console.log('3. 开始使用: 访问 http://localhost:3000/api/skills');
  } else {
    console.log('\n⚠️  部分测试失败，请检查配置。');
  }
  
  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

runTests();
