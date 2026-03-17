// packages/server/src/routes/agents.ts
import { Hono } from 'hono';
import type { AgentConfigV2, AgentStatus, AgentInstance, AgentToolConfig, AgentSkillConfig, AgentModelConfigV2 } from '@ooda-agent/core';
import { CONSTANTS, getAgentRegistry, initializeAgentRegistry, createAgentRegistry } from '@ooda-agent/core';

const agentRoutes = new Hono();

// 初始化 AgentRegistry
const agentRegistry = getAgentRegistry();

// 初始化默认 Agent（如果没有的话）
function initializeDefaultAgents() {
  const registry = getAgentRegistry();
  
  // 检查是否已经有 Agent
  if (registry.list().length > 0) {
    return;
  }
  
  // 注册默认 Agent
  const defaultAgents: AgentConfigV2[] = [
    {
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
        name: CONSTANTS.LLM.DEFAULT_MODEL,
        provider: CONSTANTS.LLM.DEFAULT_PROVIDER,
        temperature: 0.7,
        maxTokens: 4000,
      },
      runtime: {
        maxSteps: 50,
        timeout: CONSTANTS.TIMEOUT.AGENT_DEFAULT,
        retryPolicy: {
          maxRetries: 3,
          backoff: 'exponential',
        },
      },
      enabled: true,
    },
    {
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
        name: CONSTANTS.LLM.DEFAULT_MODEL,
        provider: CONSTANTS.LLM.DEFAULT_PROVIDER,
        temperature: 0.3,
        maxTokens: 8000,
      },
      runtime: {
        maxSteps: 100,
        timeout: CONSTANTS.TIMEOUT.AGENT_CODER,
      },
      enabled: true,
    },
    {
      name: 'researcher',
      displayName: 'Research Assistant',
      description: 'Helps with research, analysis and information gathering',
      metadata: {
        icon: '🔍',
        tags: ['research', 'analysis'],
        version: '1.0.0',
      },
      systemPrompt: 'You are a research assistant that helps gather information, analyze data, and provide comprehensive reports.',
      tools: { allowed: ['*'] },
      skills: { allowed: ['*'], autoInitialize: true },
      model: {
        name: CONSTANTS.LLM.DEFAULT_MODEL,
        provider: CONSTANTS.LLM.DEFAULT_PROVIDER,
        temperature: 0.5,
        maxTokens: 6000,
      },
      runtime: {
        maxSteps: 80,
        timeout: CONSTANTS.TIMEOUT.AGENT_RESEARCHER,
      },
      enabled: true,
    },
    {
      name: 'writer',
      displayName: 'Content Writer',
      description: 'Specialized in writing, editing and creative content',
      metadata: {
        icon: '✍️',
        tags: ['writing', 'content'],
        version: '1.0.0',
      },
      systemPrompt: 'You are a professional writer specializing in creating engaging content, editing, and creative writing.',
      tools: { allowed: ['*'] },
      skills: { allowed: ['*'], autoInitialize: true },
      model: {
        name: CONSTANTS.LLM.DEFAULT_MODEL,
        provider: CONSTANTS.LLM.DEFAULT_PROVIDER,
        temperature: 0.7,
        maxTokens: 6000,
      },
      runtime: {
        maxSteps: 60,
        timeout: CONSTANTS.TIMEOUT.AGENT_WRITER,
      },
      enabled: true,
    },
    {
      name: 'architect',
      displayName: 'System Architect',
      description: 'Helps design system architecture and technical solutions',
      metadata: {
        icon: '🏗️',
        tags: ['architecture', 'design'],
        version: '1.0.0',
      },
      systemPrompt: 'You are a system architect specializing in designing scalable, maintainable systems and technical solutions.',
      tools: { allowed: ['*'] },
      skills: { allowed: ['*'], autoInitialize: true },
      model: {
        name: CONSTANTS.LLM.DEFAULT_MODEL,
        provider: CONSTANTS.LLM.DEFAULT_PROVIDER,
        temperature: 0.4,
        maxTokens: 8000,
      },
      runtime: {
        maxSteps: 100,
        timeout: CONSTANTS.TIMEOUT.AGENT_ARCHITECT,
      },
      enabled: true,
    },
  ];
  
  // 注册所有默认 Agent
  for (const agent of defaultAgents) {
    try {
      registry.register(agent);
    } catch (e) {
      // Agent 已存在，跳过
    }
  }
}

// 初始化默认 Agent
initializeDefaultAgents();

// 当前默认 Agent
let defaultAgentName: string = 'default';

// GET /api/agents - 获取所有 Agent
agentRoutes.get('/', async (c) => {
  const agentList = agentRegistry.list();
  return c.json({
    agents: agentList,
    default: defaultAgentName,
  });
});

// GET /api/agents/:name - 获取单个 Agent
agentRoutes.get('/:name', async (c) => {
  const name = c.req.param('name');
  const agent = agentRegistry.get(name);
  
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
  
  if (agentRegistry.get(body.name)) {
    return c.json({ error: 'Agent already exists' }, 409);
  }
  
  const newConfig: AgentConfigV2 = {
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
      name: CONSTANTS.LLM.DEFAULT_MODEL,
      provider: CONSTANTS.LLM.DEFAULT_PROVIDER,
      temperature: 0.7,
      maxTokens: 4000,
    },
    mcpServers: body.mcpServers,
    extends: body.extends,
    runtime: body.runtime || {
      maxSteps: 50,
      timeout: CONSTANTS.TIMEOUT.AGENT_DEFAULT,
    },
    enabled: body.enabled !== false,
  };
  
  agentRegistry.register(newConfig);
  
  const agent = agentRegistry.get(body.name);
  return c.json(agent, 201);
});

// PATCH /api/agents/:name - 更新 Agent
agentRoutes.patch('/:name', async (c) => {
  const name = c.req.param('name');
  const agent = agentRegistry.get(name);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  const body = await c.req.json();
  
  // 更新配置
  agentRegistry.updateConfig(name, body);
  
  const updatedAgent = agentRegistry.get(name);
  return c.json(updatedAgent);
});

// DELETE /api/agents/:name - 删除 Agent
agentRoutes.delete('/:name', async (c) => {
  const name = c.req.param('name');
  
  if (!agentRegistry.get(name)) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  if (name === 'default') {
    return c.json({ error: 'Cannot delete default agent' }, 400);
  }
  
  agentRegistry.unregister(name);
  
  // 如果删除的是默认 Agent，重置为 default
  if (defaultAgentName === name) {
    defaultAgentName = 'default';
  }
  
  return c.json({ success: true });
});

// POST /api/agents/:name/enable - 启用 Agent
agentRoutes.post('/:name/enable', async (c) => {
  const name = c.req.param('name');
  const agent = agentRegistry.get(name);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  agentRegistry.enable(name);
  
  const updatedAgent = agentRegistry.get(name);
  return c.json(updatedAgent);
});

// POST /api/agents/:name/disable - 禁用 Agent
agentRoutes.post('/:name/disable', async (c) => {
  const name = c.req.param('name');
  const agent = agentRegistry.get(name);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  agentRegistry.disable(name);
  
  const updatedAgent = agentRegistry.get(name);
  return c.json(updatedAgent);
});

// POST /api/agents/default - 设置默认 Agent
agentRoutes.post('/default', async (c) => {
  const body = await c.req.json();
  const { name } = body;
  
  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }
  
  const agent = agentRegistry.get(name);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  if (!agent.config.enabled) {
    return c.json({ error: 'Cannot set disabled agent as default' }, 400);
  }
  
  defaultAgentName = name;
  
  return c.json({ success: true });
});

export { agentRoutes };
