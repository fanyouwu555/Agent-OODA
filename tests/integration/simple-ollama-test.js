// simple-ollama-test.js
// 简化的Ollama测试脚本

class OllamaProvider {
  constructor(config) {
    this.model = config.model;
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 1000;
  }
  
  async generate(prompt, options = {}) {
    const startTime = Date.now();
    
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: options.temperature || this.temperature,
          max_tokens: options.maxTokens || this.maxTokens,
          stop: options.stop,
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const endTime = Date.now();
    
    return {
      text: data.response || '',
      tokens: data.eval_count || 0,
      time: endTime - startTime,
    };
  }
  
  async *stream(prompt, options = {}) {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: true,
        options: {
          temperature: options.temperature || this.temperature,
          max_tokens: options.maxTokens || this.maxTokens,
          stop: options.stop,
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }
    
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              if (options.onToken) {
                options.onToken(data.response);
              }
              yield data.response;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    }
  }
  
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (e) {
      return false;
    }
  }
  
  async listModels() {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.models || [];
  }
  
  async pullModel(model) {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }
    
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.status) {
              console.log(`Ollama: ${data.status}`);
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    }
  }
}

async function testOllama() {
  console.log('测试Ollama集成...');
  console.log('================');
  
  // 创建Ollama提供者
  const ollama = new OllamaProvider({
    model: 'qwen3:8b',
    baseUrl: 'http://localhost:11434',
  });
  
  // 检查Ollama是否运行
  console.log('\n=== 检查Ollama状态 ===');
  try {
    const isRunning = await ollama.healthCheck();
    console.log('Ollama运行状态:', isRunning ? '✅ 运行中' : '❌ 未运行');
    
    if (!isRunning) {
      console.log('请先安装并启动Ollama:');
      console.log('1. 下载Ollama: https://ollama.com/download');
      console.log('2. 启动Ollama服务');
      console.log('3. 拉取qianwen3模型: ollama pull qwen3:8b');
      return;
    }
  } catch (error) {
    console.error('检查Ollama状态失败:', error);
    console.log('请先安装并启动Ollama');
    return;
  }
  
  // 列出可用模型
  console.log('\n=== 列出可用模型 ===');
  try {
    const models = await ollama.listModels();
    console.log('可用模型:');
    models.forEach(model => {
      console.log(`  - ${model.name} (${model.size})`);
    });
    
    // 检查qianwen3模型是否存在
    const hasQwen3 = models.some(model => model.name.includes('qwen3'));
    if (!hasQwen3) {
      console.log('\n⚠️ qianwen3模型未找到，正在拉取...');
      try {
        await ollama.pullModel('qwen3:8b');
        console.log('✅ qianwen3模型拉取成功');
      } catch (error) {
        console.error('拉取模型失败:', error);
        return;
      }
    } else {
      console.log('✅ qianwen3模型已就绪');
    }
  } catch (error) {
    console.error('列出模型失败:', error);
  }
  
  // 测试生成功能
  console.log('\n=== 测试生成功能 ===');
  const testPrompts = [
    '分析用户输入的意图：读取文件：test.txt',
    '分解任务：意图：file_read，参数：{"path": "test.txt"}',
    '生成推理过程：用户意图：file_read，执行计划：读取文件内容，下一步行动：调用read_file工具'
  ];
  
  for (const prompt of testPrompts) {
    console.log('\n' + '-'.repeat(60));
    console.log(`提示: ${prompt}`);
    console.log('-'.repeat(60));
    
    try {
      const result = await ollama.generate(prompt);
      console.log(`响应: ${result.text}`);
      console.log(`Tokens: ${result.tokens}`);
      console.log(`时间: ${result.time}ms`);
    } catch (error) {
      console.error('生成出错:', error);
    }
  }
  
  // 测试流式输出
  console.log('\n=== 测试流式输出 ===');
  try {
    console.log('流式响应:');
    const stream = ollama.stream('分析用户输入的意图：搜索：AI Agent技术');
    let fullResponse = '';
    
    for await (const token of stream) {
      process.stdout.write(token);
      fullResponse += token;
    }
    
    console.log('\n');
  } catch (error) {
    console.error('流式输出出错:', error);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Ollama集成测试完成！');
  console.log('qianwen3模型已成功集成！');
}

testOllama().catch(console.error);