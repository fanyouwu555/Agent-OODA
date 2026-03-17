// packages/server/src/routes/tools.ts
import { Hono } from 'hono';
import { getToolRegistry } from '@ooda-agent/core';

const toolRoutes = new Hono();

// GET /api/tools - 获取所有工具
toolRoutes.get('/', async (c) => {
  const registry = getToolRegistry();
  const tools = registry.list();
  const groups = registry.listGroups();
  
  return c.json({
    tools,
    groups,
  });
});

// GET /api/tools/:name - 获取单个工具
toolRoutes.get('/:name', async (c) => {
  const name = c.req.param('name');
  const registry = getToolRegistry();
  const tool = registry.get(name);
  
  if (!tool) {
    return c.json({ error: 'Tool not found' }, 404);
  }
  
  return c.json(tool);
});

// GET /api/tools/groups - 获取工具分组
toolRoutes.get('/groups', async (c) => {
  const registry = getToolRegistry();
  const groups = registry.listGroups();
  
  return c.json(groups);
});

export { toolRoutes };
