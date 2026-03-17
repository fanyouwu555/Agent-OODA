// packages/server/src/routes/permissions.ts
import { Hono } from 'hono';
import { 
  getPermissionManager, 
  PermissionMode, 
  DEFAULT_PERMISSION_CONFIG,
  PermissionManager 
} from '@ooda-agent/core';
import { getToolRegistry } from '@ooda-agent/core';

const permissionRoutes = new Hono();

// 内存存储的权限配置（实际项目中可以持久化到数据库）
interface StoredPermissionConfig {
  global: {
    defaultMode: PermissionMode;
    tools: Record<string, PermissionMode>;
    skills: Record<string, PermissionMode>;
  };
  agents: Record<string, {
    inherit?: boolean;
    tools?: Record<string, PermissionMode>;
    skills?: Record<string, PermissionMode>;
    patterns?: Array<{
      pattern: string;
      mode: PermissionMode;
      conditions?: Array<{
        type: string;
        operator: string;
        value: string;
      }>;
    }>;
  }>;
  groups: Record<string, Record<string, PermissionMode>>;
}

let storedPermissionConfig: StoredPermissionConfig = {
  global: {
    defaultMode: PermissionMode.ASK,
    tools: {
      // 读取类操作 - 默认允许
      'file:read': PermissionMode.ALLOW,
      'grep': PermissionMode.ALLOW,
      'glob': PermissionMode.ALLOW,
      'list': PermissionMode.ALLOW,
      
      // 写入类操作 - 需要确认
      'file:write': PermissionMode.ASK,
      'edit': PermissionMode.ASK,
      
      // 危险操作 - 需要确认或拒绝
      'bash:run': PermissionMode.ASK,
      'file:delete': PermissionMode.DENY,
      
      // 网络操作 - 默认允许
      'web:fetch': PermissionMode.ALLOW,
      'web:search': PermissionMode.ALLOW,
      'web_search': PermissionMode.ALLOW,
      'web_fetch': PermissionMode.ALLOW,
    },
    skills: {
      'skill-read': PermissionMode.ALLOW,
      'skill-write': PermissionMode.ASK,
    },
  },
  
  // 默认 Agent - 继承全局权限
  agents: {
    'default': {
      inherit: true,
      tools: {},
      skills: {},
    }
  },
  
  groups: {
    'safe-tools': {
      'file:read': PermissionMode.ALLOW,
      'grep': PermissionMode.ALLOW,
      'glob': PermissionMode.ALLOW,
      'web:fetch': PermissionMode.ALLOW,
      'web:search': PermissionMode.ALLOW,
      'web_search': PermissionMode.ALLOW,
      'web_fetch': PermissionMode.ALLOW,
    },
    'dangerous-tools': {
      'file:delete': PermissionMode.DENY,
      'bash:run': PermissionMode.DENY,
    },
  },
};

// GET /api/permissions - 获取权限配置
permissionRoutes.get('/', async (c) => {
  return c.json({
    config: storedPermissionConfig,
  });
});

// PATCH /api/permissions/global - 更新全局权限
permissionRoutes.patch('/global', async (c) => {
  const body = await c.req.json();
  const { tool, mode } = body;
  
  if (!tool || !mode) {
    return c.json({ error: 'tool and mode are required' }, 400);
  }
  
  if (!['allow', 'deny', 'ask'].includes(mode)) {
    return c.json({ error: 'Invalid mode. Must be allow, deny, or ask' }, 400);
  }
  
  // 判断是工具还是技能
  if (tool.includes('skill-')) {
    storedPermissionConfig.global.skills[tool] = mode as PermissionMode;
  } else {
    storedPermissionConfig.global.tools[tool] = mode as PermissionMode;
  }
  
  // 更新 PermissionManager
  const pm = getPermissionManager();
  pm.updateGlobalPermission(tool, mode as PermissionMode);
  
  return c.json({ success: true });
});

// PATCH /api/permissions/agents/:agent - 更新 Agent 权限
permissionRoutes.patch('/agents/:agent', async (c) => {
  const agent = c.req.param('agent');
  const body = await c.req.json();
  const { tool, mode } = body;
  
  if (!tool || !mode) {
    return c.json({ error: 'tool and mode are required' }, 400);
  }
  
  if (!['allow', 'deny', 'ask'].includes(mode)) {
    return c.json({ error: 'Invalid mode. Must be allow, deny, or ask' }, 400);
  }
  
  // 初始化 Agent 配置（如果不存在）
  if (!storedPermissionConfig.agents[agent]) {
    storedPermissionConfig.agents[agent] = {
      inherit: true,
      tools: {},
      skills: {},
    };
  }
  
  // 判断是工具还是技能
  if (tool.includes('skill-')) {
    storedPermissionConfig.agents[agent].skills![tool] = mode as PermissionMode;
  } else {
    storedPermissionConfig.agents[agent].tools![tool] = mode as PermissionMode;
  }
  
  return c.json({ success: true });
});

// DELETE /api/permissions/agents/:agent - 删除 Agent 权限配置
permissionRoutes.delete('/agents/:agent', async (c) => {
  const agent = c.req.param('agent');
  
  if (storedPermissionConfig.agents[agent]) {
    delete storedPermissionConfig.agents[agent];
  }
  
  return c.json({ success: true });
});

// GET /api/permissions/tools - 获取工具列表及其权限状态
permissionRoutes.get('/tools', async (c) => {
  const registry = getToolRegistry();
  const tools = registry.list();
  
  const toolPermissions = tools.map(tool => ({
    name: tool.name,
    type: tool.type,
    category: tool.category,
    defaultPermissionMode: tool.defaultPermissionMode || storedPermissionConfig.global.defaultMode,
  }));
  
  return c.json({ tools: toolPermissions });
});

export { permissionRoutes };
