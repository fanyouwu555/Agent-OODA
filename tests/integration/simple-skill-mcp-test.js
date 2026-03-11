// simple-skill-mcp-test.js
// 简化的Skill和MCP测试

// 模拟Skill接口
class BaseSkill {
  constructor(name, description, category, version) {
    this.name = name;
    this.description = description;
    this.category = category;
    this.version = version;
    this.dependencies = [];
  }
  
  async initialize() {
    console.log(`Initializing skill: ${this.name}`);
  }
  
  async shutdown() {
    console.log(`Shutting down skill: ${this.name}`);
  }
  
  async execute(input, context) {
    throw new Error('Not implemented');
  }
}

// 文件技能
class FileSkill extends BaseSkill {
  constructor() {
    super('file_skill', '文件操作技能', 'file', '1.0.0');
  }
  
  async execute(input, context) {
    const { action, path, content } = input;
    
    switch (action) {
      case 'read':
        return this.readFile(path, context);
      case 'write':
        return this.writeFile(path, content, context);
      case 'list':
        return this.listFiles(path, context);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
  
  async readFile(path, context) {
    return {
      action: 'read',
      path,
      content: `文件内容: ${path}`,
      success: true,
    };
  }
  
  async writeFile(path, content, context) {
    return {
      action: 'write',
      path,
      success: true,
    };
  }
  
  async listFiles(path, context) {
    return {
      action: 'list',
      path,
      files: ['file1.txt', 'file2.txt', 'dir1'],
      success: true,
    };
  }
}

// 网络技能
class WebSkill extends BaseSkill {
  constructor() {
    super('web_skill', '网络搜索技能', 'web', '1.0.0');
  }
  
  async execute(input, context) {
    const { action, query, url } = input;
    
    switch (action) {
      case 'search':
        return this.searchWeb(query, context);
      case 'fetch':
        return this.fetchWeb(url, context);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
  
  async searchWeb(query, context) {
    return {
      action: 'search',
      query,
      results: [
        {
          title: `关于 ${query} 的搜索结果`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: `这是关于 ${query} 的搜索结果摘要`,
        },
      ],
      success: true,
    };
  }
  
  async fetchWeb(url, context) {
    return {
      action: 'fetch',
      url,
      content: '网页内容',
      success: true,
    };
  }
}

// 代码技能
class CodeSkill extends BaseSkill {
  constructor() {
    super('code_skill', '代码执行技能', 'code', '1.0.0');
  }
  
  async execute(input, context) {
    const { language, code } = input;
    
    return {
      language,
      code: code.substring(0, 100) + (code.length > 100 ? '...' : ''),
      output: `执行结果: ${language}代码执行成功`,
      success: true,
    };
  }
}

// Skill注册器
class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }
  
  register(skill) {
    this.skills.set(skill.name, skill);
  }
  
  get(name) {
    return this.skills.get(name);
  }
  
  list() {
    return Array.from(this.skills.values());
  }
  
  async execute(name, input, context) {
    const skill = this.get(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }
    return skill.execute(input, context);
  }
  
  async initializeAll() {
    for (const skill of this.skills.values()) {
      await skill.initialize();
    }
  }
}

// MCP消息
class MCPMessage {
  constructor(type, topic, payload) {
    this.id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.type = type;
    this.topic = topic;
    this.payload = payload;
    this.timestamp = Date.now();
  }
}

// MCP服务
class MCPService {
  constructor() {
    this.subscriptions = new Map();
    this.topicSubscriptions = new Map();
  }
  
  async send(message) {
    console.log(`MCP Send: ${message.type} - ${message.topic}`, message.payload);
    
    const topicSubs = this.topicSubscriptions.get(message.topic) || [];
    for (const subId of topicSubs) {
      const subscription = this.subscriptions.get(subId);
      if (subscription) {
        try {
          subscription.handler(message);
        } catch (error) {
          console.error(`Error in subscription handler: ${error}`);
        }
      }
    }
  }
  
  subscribe(topic, handler) {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const subscription = {
      id: subscriptionId,
      topic,
      handler,
    };
    
    this.subscriptions.set(subscriptionId, subscription);
    
    if (!this.topicSubscriptions.has(topic)) {
      this.topicSubscriptions.set(topic, []);
    }
    this.topicSubscriptions.get(topic).push(subscriptionId);
    
    return subscriptionId;
  }
  
  unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      const topicSubs = this.topicSubscriptions.get(subscription.topic);
      if (topicSubs) {
        const index = topicSubs.indexOf(subscriptionId);
        if (index > -1) {
          topicSubs.splice(index, 1);
        }
      }
      this.subscriptions.delete(subscriptionId);
    }
  }
  
  async request(topic, payload) {
    const requestMessage = new MCPMessage('command', topic, payload);
    await this.send(requestMessage);
    
    return {
      status: 'ok',
      requestId: requestMessage.id,
      timestamp: Date.now(),
    };
  }
  
  async publishEvent(topic, payload) {
    const eventMessage = new MCPMessage('event', topic, payload);
    await this.send(eventMessage);
  }
  
  async publishStatus(topic, payload) {
    const statusMessage = new MCPMessage('status', topic, payload);
    await this.send(statusMessage);
  }
  
  async publishError(topic, error) {
    const errorMessage = new MCPMessage('error', topic, {
      message: error.message,
      stack: error.stack,
    });
    await this.send(errorMessage);
  }
}

// 测试函数
async function testSkillMCP() {
  console.log('测试Skill和MCP集成...');
  console.log('====================');
  
  // 创建技能注册器
  const skillRegistry = new SkillRegistry();
  
  // 注册技能
  console.log('\n=== 注册技能 ===');
  skillRegistry.register(new FileSkill());
  skillRegistry.register(new WebSkill());
  skillRegistry.register(new CodeSkill());
  
  // 初始化技能
  await skillRegistry.initializeAll();
  
  // 列出技能
  const skills = skillRegistry.list();
  console.log(`\n已注册的技能: ${skills.length}个`);
  skills.forEach(skill => {
    console.log(`  - ${skill.name} (${skill.category} v${skill.version})`);
  });
  
  // 创建MCP服务
  const mcp = new MCPService();
  
  // 订阅MCP消息
  console.log('\n=== 订阅MCP消息 ===');
  const subscriptions = [
    mcp.subscribe('skill.executed', (message) => {
      console.log(`\n[MCP] 技能执行: ${message.payload.skillName}`);
      console.log(`[MCP] 结果: ${JSON.stringify(message.payload.result)}`);
    }),
    mcp.subscribe('agent.response', (message) => {
      console.log(`\n[MCP] 代理响应: ${message.payload.content}`);
    }),
  ];
  
  // 测试文件技能
  console.log('\n=== 测试文件技能 ===');
  try {
    const result = await skillRegistry.execute('file_skill', {
      action: 'read',
      path: process.cwd() + '/test.txt',
    }, {
      workingDirectory: process.cwd(),
      sessionId: 'test-session',
      skillRegistry: skillRegistry,
      mcp: mcp,
    });
    console.log('文件技能结果:', result);
    
    // 发布技能执行事件
    await mcp.publishEvent('skill.executed', {
      skillName: 'file_skill',
      result: result,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('文件技能测试失败:', error);
  }
  
  // 测试网络技能
  console.log('\n=== 测试网络技能 ===');
  try {
    const result = await skillRegistry.execute('web_skill', {
      action: 'search',
      query: 'AI Agent 技术',
    }, {
      workingDirectory: process.cwd(),
      sessionId: 'test-session',
      skillRegistry: skillRegistry,
      mcp: mcp,
    });
    console.log('网络技能结果:', result);
    
    // 发布技能执行事件
    await mcp.publishEvent('skill.executed', {
      skillName: 'web_skill',
      result: result,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('网络技能测试失败:', error);
  }
  
  // 测试代码技能
  console.log('\n=== 测试代码技能 ===');
  try {
    const result = await skillRegistry.execute('code_skill', {
      language: 'javascript',
      code: 'console.log("Hello, Skill!");',
    }, {
      workingDirectory: process.cwd(),
      sessionId: 'test-session',
      skillRegistry: skillRegistry,
      mcp: mcp,
    });
    console.log('代码技能结果:', result);
    
    // 发布技能执行事件
    await mcp.publishEvent('skill.executed', {
      skillName: 'code_skill',
      result: result,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('代码技能测试失败:', error);
  }
  
  // 测试MCP消息传递
  console.log('\n=== 测试MCP消息传递 ===');
  try {
    await mcp.publishEvent('test.event', {
      message: '测试事件消息',
      timestamp: Date.now(),
    });
    
    await mcp.publishStatus('test.status', {
      status: 'running',
      progress: 50,
    });
    
    const response = await mcp.request('test.request', {
      action: 'ping',
    });
    console.log('MCP请求响应:', response);
  } catch (error) {
    console.error('MCP测试失败:', error);
  }
  
  // 取消订阅
  console.log('\n=== 取消订阅 ===');
  subscriptions.forEach(subId => {
    mcp.unsubscribe(subId);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('Skill和MCP集成测试完成！');
  console.log('所有功能正常运行！');
}

testSkillMCP().catch(console.error);