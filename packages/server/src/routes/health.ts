// 健康检查和诊断路由

import { Hono } from 'hono';
import { getDiagnosticsEngine } from '@ooda-agent/core';

const app = new Hono();

// 基础健康检查
app.get('/', async (c) => {
  const engine = getDiagnosticsEngine();
  const health = await engine.getHealthStatus();

  return c.json({
    status: health.status,
    uptime: health.uptime,
    version: health.version,
    timestamp: Date.now(),
  });
});

// 详细健康检查
app.get('/detailed', async (c) => {
  const engine = getDiagnosticsEngine();
  const health = await engine.getHealthStatus();

  return c.json({
    status: health.status,
    uptime: health.uptime,
    version: health.version,
    timestamp: Date.now(),
    checks: health.checks,
  });
});

// 运行诊断检查
app.post('/diagnose', async (c) => {
  const body = await c.req.json<{ autoFix?: boolean }>().catch(() => ({ autoFix: false })) as { autoFix?: boolean };
  const engine = getDiagnosticsEngine();

  const report = await engine.runDiagnostics({
    autoFix: body.autoFix ?? false,
  });

  return c.json(report);
});

// 获取诊断报告（只读）
app.get('/diagnose', async (c) => {
  const engine = getDiagnosticsEngine();
  const report = await engine.runDiagnostics({ autoFix: false });

  return c.json(report);
});

export default app;
