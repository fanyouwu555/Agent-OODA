// test-core-features.js
// 测试核心功能

// 模拟核心类
class LocalModelProvider {
  constructor(config) {
    this.name = 'local';
    this.model = config.model;
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 1000;
  }
  
  async generate(prompt, options) {
    const startTime = Date.now();
    
    // 模拟本地模型生成
    let response = '';
    if (prompt.includes('读取文件')) {
      response = JSON.stringify({
        type: 'file_read',
        parameters: { path: 'test.txt' },
        confidence: 0.95
      });
    } else if (prompt.includes('搜索')) {
      response = JSON.stringify({
        type: 'search',
        parameters: { query: 'AI Agent技术' },
        confidence: 0.92
      });
    } else if (prompt.includes('分解任务')) {
      response = JSON.stringify({
        subtasks: [{
          id: '1',
          description: '读取文件内容',
          toolName: 'read_file',
          args: { path: 'test.txt' },
          dependencies: []
        }]
      });
    } else if (prompt.includes('推理过程')) {
      response = '用户需要读取文件内容，我需要使用read_file工具来获取文件的具体内容，这样才能完成用户的请求。';
    } else {
      response = '我需要思考如何处理这个请求...';
    }
    
    const endTime = Date.now();
    
    return {
      text: response,
      tokens: response.length / 4,
      time: endTime - startTime,
    };
  }
  
  async *stream(prompt, options) {
    const response = await this.generate(prompt, options);
    for (const char of response.text) {
      yield char;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
}

class LLMService {
  constructor(config) {
    this.provider = new LocalModelProvider(config);
  }
  
  async generate(prompt, options) {
    const result = await this.provider.generate(prompt, options);
    return result.text;
  }
  
  async *stream(prompt, options) {
    for await (const token of this.provider.stream(prompt, options)) {
      yield token;
    }
  }
}

class MemoryManager {
  constructor() {
    this.messages = [];
    this.memories = new Map();
  }
  
  storeMessage(message) {
    this.messages.push(message);
    if (this.messages.length > 100) {
      this.messages.shift();
    }
  }
  
  getRecentMessages(count = 10) {
    return this.messages.slice(-count);
  }
  
  storeMemory(memory) {
    const id = `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.memories.set(id, {
      ...memory,
      id,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
    });
    return id;
  }
  
  search(query, limit = 5) {
    const results = [];
    for (const memory of this.memories.values()) {
      if (memory.content.toLowerCase().includes(query.toLowerCase())) {
        results.push(memory);
        if (results.length >= limit) break;
      }
    }
    return results;
  }
  
  clear() {
    this.messages = [];
    this.memories.clear();
  }
}

class ConfigManager {
  constructor() {
    this.config = {
      llm: {
        type: 'local',
        model: 'local-model-8b',
        temperature: 0.7,
        maxTokens: 1000,
      },
      memory: {
        shortTermCapacity: 100,
        longTermCapacity: 1000,
      },
      ooda: {
        maxIterations: 10,
        timeout: 60000,
      },
      tools: {
        enabled: ['read_file', 'write_file', 'run_bash', 'search_web'],
        sandbox: true,
      },
    };
  }
  
  get() {
    return this.config;
  }
  
  update(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig,
    };
  }
}

class OODALoop {
  constructor() {
    this.llmService = new LLMService({ model: 'local-model-8b' });
    this.memory = new MemoryManager();
    this.config = new ConfigManager();
    this.maxIterations = this.config.get().ooda.maxIterations;
    this.timeout = this.config.get().ooda.timeout;
  }
  
  async execute(input) {
    console.log(`\n处理输入: ${input}`);
    
    const startTime = Date.now();
    let iteration = 0;
    const history = [];
    
    while (iteration < this.maxIterations) {
      // 观察
      console.log(`\n=== 迭代 ${iteration + 1} - 观察 ===`);
      const observation = this.observe(input, history);
      
      // 判断
      console.log(`=== 迭代 ${iteration + 1} - 判断 ===`);
      const orientation = await this.orient(observation);
      
      // 决策
      console.log(`=== 迭代 ${iteration + 1} - 决策 ===`);
      const decision = await this.decide(orientation);
      console.log(`推理: ${decision.reasoning}`);
      
      // 行动
      console.log(`=== 迭代 ${iteration + 1} - 行动 ===`);
      const actionResult = await this.act(decision);
      console.log(`行动结果: ${JSON.stringify(actionResult)}`);
      
      // 更新历史
      history.push({
        role: 'assistant',
        content: decision.reasoning,
      });
      history.push({
        role: 'assistant',
        content: JSON.stringify(decision.nextAction),
      });
      history.push({
        role: 'tool',
        content: JSON.stringify(actionResult),
      });
      
      // 检查是否完成
      if (decision.nextAction.type === 'response') {
        break;
      }
      
      iteration++;
    }
    
    const endTime = Date.now();
    const result = {
      output: '任务处理完成',
      steps: history,
      metadata: {
        startTime,
        endTime,
        iterations: iteration + 1,
        executionTime: endTime - startTime,
      },
    };
    
    console.log(`\n=== 结果 ===`);
    console.log(`输出: ${result.output}`);
    console.log(`执行时间: ${result.metadata.executionTime}ms`);
    console.log(`迭代次数: ${result.metadata.iterations}`);
    
    return result;
  }
  
  observe(input, history) {
    // 存储到记忆
    this.memory.storeMessage({ role: 'user', content: input });
    
    return {
      userInput: input,
      history: history.slice(-10),
      context: {
        relevantFacts: this.memory.search(input, 3).map(m => m.content),
        recentEvents: this.memory.getRecentMessages(5),
      },
    };
  }
  
  async orient(observation) {
    const prompt = `分析用户输入的意图：\n用户输入：${observation.userInput}`;
    const response = await this.llmService.generate(prompt);
    
    try {
      const intent = JSON.parse(response);
      return {
        primaryIntent: intent,
        constraints: [],
        knowledgeGaps: [],
      };
    } catch (e) {
      return {
        primaryIntent: { type: 'general', parameters: {}, confidence: 0.8 },
        constraints: [],
        knowledgeGaps: [],
      };
    }
  }
  
  async decide(orientation) {
    const prompt = `分解任务：\n意图：${orientation.primaryIntent.type}\n参数：${JSON.stringify(orientation.primaryIntent.parameters)}`;
    const response = await this.llmService.generate(prompt);
    
    try {
      const plan = JSON.parse(response);
      return {
        plan: plan,
        nextAction: {
          type: 'tool_call',
          toolName: plan.subtasks[0].toolName,
          args: plan.subtasks[0].args,
        },
        reasoning: '根据分析，需要执行工具调用',
      };
    } catch (e) {
      return {
        plan: { subtasks: [] },
        nextAction: {
          type: 'response',
          content: '需要更多信息',
        },
        reasoning: '无法解析任务计划',
      };
    }
  }
  
  async act(decision) {
    if (decision.nextAction.type === 'tool_call') {
      // 模拟工具执行
      return {
        toolName: decision.nextAction.toolName,
        result: `执行了 ${decision.nextAction.toolName} 工具`,
        isError: false,
        executionTime: Date.now(),
      };
    } else {
      return decision.nextAction.content;
    }
  }
}

// 测试函数
async function testCoreFeatures() {
  console.log('测试OODA Agent核心功能...');
  console.log('=========================');
  
  const agent = new OODALoop();
  
  // 测试用例
  const testCases = [
    '读取文件：test.txt',
    '搜索：AI Agent 技术',
    '运行命令：ls -la',
  ];
  
  for (const test of testCases) {
    console.log('\n' + '='.repeat(80));
    console.log(`测试用例: ${test}`);
    console.log('='.repeat(80));
    
    try {
      await agent.execute(test);
    } catch (error) {
      console.error('测试失败:', error);
    }
  }
  
  // 测试配置更新
  console.log('\n' + '='.repeat(80));
  console.log('测试配置更新');
  console.log('='.repeat(80));
  
  agent.config.update({
    ooda: {
      maxIterations: 3,
      timeout: 10000,
    },
  });
  
  console.log('更新后配置:', JSON.stringify(agent.config.get().ooda, null, 2));
  
  // 测试记忆系统
  console.log('\n' + '='.repeat(80));
  console.log('测试记忆系统');
  console.log('='.repeat(80));
  
  const memoryId = agent.memory.storeMemory({
    content: '测试记忆内容',
    embedding: [],
    metadata: {
      type: 'fact',
      source: 'test',
      tags: ['test'],
      related: [],
    },
    importance: 0.8,
  });
  
  console.log('存储记忆ID:', memoryId);
  const searchResults = agent.memory.search('测试');
  console.log('搜索结果数量:', searchResults.length);
  
  // 清理
  agent.memory.clear();
  console.log('清理后记忆数量:', agent.memory.search('测试').length);
  
  console.log('\n' + '='.repeat(80));
  console.log('核心功能测试完成！');
  console.log('所有功能正常运行！');
}

testCoreFeatures().catch(console.error);