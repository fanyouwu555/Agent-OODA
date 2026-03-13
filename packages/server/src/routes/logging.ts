// packages/server/src/routes/logging.ts
// 日志控制 API 路由

import { Hono } from 'hono';
import { detailedLogger, LogLevel, LogCategory } from '../utils/detailed-logger';

const loggingRoutes = new Hono();

// 获取日志状态
loggingRoutes.get('/status', (c) => {
  const stats = detailedLogger.getStats();
  return c.json({
    enabled: stats.enabled,
    level: stats.level,
    categories: stats.categories,
    logDir: stats.logDir,
    totalEntries: stats.total,
    fileEnabled: detailedLogger.isFileEnabled(),
  });
});

// 获取日志统计信息
loggingRoutes.get('/stats', (c) => {
  const stats = detailedLogger.getStats();
  return c.json(stats);
});

// 获取日志条目
loggingRoutes.get('/entries', (c) => {
  const level = c.req.query('level') as LogLevel | undefined;
  const category = c.req.query('category') as LogCategory | undefined;
  const sessionId = c.req.query('sessionId') || undefined;
  const limit = parseInt(c.req.query('limit') || '100', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const entries = detailedLogger.getEntries({
    level,
    category,
    sessionId,
    limit: Math.min(limit, 1000),
    offset,
  });

  return c.json({ entries, total: entries.length });
});

// 启用/禁用日志
loggingRoutes.post('/toggle', async (c) => {
  const body = await c.req.json();
  const { enabled } = body;

  if (typeof enabled !== 'boolean') {
    return c.json({ error: 'enabled must be a boolean' }, 400);
  }

  detailedLogger.setEnabled(enabled);
  return c.json({ success: true, enabled: detailedLogger.isEnabled() });
});

// 设置日志级别
loggingRoutes.post('/level', async (c) => {
  const body = await c.req.json();
  const { level } = body as { level: LogLevel };

  const validLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
  if (!validLevels.includes(level)) {
    return c.json({ 
      error: `Invalid level. Valid levels: ${validLevels.join(', ')}` 
    }, 400);
  }

  detailedLogger.setLevel(level);
  return c.json({ success: true, level: detailedLogger.getLevel() });
});

// 设置分类日志开关
loggingRoutes.post('/categories', async (c) => {
  const body = await c.req.json();
  const { categories } = body as { categories: Partial<Record<LogCategory, boolean>> };

  if (!categories || typeof categories !== 'object') {
    return c.json({ error: 'categories must be an object' }, 400);
  }

  detailedLogger.setCategories(categories);
  return c.json({ success: true, categories: detailedLogger.getCategories() });
});

// 设置单个分类
loggingRoutes.post('/category/:name/toggle', async (c) => {
  const categoryName = c.req.param('name').toUpperCase() as LogCategory;
  const body = await c.req.json();
  const { enabled } = body;

  const validCategories: LogCategory[] = [
    'OODA', 'SERVER', 'SSE', 'WEBSOCKET', 'HTTP', 'TOOL', 
    'SKILL', 'MEMORY', 'DB', 'PERMISSION', 'CONFIG', 'SYSTEM'
  ];

  if (!validCategories.includes(categoryName)) {
    return c.json({ 
      error: `Invalid category. Valid categories: ${validCategories.join(', ')}` 
    }, 400);
  }

  if (typeof enabled !== 'boolean') {
    return c.json({ error: 'enabled must be a boolean' }, 400);
  }

  detailedLogger.setCategoryEnabled(categoryName, enabled);
  return c.json({ 
    success: true, 
    category: categoryName, 
    enabled: detailedLogger.getCategories()[categoryName] 
  });
});

// 启用/禁用文件日志
loggingRoutes.post('/file/toggle', async (c) => {
  const body = await c.req.json();
  const { enabled } = body;

  if (typeof enabled !== 'boolean') {
    return c.json({ error: 'enabled must be a boolean' }, 400);
  }

  detailedLogger.setFileEnabled(enabled);
  return c.json({ success: true, fileEnabled: detailedLogger.isFileEnabled() });
});

// 清除内存日志
loggingRoutes.post('/clear/memory', (c) => {
  const count = detailedLogger.clearMemory();
  return c.json({ success: true, cleared: count });
});

// 清除日志文件
loggingRoutes.post('/clear/files', async (c) => {
  const result = await detailedLogger.clearFiles();
  return c.json({ success: true, ...result });
});

// 清除所有日志
loggingRoutes.post('/clear/all', async (c) => {
  const result = await detailedLogger.clearAll();
  return c.json({ success: true, ...result });
});

// 导出日志
loggingRoutes.post('/export', async (c) => {
  const body = await c.req.json();
  const { 
    level, 
    category, 
    sessionId, 
    startTime, 
    endTime, 
    format 
  } = body as {
    level?: LogLevel;
    category?: LogCategory;
    sessionId?: string;
    startTime?: string;
    endTime?: string;
    format?: 'json' | 'text';
  };

  const logData = await detailedLogger.exportLog({
    level,
    category,
    sessionId,
    startTime,
    endTime,
    format: format || 'json',
  });

  return c.json({ 
    success: true, 
    format: format || 'json', 
    data: logData 
  });
});

// 获取日志文件列表
loggingRoutes.get('/files', async (c) => {
  const files = await detailedLogger.getLogFiles();
  return c.json({ files, logDir: detailedLogger.getLogFilePath() });
});

export { loggingRoutes };
export default loggingRoutes;