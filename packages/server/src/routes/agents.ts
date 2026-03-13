// packages/server/src/routes/agents.ts
import { Hono } from 'hono';
import type { AgentConfigV2, AgentStatus, AgentInstance, AgentToolConfig, AgentSkillConfig, AgentModelConfigV2 } from '@ooda-agent/core';

const agentRoutes = new Hono();

// 内存存储的 Agent 配置
let agents: Map<string, AgentInstance> = new Map();
let defaultAgent: string = 'default';

const DEFAULT_AGENTS: AgentInstance[] = [
  {
    config: {
      name: 'default',
      displayName: 'Default Agent',
      description: 'Default OODA Agent with full capabilities',
      metadata: {
        icon: '🤖',
        tags: ['default', 'full-featured'],
        version: '1.0.0',
      },
      triggers: {
        keywords: [],
        autoStart: true,
      },
      systemPrompt: 'You are a helpful AI assistant that can use various tools to help users.',
      tools: { allowed: ['*'] },
      skills: { allowed: ['*'], autoInitialize: true },
      model: {
        name: 'moonshot-v1-8k',
        provider: 'Kimi',
        temperature: 0.7,
        maxTokens: 4000,
      },
      runtime: {
        maxSteps: 50,
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoff: 'exponential',
        },
      },
      enabled: true,
    },
    status: 'idle',
    usageCount: 0,
  },
  {
    config: {
      name: 'coder',
      displayName: 'Code Expert',
      description: 'Specialized in code analysis and generation',
      metadata: {
        icon: '👨‍💻',
        tags: ['code', 'developer'],
        version: '1.0.0',
      },
      systemPrompt: 'You are an expert programmer specializing in code analysis, generation, and refactoring.',
      tools: { allowed: ['*'] },
      skills: { allowed: ['*'], autoInitialize: true },
      model: {
        name: 'moonshot-v1-8k',
        provider: 'Kimi',
        temperature: 0.3,
        maxTokens: 8000,
      },
      runtime: {
        maxSteps: 100,
        timeout: 600000,
      },
      enabled: true,
    },
    status: 'idle',
    usageCount: 0,
  },
];

// 初始化默认 Agent
DEFAULT_AGENTS.forEach(agent => agents.set(agent.config.name, agent));

// GET /api/agents - 获取所有 Agent
agentRoutes.get('/', async (c) => {
  const agentList = Array.from(agents.values());
  return c.json({
    agents: agentList,
    default: defaultAgent,
  });
});

// GET /api/agents/:name - 获取单个 Agent
agentRoutes.get('/:name', async (c) => {
  const name = c.req.param('name');
  const agent = agents.get(name);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  return c.json(agent);
});

// POST /api/agents - 创建新 Agent
agentRoutes.post('/', async (c) => {
  const body = await c.req.json();
  
  if (!body.name || !body.description || !body.systemPrompt) {
    return c.json({ error: 'name, description, and systemPrompt are required' }, 400);
  }
  
  if (agents.has(body.name)) {
    return c.json({ error: 'Agent already exists' }, 409);
  }
  
  const newAgent: AgentInstance = {
    config: {
      name: body.name,
      displayName: body.displayName || body.name,
      description: body.description,
      metadata: body.metadata || {},
      triggers: body.triggers || {},
      systemPrompt: body.systemPrompt,
      systemPromptFile: body.systemPromptFile,
      tools: body.tools || { allowed: [] },
      skills: body.skills || { allowed: [], autoInitialize: true },
      permissions: body.permissions,
      model: body.model || {
        name: 'moonshot-v1-8k',
        provider: 'Kimi',
        temperature: 0.7,
        maxTokens: 4000,
      },
      mcpServers: body.mcpServers,
      extends: body.extends,
      runtime: body.runtime || {
        maxSteps: 50,
        timeout: 300000,
      },
      enabled: body.enabled !== false,
    },
    status: 'idle',
    usageCount: 0,
  };
  
  agents.set(body.name, newAgent);
  
  return c.json(newAgent, 201);
});

// PATCH /api/agents/:name - 更新 Agent
agentRoutes.patch('/:name', async (c) => {
  const name = c.req.param('name');
  const agent = agents.get(name);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  const body = await c.req.json();
  
  // 更新配置
  agent.config = {
    ...agent.config,
    ...body,
    name: name, // 保持 name 不变
  };
  
  agents.set(name, agent);
  
  return c.json(agent);
});

// DELETE /api/agents/:name - 删除 Agent
agentRoutes.delete('/:name', async (c) => {
  const name = c.req.param('name');
  
  if (!agents.has(name)) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  if (name === 'default') {
    return c.json({ error: 'Cannot delete default agent' }, 400);
  }
  
  agents.delete(name);
  
  // 如果删除的是默认 Agent，重置为 default
  if (defaultAgent === name) {
    defaultAgent = 'default';
  }
  
  return c.json({ success: true });
});

// POST /api/agents/:name/enable - 启用 Agent
agentRoutes.post('/:name/enable', async (c) => {
  const name = c.req.param('name');
  const agent = agents.get(name);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  agent.config.enabled = true;
  agent.status = 'idle';
  agents.set(name, agent);
  
  return c.json(agent);
});

// POST /api/agents/:name/disable - 禁用 Agent
agentRoutes.post('/:name/disable', async (c) => {
  const name = c.req.param('name');
  const agent = agents.get(name);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  agent.config.enabled = false;
  agent.status = 'disabled';
  agents.set(name, agent);
  
  return c.json(agent);
});

// POST /api/agents/default - 设置默认 Agent
agentRoutes.post('/default', async (c) => {
  const body = await c.req.json();
  const { name } = body;
  
  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }
  
  const agent = agents.get(name);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  if (!agent.config.enabled) {
    return c.json({ error: 'Cannot set disabled agent as default' }, 400);
  }
  
  defaultAgent = name;
  
  return c.json({ success: true });
});

export { agentRoutes };
